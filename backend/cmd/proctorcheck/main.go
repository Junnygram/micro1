// Command proctorcheck verifies the Amazon Rekognition proctoring pipeline
// against real images, so reviewers can confirm the integrity verdicts are
// produced by AWS rather than by client-side guesswork.
//
//	go run ./cmd/proctorcheck path/to/clean.jpg path/to/phone.jpg
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"backend/pkg/proctor"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")

	files := os.Args[1:]
	if len(files) == 0 {
		fmt.Println("usage: go run ./cmd/proctorcheck <image.jpg> [more.jpg ...]")
		fmt.Println("       images should be webcam-style frames; try one clean and one holding a phone")
		os.Exit(2)
	}

	if !proctor.Available() {
		fmt.Println("FAIL  AWS credentials not found. Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION.")
		os.Exit(1)
	}

	client := proctor.NewClient()
	if !client.Ready {
		fmt.Println("FAIL  Could not initialise the Rekognition client.")
		os.Exit(1)
	}

	fmt.Printf("Provider: Amazon Rekognition (DetectLabels + DetectFaces)\n")
	fmt.Printf("Thresholds: label>=%.0f%% face>=%.0f%% yaw>%.0f° pitch>%.0f°\n\n",
		proctor.MinLabelConfidence, proctor.MinFaceConfidence, proctor.MaxYawDegrees, proctor.MaxPitchDegrees)

	failed := 0
	for _, path := range files {
		frame, err := os.ReadFile(path)
		if err != nil {
			fmt.Printf("FAIL  %s: %v\n", path, err)
			failed++
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		analysis, err := client.Analyze(ctx, frame)
		cancel()
		if err != nil {
			fmt.Printf("FAIL  %s: %v\n", filepath.Base(path), err)
			failed++
			continue
		}

		fmt.Printf("=== %s\n", filepath.Base(path))
		fmt.Printf("  verdict    %s\n", analysis.Verdict)
		fmt.Printf("  event      %s\n", orDash(analysis.EventType))
		fmt.Printf("  faces      %d\n", analysis.FaceCount)
		fmt.Printf("  head pose  yaw %.1f°  pitch %.1f°\n", analysis.YawDegrees, analysis.PitchDegrees)
		fmt.Printf("  latency    %dms\n", analysis.LatencyMs)
		for _, f := range analysis.Flagged {
			fmt.Printf("  FLAGGED    %-18s %.1f%%\n", f.Label, f.Confidence)
		}
		fmt.Printf("  details    %s\n", analysis.Details)

		raw, _ := json.Marshal(analysis.Labels)
		fmt.Printf("  raw labels %s\n\n", raw)
	}

	if failed > 0 {
		os.Exit(1)
	}
	fmt.Println("All frames analysed by AWS. Verdicts above are the same ones written to the candidate audit log.")
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
