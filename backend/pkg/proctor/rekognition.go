// Package proctor performs server-side interview integrity analysis using
// Amazon Rekognition. Frames captured in the browser are sent here so the
// verdict is produced by an AWS AI service rather than client-side heuristics.
package proctor

import (
	"context"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/rekognition"
	rtypes "github.com/aws/aws-sdk-go-v2/service/rekognition/types"
)

// Thresholds are exported so the reproducibility test can assert on them.
const (
	MinLabelConfidence = 60.0
	MinFaceConfidence  = 90.0
	MaxYawDegrees      = 28.0
	MaxPitchDegrees    = 22.0
)

// deviceLabels are Rekognition labels that indicate a second screen or phone in frame.
var deviceLabels = map[string]bool{
	"mobile phone":    true,
	"cell phone":      true,
	"phone":           true,
	"telephone":       true,
	"iphone":          true,
	"smartphone":      true,
	"tablet computer": true,
	"laptop":          true,
	"computer":        true,
	"screen":          true,
	"monitor":         true,
	"display":         true,
	"television":      true,
}

// referenceLabels indicate notes or printed material held up during the interview.
var referenceLabels = map[string]bool{
	"book":     true,
	"paper":    true,
	"document": true,
	"page":     true,
	"text":     true,
	"notebook": true,
}

// Detection is a single Rekognition label with its confidence.
type Detection struct {
	Label      string  `json:"label"`
	Confidence float64 `json:"confidence"`
}

// Analysis is the structured integrity verdict for one frame.
type Analysis struct {
	Provider     string      `json:"provider"`
	Verdict      string      `json:"verdict"`
	EventType    string      `json:"event_type,omitempty"`
	Details      string      `json:"details"`
	FaceCount    int         `json:"face_count"`
	YawDegrees   float64     `json:"yaw_degrees"`
	PitchDegrees float64     `json:"pitch_degrees"`
	EyesOpen     bool        `json:"eyes_open"`
	Labels       []Detection `json:"labels"`
	Flagged      []Detection `json:"flagged"`
	LatencyMs    int64       `json:"latency_ms"`
	AnalyzedAt   string      `json:"analyzed_at"`
}

// Client wraps the Rekognition API.
type Client struct {
	API   *rekognition.Client
	Ready bool
}

var (
	defaultClient *Client
	initOnce      sync.Once
)

// GetClient returns a lazily initialised shared client.
func GetClient() *Client {
	initOnce.Do(func() { defaultClient = NewClient() })
	return defaultClient
}

// Available reports whether AWS credentials are configured for Rekognition.
func Available() bool {
	if os.Getenv("PROCTOR_PROVIDER") == "local" {
		return false
	}
	return os.Getenv("AWS_ACCESS_KEY_ID") != "" || os.Getenv("AWS_PROFILE") != ""
}

func region() string {
	if r := os.Getenv("AWS_REGION"); r != "" {
		return r
	}
	if r := os.Getenv("AWS_S3_REGION"); r != "" {
		return r
	}
	return "us-east-1"
}

// NewClient builds a Rekognition client from the ambient AWS config.
func NewClient() *Client {
	if !Available() {
		return &Client{Ready: false}
	}
	cfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(region()))
	if err != nil {
		log.Printf("[Rekognition] config load failed: %v", err)
		return &Client{Ready: false}
	}
	log.Println("[Rekognition] proctoring client ready")
	return &Client{API: rekognition.NewFromConfig(cfg), Ready: true}
}

// Analyze runs DetectLabels + DetectFaces on a JPEG frame and returns a verdict.
func (c *Client) Analyze(ctx context.Context, jpeg []byte) (*Analysis, error) {
	if c == nil || !c.Ready || c.API == nil {
		return nil, fmt.Errorf("rekognition client not configured")
	}
	if len(jpeg) == 0 {
		return nil, fmt.Errorf("empty frame")
	}

	start := time.Now()
	image := &rtypes.Image{Bytes: jpeg}

	labelsOut, err := c.API.DetectLabels(ctx, &rekognition.DetectLabelsInput{
		Image:         image,
		MaxLabels:     aws.Int32(30),
		MinConfidence: aws.Float32(MinLabelConfidence),
	})
	if err != nil {
		return nil, fmt.Errorf("detect labels: %w", err)
	}

	facesOut, err := c.API.DetectFaces(ctx, &rekognition.DetectFacesInput{
		Image:      image,
		Attributes: []rtypes.Attribute{rtypes.AttributeAll},
	})
	if err != nil {
		return nil, fmt.Errorf("detect faces: %w", err)
	}

	analysis := buildAnalysis(labelsOut.Labels, facesOut.FaceDetails)
	analysis.LatencyMs = time.Since(start).Milliseconds()
	analysis.AnalyzedAt = time.Now().UTC().Format(time.RFC3339)
	return analysis, nil
}

// buildAnalysis is pure logic over API results so it can be unit tested offline.
func buildAnalysis(labels []rtypes.Label, faces []rtypes.FaceDetail) *Analysis {
	a := &Analysis{Provider: "aws_rekognition", Verdict: "ok"}

	for _, l := range labels {
		if l.Name == nil || l.Confidence == nil {
			continue
		}
		det := Detection{Label: *l.Name, Confidence: float64(*l.Confidence)}
		a.Labels = append(a.Labels, det)
		key := strings.ToLower(det.Label)
		if deviceLabels[key] || referenceLabels[key] {
			a.Flagged = append(a.Flagged, det)
		}
	}
	sort.SliceStable(a.Flagged, func(i, j int) bool {
		return a.Flagged[i].Confidence > a.Flagged[j].Confidence
	})

	for _, f := range faces {
		if f.Confidence != nil && float64(*f.Confidence) < MinFaceConfidence {
			continue
		}
		a.FaceCount++
		if a.FaceCount == 1 {
			if f.Pose != nil {
				if f.Pose.Yaw != nil {
					a.YawDegrees = float64(*f.Pose.Yaw)
				}
				if f.Pose.Pitch != nil {
					a.PitchDegrees = float64(*f.Pose.Pitch)
				}
			}
			if f.EyesOpen != nil {
				a.EyesOpen = f.EyesOpen.Value
			}
		}
	}

	switch {
	case len(a.Flagged) > 0:
		top := a.Flagged[0]
		a.Verdict = "device_detected"
		a.EventType = "phone_detected"
		a.Details = fmt.Sprintf("Amazon Rekognition detected %q in frame (%.1f%% confidence) — unauthorized material during proctored interview", top.Label, top.Confidence)
	case a.FaceCount == 0:
		a.Verdict = "no_face"
		a.EventType = "look_away"
		a.Details = "Amazon Rekognition found no face in frame — candidate left the camera"
	case a.FaceCount > 1:
		a.Verdict = "multiple_faces"
		a.EventType = "multiple_faces"
		a.Details = fmt.Sprintf("Amazon Rekognition detected %d faces — possible coaching or second person present", a.FaceCount)
	case absF(a.YawDegrees) > MaxYawDegrees || absF(a.PitchDegrees) > MaxPitchDegrees:
		a.Verdict = "gaze_away"
		a.EventType = "look_away"
		a.Details = fmt.Sprintf("Amazon Rekognition head pose off-screen (yaw %.0f°, pitch %.0f°)", a.YawDegrees, a.PitchDegrees)
	default:
		a.Details = fmt.Sprintf("Amazon Rekognition verified 1 face on camera (yaw %.0f°, pitch %.0f°)", a.YawDegrees, a.PitchDegrees)
	}

	return a
}

func absF(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
