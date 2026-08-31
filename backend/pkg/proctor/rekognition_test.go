package proctor

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	rtypes "github.com/aws/aws-sdk-go-v2/service/rekognition/types"
)

func label(name string, conf float32) rtypes.Label {
	return rtypes.Label{Name: aws.String(name), Confidence: aws.Float32(conf)}
}

func face(yaw, pitch float32) rtypes.FaceDetail {
	return rtypes.FaceDetail{
		Confidence: aws.Float32(99.5),
		Pose:       &rtypes.Pose{Yaw: aws.Float32(yaw), Pitch: aws.Float32(pitch)},
		EyesOpen:   &rtypes.EyeOpen{Value: true},
	}
}

func TestCleanFramePasses(t *testing.T) {
	got := buildAnalysis(
		[]rtypes.Label{label("Person", 99.1), label("Face", 98.0)},
		[]rtypes.FaceDetail{face(4, -3)},
	)
	if got.Verdict != "ok" {
		t.Fatalf("expected ok verdict, got %q (%s)", got.Verdict, got.Details)
	}
	if got.FaceCount != 1 {
		t.Fatalf("expected 1 face, got %d", got.FaceCount)
	}
	if got.EventType != "" {
		t.Fatalf("clean frame should not raise an event, got %q", got.EventType)
	}
}

func TestHeldElectronicsIsFlagged(t *testing.T) {
	got := buildAnalysis(
		[]rtypes.Label{label("Person", 99.0), label("Electronics", 72.0)},
		[]rtypes.FaceDetail{face(0, 0)},
	)
	if got.Verdict != "device_detected" {
		t.Fatalf("expected device_detected for Electronics, got %q", got.Verdict)
	}
}

func TestSecondComputerIsFlagged(t *testing.T) {
	got := buildAnalysis(
		[]rtypes.Label{label("Person", 99.0), label("Laptop", 88.0)},
		[]rtypes.FaceDetail{face(0, 0)},
	)
	if got.Verdict != "device_detected" {
		t.Fatalf("expected device_detected for a laptop in frame, got %q", got.Verdict)
	}
}

func TestHeadphonesAreNotACheatDevice(t *testing.T) {
	got := buildAnalysis(
		[]rtypes.Label{label("Person", 99.0), label("Headphones", 94.0)},
		[]rtypes.FaceDetail{face(0, 0)},
	)
	if got.Verdict == "device_detected" {
		t.Fatalf("headphones must not flag cheating, got %q", got.Verdict)
	}
}

func TestPartialPhoneLabelIsFlagged(t *testing.T) {
	got := buildAnalysis(
		[]rtypes.Label{label("Person", 99.0), label("Phone", 51.0)},
		[]rtypes.FaceDetail{face(0, 0)},
	)
	if got.Verdict != "device_detected" {
		t.Fatalf("expected device_detected for Phone, got %q", got.Verdict)
	}
}

func TestNotesInFrameIsFlagged(t *testing.T) {
	got := buildAnalysis(
		[]rtypes.Label{label("Person", 99.0), label("Book", 88.2)},
		[]rtypes.FaceDetail{face(0, 0)},
	)
	if got.Verdict != "device_detected" {
		t.Fatalf("expected printed material to flag integrity, got %q", got.Verdict)
	}
}

func TestSecondPersonIsFlagged(t *testing.T) {
	got := buildAnalysis(
		[]rtypes.Label{label("Person", 99.0)},
		[]rtypes.FaceDetail{face(0, 0), face(6, 2)},
	)
	if got.Verdict != "multiple_faces" {
		t.Fatalf("expected multiple_faces, got %q", got.Verdict)
	}
	if got.FaceCount != 2 {
		t.Fatalf("expected 2 faces, got %d", got.FaceCount)
	}
}

func TestEmptyFrameIsFlagged(t *testing.T) {
	got := buildAnalysis(nil, nil)
	if got.Verdict != "no_face" {
		t.Fatalf("expected no_face, got %q", got.Verdict)
	}
}

func TestHeadTurnedAwayIsFlagged(t *testing.T) {
	got := buildAnalysis(
		[]rtypes.Label{label("Person", 99.0)},
		[]rtypes.FaceDetail{face(MaxYawDegrees+10, 0)},
	)
	if got.Verdict != "gaze_away" {
		t.Fatalf("expected gaze_away, got %q", got.Verdict)
	}
}

func TestLowConfidenceFaceIgnored(t *testing.T) {
	weak := rtypes.FaceDetail{Confidence: aws.Float32(40)}
	got := buildAnalysis(nil, []rtypes.FaceDetail{weak})
	if got.FaceCount != 0 {
		t.Fatalf("faces below %.0f%% confidence must be ignored, got %d", MinFaceConfidence, got.FaceCount)
	}
}
