package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/WasmAgent/.github/pkg/docs"
)

// meshControlPlane is the JSON schema shape of the federation control plane
// fixture (tests/e2e/fixtures/mesh-control-plane-sample.json). It mirrors the
// mesh-peers.yaml consumed by `wasmagent-mesh sync --peers mesh-peers.yaml`.
type meshControlPlane struct {
	SpecVersion string                 `json:"specVersion"`
	Metadata    map[string]interface{} `json:"metadata"`
	Clusters    []meshCluster          `json:"clusters"`
	SyncConfig  meshSyncConfig         `json:"syncConfig"`
	Attestation meshAttestation        `json:"attestation"`
}

type meshCluster struct {
	Name              string `json:"name"`
	Region            string `json:"region"`
	ControlPlaneURL   string `json:"controlPlaneUrl"`
	AttestationDomain string `json:"attestationDomain"`
}

type meshSyncConfig struct {
	Mode            string   `json:"mode"`
	IntervalSeconds int      `json:"intervalSeconds"`
	ConflictPolicy  string   `json:"conflictPolicy"`
	SyncArtifacts   []string `json:"syncArtifacts"`
}

type meshAttestation struct {
	CrossDomain           bool     `json:"crossDomain"`
	VerificationMode      string   `json:"verificationMode"`
	TrustRoots            []string `json:"trustRoots"`
	RequireSignedEvidence bool     `json:"requireSignedEvidence"`
}

func loadMeshControlPlaneFixture(t *testing.T) meshControlPlane {
	t.Helper()
	content, err := os.ReadFile("fixtures/mesh-control-plane-sample.json")
	if err != nil {
		t.Fatalf("mesh control plane fixture not found: %v", err)
	}
	var cp meshControlPlane
	if err := json.Unmarshal(content, &cp); err != nil {
		t.Fatalf("mesh control plane fixture contains invalid JSON: %v", err)
	}
	return cp
}

// TestMeshControlPlaneLayout validates that the wasmagent-ops/federation
// control plane component exists in the ops workspace and ships the peer mesh
// configuration consumed by `wasmagent-mesh sync --peers ...`.
func TestMeshControlPlaneLayout(t *testing.T) {
	federationDir := filepath.Join("..", "..", "wasmagent-ops", "federation")
	info, err := os.Stat(federationDir)
	if err != nil {
		t.Fatalf("wasmagent-ops/federation/ control plane missing: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("wasmagent-ops/federation is not a directory")
	}

	peersPath := filepath.Join(federationDir, "mesh-peers.yaml")
	peers, err := os.ReadFile(peersPath)
	if err != nil {
		t.Fatalf("mesh-peers.yaml missing: %v", err)
	}
	peersText := string(peers)
	for _, marker := range []string{
		"apiVersion: mesh.wasmagent.dev/v1",
		"kind: MeshPeers",
		"clusters:",
		"sync:",
		"attestation:",
	} {
		if !strings.Contains(peersText, marker) {
			t.Errorf("mesh-peers.yaml is missing required section %q", marker)
		}
	}

	readmePath := filepath.Join(federationDir, "README.md")
	readme, err := os.ReadFile(readmePath)
	if err != nil {
		t.Fatalf("federation control plane README missing: %v", err)
	}
	readmeText := string(readme)
	for _, marker := range []string{
		"wasmagent-mesh sync --peers mesh-peers.yaml",
		"multi-cluster agent mesh",
		"cross-domain attestation",
	} {
		if !strings.Contains(readmeText, marker) {
			t.Errorf("federation README is missing required content %q", marker)
		}
	}
}

// TestMeshControlPlaneFixture validates the control plane fixture schema.
func TestMeshControlPlaneFixture(t *testing.T) {
	cp := loadMeshControlPlaneFixture(t)

	if cp.SpecVersion == "" {
		t.Error("mesh control plane fixture missing specVersion")
	}

	if len(cp.Clusters) < 2 {
		t.Errorf("mesh control plane fixture must define at least 2 clusters, got %d", len(cp.Clusters))
	}

	domains := make(map[string]bool)
	for _, cluster := range cp.Clusters {
		if cluster.Name == "" {
			t.Error("mesh cluster has empty name")
		}
		if cluster.Region == "" {
			t.Errorf("mesh cluster %s has empty region", cluster.Name)
		}
		if cluster.ControlPlaneURL == "" {
			t.Errorf("mesh cluster %s has empty controlPlaneUrl", cluster.Name)
		}
		if cluster.AttestationDomain == "" {
			t.Errorf("mesh cluster %s has empty attestationDomain", cluster.Name)
		}
		if domains[cluster.AttestationDomain] {
			t.Errorf("mesh cluster %s reuses attestationDomain %s", cluster.Name, cluster.AttestationDomain)
		}
		domains[cluster.AttestationDomain] = true
	}
}

// TestMeshSyncConfiguration validates the multi-cluster synchronization policy.
func TestMeshSyncConfiguration(t *testing.T) {
	cp := loadMeshControlPlaneFixture(t)

	validModes := map[string]bool{"bidirectional": true, "unidirectional": true}
	if !validModes[cp.SyncConfig.Mode] {
		t.Errorf("sync mode %q is not a supported mesh sync mode", cp.SyncConfig.Mode)
	}
	if cp.SyncConfig.IntervalSeconds <= 0 {
		t.Errorf("sync intervalSeconds must be positive, got %d", cp.SyncConfig.IntervalSeconds)
	}
	if cp.SyncConfig.ConflictPolicy == "" {
		t.Error("sync conflictPolicy must not be empty")
	}
	if len(cp.SyncConfig.SyncArtifacts) == 0 {
		t.Error("sync syncArtifacts must list at least one artifact scope")
	}
}

// TestMeshCrossDomainAttestation validates the cross-domain attestation policy.
func TestMeshCrossDomainAttestation(t *testing.T) {
	cp := loadMeshControlPlaneFixture(t)

	if !cp.Attestation.CrossDomain {
		t.Error("attestation crossDomain must be true for a federated mesh")
	}
	validModes := map[string]bool{"verify-on-sync": true, "verify-on-demand": true}
	if !validModes[cp.Attestation.VerificationMode] {
		t.Errorf("attestation verificationMode %q is not supported", cp.Attestation.VerificationMode)
	}
	if len(cp.Attestation.TrustRoots) == 0 {
		t.Error("attestation trustRoots must not be empty")
	}
	if !cp.Attestation.RequireSignedEvidence {
		t.Error("attestation requireSignedEvidence must be true")
	}
}

// TestOpsFederationCoverage validates that the wasmagent-ops repository is
// shipped and its project index summary reflects the federation control plane.
func TestOpsFederationCoverage(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	opsRepo, found := projectIndex.GetRepoByName("wasmagent-ops")
	if !found {
		t.Fatal("wasmagent-ops repository not found in project index — federation control plane requires ops infrastructure")
	}

	if opsRepo.Status != "shipped" {
		t.Errorf("wasmagent-ops must be shipped for the federation control plane (status: %s)", opsRepo.Status)
	}

	if !strings.Contains(strings.ToLower(opsRepo.Summary), "federation") {
		t.Errorf("wasmagent-ops summary does not mention federation control plane: %s", opsRepo.Summary)
	}
}
