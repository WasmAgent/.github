package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/WasmAgent/.github/pkg/docs"
)

// TestWasmagentJsSpiffeDriver validates the wasmagent-js/spiffe reference
// artifacts for the Milestone 6 bullet:
//
//	wasmagent-js/spiffe/: SPIFFE/SPIRE cryptographic identity driver binding
//	Wasm sandbox workloads to enterprise mTLS credentials
//
// It checks that:
//   - wasmagent-js/spiffe/spiffe.ts ships a SpiffeIdentityDriver with
//     X.509-SVID / JWT-SVID fetching, rotation watching, workload binding, and
//     mTLS credential material (cert chain + private key) for Wasm sandbox
//     workloads.
//   - wasmagent-js/spiffe/spiffe.test.ts exercises SPIFFE ID parsing, SVID
//     rotation, JWT issuance, and mTLS credential binding.
//   - The project index advertises the SPIFFE/SPIRE identity driver on the
//     wasmagent-js repository (the owning repo of the spiffe/ surface).
func TestWasmagentJsSpiffeDriver(t *testing.T) {
	driverDir := filepath.Join("..", "..", "wasmagent-js", "spiffe")

	// 1. Driver module must exist with the required identity capabilities.
	driverPath := filepath.Join(driverDir, "spiffe.ts")
	driverSource, err := os.ReadFile(driverPath)
	if err != nil {
		t.Fatalf("wasmagent-js/spiffe/spiffe.ts is missing: %v", err)
	}
	for _, fragment := range []string{
		"export class SpiffeIdentityDriver",
		"parseSpiffeId",
		"fetchX509Svid",
		"fetchJwtSvid",
		"watchX509Svid",
		"bindWorkload",
		"createMtlsClientCredentials",
		"createMtlsServerCredentials",
		"spiffe://",
	} {
		if !strings.Contains(string(driverSource), fragment) {
			t.Errorf("wasmagent-js/spiffe driver is missing required capability %q", fragment)
		}
	}

	// 2. Driver tests must cover SPIFFE ID parsing, SVID rotation, JWT
	// issuance, and mTLS credential binding.
	testPath := filepath.Join(driverDir, "spiffe.test.ts")
	testSource, err := os.ReadFile(testPath)
	if err != nil {
		t.Fatalf("wasmagent-js/spiffe coverage is missing: %v", err)
	}
	for _, scenario := range []string{
		"parses and validates SPIFFE IDs",
		"fetches and rotates X.509 SVIDs",
		"issues JWT-SVIDs",
		"binds a Wasm sandbox workload to mTLS credentials",
	} {
		if !strings.Contains(string(testSource), scenario) {
			t.Errorf("wasmagent-js/spiffe test is missing scenario %q", scenario)
		}
	}

	// 3. The project index must advertise the SPIFFE/SPIRE identity driver on
	// the wasmagent-js repository (the owning repo of the spiffe/ surface).
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}
	jsRepo, found := projectIndex.GetRepoByName("wasmagent-js")
	if !found {
		t.Fatal("wasmagent-js repository not found in project index")
	}
	if !strings.Contains(strings.ToLower(jsRepo.Summary), "spiffe") {
		t.Errorf("wasmagent-js summary does not mention the SPIFFE/SPIRE identity driver: %s", jsRepo.Summary)
	}

	t.Log("SPIFFE/SPIRE cryptographic identity driver validated for wasmagent-js")
}
