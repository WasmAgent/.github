package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/WasmAgent/.github/agentbom"
)

// TestVerifyPostureAgainstSampleManifest validates the Milestone 1 bullet:
//
//	`agentbom/`: MCP Posture verification passes against sample agent manifest
//	(`verify-posture --manifest examples/manifest.yaml`)
//
// The CLI must exit 0 and report PASS against examples/manifest.yaml, and the
// reference package must agree.
func TestVerifyPostureAgainstSampleManifest(t *testing.T) {
	manifestPath := filepath.Join("..", "..", "examples", "manifest.yaml")
	if _, err := os.Stat(manifestPath); err != nil {
		t.Fatalf("sample agent manifest is missing: %v", err)
	}

	// Milestone contract: `verify-posture --manifest examples/manifest.yaml` passes.
	cmd := exec.Command("go", "run", filepath.Join("..", "..", "agentbom", "cmd", "verify-posture"), "--manifest", manifestPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("verify-posture failed against sample manifest: %v\n%s", err, output)
	}
	if !strings.Contains(string(output), "PASS") {
		t.Errorf("verify-posture did not report PASS against sample manifest:\n%s", output)
	}

	// Cross-check through the reference package.
	result, err := agentbom.VerifyPosture(manifestPath, agentbom.DefaultPosturePolicy())
	if err != nil {
		t.Fatalf("VerifyPosture errored: %v", err)
	}
	if !result.Pass {
		t.Errorf("VerifyPosture did not pass against sample manifest: %v", result.Findings)
	}
	if result.ServerCount != 1 {
		t.Errorf("expected 1 declared server, got %d", result.ServerCount)
	}
	if result.ToolCount != 2 {
		t.Errorf("expected 2 declared tools, got %d", result.ToolCount)
	}
}

// TestVerifyPostureRejectsOutOfPolicyManifest ensures the verifier fails
// closed when a manifest's declared MCP surface exceeds the posture policy.
func TestVerifyPostureRejectsOutOfPolicyManifest(t *testing.T) {
	manifest := &agentbom.Manifest{
		Schema:      "https://wasmagent.github.io/agent-trust-infra/schemas/agent-manifest-1.json",
		SpecVersion: "1.0",
		Metadata: agentbom.Metadata{
			AgentID: "rogue-agent",
			Name:    "Rogue Agent",
		},
		MCP: agentbom.MCPConfig{
			AuditLevel: "full",
			Servers: []agentbom.Server{
				{Name: "filesystem-server", Endpoint: "stdio"},
			},
			Tools: []agentbom.Tool{
				{
					Name:       "purge_etc",
					Category:   "file-system",
					RiskLevel:  "high",
					Path:       "/etc",
					Operations: []string{"write", "execute"},
				},
			},
		},
	}

	result := agentbom.VerifyManifest(manifest, agentbom.DefaultPosturePolicy())
	if result.Pass {
		t.Fatalf("expected out-of-policy manifest to fail verification, got PASS: %v", result.Findings)
	}

	var joined string
	for _, finding := range result.Findings {
		joined += finding + "\n"
	}
	if !strings.Contains(joined, "riskLevel") {
		t.Errorf("expected a riskLevel finding, got:\n%s", joined)
	}
	if !strings.Contains(joined, "restricted path") {
		t.Errorf("expected a restricted-path finding, got:\n%s", joined)
	}
}
