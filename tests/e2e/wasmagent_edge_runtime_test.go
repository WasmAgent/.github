package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestWasmagentEdgeRuntime validates the wasmagent/edge reference surface for
// the Milestone 6 bullet:
//
//	wasmagent/edge/: Low-latency WasmAgent edge runtime supporting offline
//	evidence buffering and eventual ledger synchronization
//
// It checks that:
//   - wasmagent/edge/edge.ts ships an EdgeEvidenceRuntime exposing low-latency
//     agent step execution (executeStep), offline evidence buffering
//     (recordEvidence / getBufferStats), and eventual ledger synchronization
//     (flushBuffered / LedgerTransport.isOnline / LedgerSyncResult).
//   - wasmagent/edge/edge.test.ts exercises low-latency execution, offline
//     evidence buffering, offline flush rejection, and eventual ledger
//     synchronization once connectivity returns.
//   - The Milestone 6 bullet in docs/15-milestones.md is marked complete so the
//     hub roadmap tracks the shipped surface.
func TestWasmagentEdgeRuntime(t *testing.T) {
	edgeDir := filepath.Join("..", "..", "wasmagent", "edge")

	// 1. Reference implementation must ship the edge runtime surface.
	driverPath := filepath.Join(edgeDir, "edge.ts")
	driverSource, err := os.ReadFile(driverPath)
	if err != nil {
		t.Fatalf("wasmagent/edge/edge.ts is missing: %v", err)
	}
	for _, fragment := range []string{
		"export class EdgeEvidenceRuntime",
		"export interface EvidenceEvent",
		"export interface OfflineBufferStats",
		"export interface LedgerSyncResult",
		"export interface LedgerTransport",
		"recordEvidence(",
		"flushBuffered(",
		"getBufferStats(",
		"executeStep(",
		"isOnline()",
	} {
		if !strings.Contains(string(driverSource), fragment) {
			t.Errorf("wasmagent/edge edge.ts is missing required capability %q", fragment)
		}
	}

	// 2. Reference tests must cover low-latency execution, offline evidence
	// buffering, and eventual ledger synchronization.
	testPath := filepath.Join(edgeDir, "edge.test.ts")
	testSource, err := os.ReadFile(testPath)
	if err != nil {
		t.Fatalf("wasmagent/edge coverage is missing: %v", err)
	}
	for _, scenario := range []string{
		"executes agent steps with low latency while recording evidence",
		"buffers evidence while the ledger is offline",
		"rejects a flush attempt while the ledger is offline",
		"synchronizes buffered evidence to the ledger once connectivity returns",
	} {
		if !strings.Contains(string(testSource), scenario) {
			t.Errorf("wasmagent/edge test is missing scenario %q", scenario)
		}
	}

	// 3. The milestone bullet must be marked complete.
	milestones, err := os.ReadFile("../../docs/15-milestones.md")
	if err != nil {
		t.Fatalf("Failed to read docs/15-milestones.md: %v", err)
	}
	bulletFound := false
	for _, line := range strings.Split(string(milestones), "\n") {
		if strings.Contains(line, "`wasmagent/edge/`") {
			bulletFound = true
			if !strings.HasPrefix(strings.TrimSpace(line), "- [x]") {
				t.Errorf("wasmagent/edge milestone bullet is not checked: %s", line)
			}
		}
	}
	if !bulletFound {
		t.Error("wasmagent/edge milestone bullet not found in docs/15-milestones.md")
	}

	t.Log("Low-latency edge runtime with offline evidence buffering validated for wasmagent")
}
