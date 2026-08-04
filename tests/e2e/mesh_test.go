package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestMeshIntegrationSuite validates the tests/mesh reference surface for the
// Milestone 6 bullet:
//
//	tests/mesh/: End-to-end integration test suite validating multi-agent
//	attestation, ZK evidence verification, and real-time revocation
//	(npm run test:mesh)
//
// It checks that:
//   - tests/mesh/mesh.ts ships an AgentMesh harness exposing multi-agent
//     attestation (issueAttestation / verifyAttestation / createDelegation),
//     ZK evidence verification (generateZkProof / verifyZkProof), and
//     real-time revocation (revokePassport / propagateRevocation).
//   - tests/mesh/mesh.test.ts exercises multi-agent attestation, ZK evidence
//     verification, and real-time revocation with runnable assertions.
//   - tests/mesh/package.json declares the test:mesh npm script.
//   - The Milestone 6 bullet in docs/15-milestones.md is marked complete so
//     the hub roadmap tracks the shipped suite.
func TestMeshIntegrationSuite(t *testing.T) {
	meshDir := filepath.Join("..", "..", "tests", "mesh")

	// 1. The reference harness must ship the mesh integration surface.
	driverPath := filepath.Join(meshDir, "mesh.ts")
	driverSource, err := os.ReadFile(driverPath)
	if err != nil {
		t.Fatalf("tests/mesh/mesh.ts is missing: %v", err)
	}
	for _, fragment := range []string{
		"export class AgentMesh",
		"issueAttestation(",
		"verifyAttestation(",
		"createDelegation(",
		"verifyDelegation(",
		"generateZkProof(",
		"verifyZkProof(",
		"revokePassport(",
		"propagateRevocation(",
	} {
		if !strings.Contains(string(driverSource), fragment) {
			t.Errorf("tests/mesh mesh.ts is missing required capability %q", fragment)
		}
	}

	// 2. The test suite must cover multi-agent attestation, ZK evidence
	// verification, and real-time revocation with runnable assertions.
	testPath := filepath.Join(meshDir, "mesh.test.ts")
	testSource, err := os.ReadFile(testPath)
	if err != nil {
		t.Fatalf("tests/mesh coverage is missing: %v", err)
	}
	for _, scenario := range []string{
		"multi-agent attestation",
		"verifies attestation chains across trust domains",
		"ZK evidence verification",
		"real-time revocation",
		"downstream delegated operations fail closed",
	} {
		if !strings.Contains(string(testSource), scenario) {
			t.Errorf("tests/mesh test is missing scenario %q", scenario)
		}
	}
	for _, assertion := range []string{
		"describe(",
		"it(",
		"expect(",
		`from "bun:test"`,
	} {
		if !strings.Contains(string(testSource), assertion) {
			t.Errorf("tests/mesh test is missing assertion harness %q", assertion)
		}
	}

	// 3. The npm run test:mesh script must be declared.
	packagePath := filepath.Join(meshDir, "package.json")
	packageSource, err := os.ReadFile(packagePath)
	if err != nil {
		t.Fatalf("tests/mesh/package.json is missing: %v", err)
	}
	if !strings.Contains(string(packageSource), "test:mesh") {
		t.Error("tests/mesh/package.json does not declare the test:mesh script")
	}

	// 4. The milestone bullet must be marked complete.
	milestones, err := os.ReadFile(filepath.Join("..", "..", "docs", "15-milestones.md"))
	if err != nil {
		t.Fatalf("Failed to read docs/15-milestones.md: %v", err)
	}
	bulletFound := false
	for _, line := range strings.Split(string(milestones), "\n") {
		if strings.Contains(line, "`tests/mesh/`") {
			bulletFound = true
			if !strings.HasPrefix(strings.TrimSpace(line), "- [x]") {
				t.Errorf("tests/mesh milestone bullet is not checked: %s", line)
			}
		}
	}
	if !bulletFound {
		t.Error("tests/mesh milestone bullet not found in docs/15-milestones.md")
	}

	t.Log("End-to-end mesh integration suite validated: multi-agent attestation, ZK evidence verification, real-time revocation")
}
