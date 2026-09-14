package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repoMeshPeersPath returns the path to the canonical mesh-peers.yaml from
// the cmd/wasmagent-mesh working directory.
func repoMeshPeersPath(t *testing.T) string {
	t.Helper()
	path := filepath.Join("..", "..", "wasmagent-ops", "federation", "mesh-peers.yaml")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("canonical mesh-peers.yaml not reachable: %v", err)
	}
	return path
}

// TestWasagentMeshSyncDryRun exercises `wasmagent-mesh sync --peers
// mesh-peers.yaml` against the canonical federation control plane config and
// asserts the validated sync plan is reported without network access.
func TestWasagentMeshSyncDryRun(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"sync", "--peers", repoMeshPeersPath(t), "--dry-run"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("wasmagent-mesh sync --dry-run exited %d: %s", code, stderr.String())
	}
	out := stdout.String()
	for _, marker := range []string{
		"wasmagent-global-mesh",
		"us-east-1",
		"eu-west-1",
		"ap-southeast-1",
		"bidirectional",
		"verify-on-sync",
		"requireSignedEvidence=true",
		"sync plan validated",
	} {
		if !strings.Contains(out, marker) {
			t.Errorf("sync dry-run output missing %q:\n%s", marker, out)
		}
	}
	if stderr.Len() != 0 {
		t.Errorf("sync dry-run wrote to stderr: %s", stderr.String())
	}
}

// TestWasagentMeshSyncRejectsMissingPeers verifies the CLI fails fast when
// the peers configuration does not exist.
func TestWasagentMeshSyncRejectsMissingPeers(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"sync", "--peers", "does-not-exist.yaml", "--dry-run"}, &stdout, &stderr)
	if code == 0 {
		t.Fatal("expected non-zero exit for missing mesh-peers.yaml")
	}
	if !strings.Contains(stderr.String(), "does-not-exist.yaml") {
		t.Errorf("stderr = %q, want it to mention the missing file", stderr.String())
	}
}

// TestWasagentMeshHelp exercises the help command.
func TestWasagentMeshHelp(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"help"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("wasmagent-mesh help exited %d: %s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "wasmagent-mesh sync --peers mesh-peers.yaml") {
		t.Errorf("help output missing usage line:\n%s", stdout.String())
	}
}
