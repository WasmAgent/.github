package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/WasmAgent/.github/pkg/docs"
)

// TestTracePipelineStream validates the trace-pipeline/stream reference surface
// for the Milestone 6 bullet:
//
//	trace-pipeline/stream/: Real-time gRPC telemetry and event ingestion
//	pipeline for instant posture drift detection and passport revocation
//
// It checks that:
//   - trace-pipeline/stream/stream.ts ships a TelemetryIngestPipeline exposing
//     a gRPC-style streaming connect(), per-frame event ingestion (send),
//     posture drift detection (onDrift), and Trust Passport revocation
//     (onRevocation / PassportRevokedError).
//   - trace-pipeline/stream/stream.test.ts exercises real-time ingestion,
//     posture drift detection, and passport revocation.
//   - The project index advertises the stream surface on the trace-pipeline
//     repository (the owning evidence-pipeline repo).
//   - The Milestone 6 bullet in docs/15-milestones.md is marked complete so the
//     hub roadmap tracks the shipped surface.
func TestTracePipelineStream(t *testing.T) {
	streamDir := filepath.Join("..", "..", "trace-pipeline", "stream")

	// 1. Reference implementation must ship the pipeline surface.
	driverPath := filepath.Join(streamDir, "stream.ts")
	driverSource, err := os.ReadFile(driverPath)
	if err != nil {
		t.Fatalf("trace-pipeline/stream/stream.ts is missing: %v", err)
	}
	for _, fragment := range []string{
		"export class TelemetryIngestPipeline",
		"export class PassportRevokedError",
		"export interface TelemetryEvent",
		"export interface PostureBaseline",
		"export interface DriftSignal",
		"export interface RevocationSignal",
		"connect(",
		"send(",
		"onDrift",
		"onRevocation",
	} {
		if !strings.Contains(string(driverSource), fragment) {
			t.Errorf("trace-pipeline/stream stream.ts is missing required capability %q", fragment)
		}
	}

	// 2. Reference tests must cover real-time ingestion, drift detection, and
	// passport revocation.
	testPath := filepath.Join(streamDir, "stream.test.ts")
	testSource, err := os.ReadFile(testPath)
	if err != nil {
		t.Fatalf("trace-pipeline/stream coverage is missing: %v", err)
	}
	for _, scenario := range []string{
		"ingests compliant telemetry events",
		"detects posture drift",
		"revokes the Trust Passport",
		"PassportRevokedError",
	} {
		if !strings.Contains(string(testSource), scenario) {
			t.Errorf("trace-pipeline/stream test is missing scenario %q", scenario)
		}
	}

	// 3. The project index must advertise the stream surface on the owning repo.
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}
	tracePipeline, found := projectIndex.GetRepoByName("trace-pipeline")
	if !found {
		t.Fatal("trace-pipeline repository not found in project index")
	}
	summary := strings.ToLower(tracePipeline.Summary)
	for _, keyword := range []string{"stream", "telemetry", "drift", "revocation"} {
		if !strings.Contains(summary, keyword) {
			t.Errorf("trace-pipeline summary does not mention %q: %s", keyword, tracePipeline.Summary)
		}
	}

	// 4. The milestone bullet must be marked complete.
	milestones, err := os.ReadFile("../../docs/15-milestones.md")
	if err != nil {
		t.Fatalf("Failed to read docs/15-milestones.md: %v", err)
	}
	bulletFound := false
	for _, line := range strings.Split(string(milestones), "\n") {
		if strings.Contains(line, "`trace-pipeline/stream/`") {
			bulletFound = true
			if !strings.HasPrefix(strings.TrimSpace(line), "- [x]") {
				t.Errorf("trace-pipeline/stream milestone bullet is not checked: %s", line)
			}
		}
	}
	if !bulletFound {
		t.Error("trace-pipeline/stream milestone bullet not found in docs/15-milestones.md")
	}

	t.Log("Real-time gRPC telemetry and event ingestion pipeline validated for trace-pipeline")
}
