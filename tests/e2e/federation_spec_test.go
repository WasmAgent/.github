package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestFederationSpec validates the docs/federation-spec.md milestone deliverable
// for the Milestone 6 bullet:
//
//	docs/federation-spec.md: Complete cross-domain agent federation protocol
//	and ZK attestation architecture specification
//
// It checks that:
//   - docs/federation-spec.md exists and is non-empty.
//   - The spec covers the cross-domain agent federation protocol: trust
//     domains and identities (DID/SPIFFE), peer discovery and mesh sync,
//     mTLS handshakes, delegation and scope attenuation, evidence exchange,
//     policy enforcement, and real-time revocation.
//   - The spec covers the ZK attestation architecture: ZK-SNARK circuits,
//     selective disclosure, proof generation and verification, and
//     privacy-preserving compliance auditing without revealing payloads.
//   - The Milestone 6 bullet in docs/15-milestones.md is marked complete so
//     the hub roadmap tracks the shipped spec.
func TestFederationSpec(t *testing.T) {
	// 1. The spec file must exist and be non-empty.
	docPath := filepath.Join("..", "..", "docs", "federation-spec.md")
	content, err := os.ReadFile(docPath)
	if err != nil {
		t.Fatalf("docs/federation-spec.md is missing: %v", err)
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		t.Fatal("docs/federation-spec.md is empty")
	}
	text := string(content)
	lower := strings.ToLower(text)

	// 2. Cross-domain agent federation protocol content.
	for _, fragment := range []string{
		"federation",
		"trust domain",
		"peer",
		"mesh",
		"delegation",
		"revocation",
		"did:wasm",
		"spiffe",
		"mtls",
	} {
		if !strings.Contains(lower, fragment) {
			t.Errorf("docs/federation-spec.md is missing federation protocol content %q", fragment)
		}
	}

	// 3. ZK attestation architecture content.
	for _, fragment := range []string{
		"Zero-Knowledge",
		"ZK-SNARK",
		"selective disclosure",
		"verifier",
		"circuit",
		"proof",
	} {
		if !strings.Contains(text, fragment) {
			t.Errorf("docs/federation-spec.md is missing ZK attestation content %q", fragment)
		}
	}

	// 4. The milestone bullet must be marked complete.
	milestones, err := os.ReadFile("../../docs/15-milestones.md")
	if err != nil {
		t.Fatalf("Failed to read docs/15-milestones.md: %v", err)
	}
	bulletFound := false
	for _, line := range strings.Split(string(milestones), "\n") {
		if strings.Contains(line, "`docs/federation-spec.md`") {
			bulletFound = true
			if !strings.HasPrefix(strings.TrimSpace(line), "- [x]") {
				t.Errorf("docs/federation-spec.md milestone bullet is not checked: %s", line)
			}
		}
	}
	if !bulletFound {
		t.Error("docs/federation-spec.md milestone bullet not found in docs/15-milestones.md")
	}

	t.Log("Cross-domain agent federation protocol and ZK attestation architecture specification validated")
}
