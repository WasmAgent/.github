package federation

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"strings"
	"testing"
)

// testKeys generates an Ed25519 key pair for cross-domain attestation tests.
func testKeys(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate test key: %v", err)
	}
	return pub, priv
}

// fakePeerFetcher returns pre-seeded artifacts per cluster without any
// network access, standing in for peer control planes in offline tests.
type fakePeerFetcher struct {
	artifacts map[string][]Artifact
	err       error
}

func (f *fakePeerFetcher) FetchArtifacts(_ context.Context, peer Cluster, _ []string) ([]Artifact, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.artifacts[peer.Name], nil
}

func signedArtifact(id, scope, cluster, payload, trustRoot string, priv ed25519.PrivateKey) Artifact {
	return Artifact{
		ID:        id,
		Scope:     scope,
		Cluster:   cluster,
		Payload:   []byte(payload),
		Signature: ed25519.Sign(priv, []byte(payload)),
		TrustRoot: trustRoot,
		SignedBy:  "cluster." + cluster + ".mesh.example",
	}
}

// minimalConfig returns a small but fully valid mesh peers configuration for
// engine-level tests.
func minimalConfig() *MeshPeers {
	return &MeshPeers{
		APIVersion: "mesh.wasmagent.dev/v1",
		Kind:       "MeshPeers",
		Metadata:   MeshMetadata{Name: "test-mesh", Namespace: "wasmagent-ops"},
		Clusters: []Cluster{
			{Name: "c1", Region: "us-east-1", ControlPlane: "https://mesh.c1.example", AttestationDomain: "cluster.c1.mesh.example"},
			{Name: "c2", Region: "eu-west-1", ControlPlane: "https://mesh.c2.example", AttestationDomain: "cluster.c2.mesh.example"},
		},
		Sync: SyncPolicy{
			Mode:            SyncModeBidirectional,
			IntervalSeconds: 60,
			ConflictPolicy:  "last-writer-wins",
			Include:         []string{"agentboms", "trust-passports", "aep-evidence"},
		},
		Attestation: AttestationPolicy{
			CrossDomain:           true,
			VerificationMode:      VerificationVerifyOnSync,
			TrustRoots:            []string{"urn:test:trust-root:v1"},
			RequireSignedEvidence: true,
		},
	}
}

// TestLoadMeshPeersFromRepo validates that the canonical mesh-peers.yaml
// shipped by the federation control plane parses and passes admission.
func TestLoadMeshPeersFromRepo(t *testing.T) {
	cfg, err := LoadMeshPeers(DefaultConfigPath)
	if err != nil {
		t.Fatalf("load mesh-peers.yaml: %v", err)
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("mesh-peers.yaml failed validation: %v", err)
	}

	if cfg.APIVersion != "mesh.wasmagent.dev/v1" {
		t.Errorf("apiVersion = %q, want mesh.wasmagent.dev/v1", cfg.APIVersion)
	}
	if cfg.Kind != "MeshPeers" {
		t.Errorf("kind = %q, want MeshPeers", cfg.Kind)
	}
	if cfg.Metadata.Name != "wasmagent-global-mesh" {
		t.Errorf("metadata.name = %q, want wasmagent-global-mesh", cfg.Metadata.Name)
	}
	if cfg.Metadata.Namespace != "wasmagent-ops" {
		t.Errorf("metadata.namespace = %q, want wasmagent-ops", cfg.Metadata.Namespace)
	}
	if len(cfg.Clusters) != 3 {
		t.Fatalf("expected 3 mesh clusters, got %d", len(cfg.Clusters))
	}
	for _, c := range cfg.Clusters {
		if c.Name == "" || c.Region == "" || c.ControlPlane == "" || c.AttestationDomain == "" {
			t.Errorf("cluster %+v has incomplete control plane entry", c)
		}
		if !strings.HasPrefix(c.ControlPlane, "https://") {
			t.Errorf("cluster %s control plane %q is not HTTPS", c.Name, c.ControlPlane)
		}
	}
	if cfg.Sync.Mode != SyncModeBidirectional {
		t.Errorf("sync.mode = %q, want bidirectional", cfg.Sync.Mode)
	}
	if cfg.Sync.IntervalSeconds <= 0 {
		t.Errorf("sync.intervalSeconds = %d, want positive", cfg.Sync.IntervalSeconds)
	}
	if len(cfg.Sync.Include) == 0 {
		t.Error("sync.include must list artifact scopes")
	}
	if !cfg.Attestation.CrossDomain {
		t.Error("attestation.crossDomain must be true")
	}
	if cfg.Attestation.VerificationMode != VerificationVerifyOnSync {
		t.Errorf("attestation.verificationMode = %q, want verify-on-sync", cfg.Attestation.VerificationMode)
	}
	if len(cfg.Attestation.TrustRoots) == 0 {
		t.Error("attestation.trustRoots must not be empty")
	}
	if !cfg.Attestation.RequireSignedEvidence {
		t.Error("attestation.requireSignedEvidence must be true")
	}
}

// TestWasagentMeshSyncAgainstRepoPeers exercises the `wasmagent-mesh sync
// --peers mesh-peers.yaml` flow end to end: every cluster in the canonical
// mesh-peers.yaml is contacted through a peer fetcher, its signed evidence is
// verified against the federation trust root, and the verified evidence is
// admitted into the local audit ledger with nothing quarantined.
func TestWasagentMeshSyncAgainstRepoPeers(t *testing.T) {
	cfg, err := LoadMeshPeers(DefaultConfigPath)
	if err != nil {
		t.Fatalf("load mesh-peers.yaml: %v", err)
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("mesh-peers.yaml failed validation: %v", err)
	}

	pub, priv := testKeys(t)
	trustRoot := cfg.Attestation.TrustRoots[0]

	fetcher := &fakePeerFetcher{artifacts: make(map[string][]Artifact)}
	for _, cluster := range cfg.Clusters {
		payload := `{"evidence":"signed-aep-` + cluster.Name + `"}`
		fetcher.artifacts[cluster.Name] = []Artifact{
			signedArtifact("aep-evidence-"+cluster.Name, "aep-evidence", cluster.Name, payload, trustRoot, priv),
		}
	}

	engine := NewSyncEngine(cfg, fetcher, NewEd25519Verifier(map[string]ed25519.PublicKey{trustRoot: pub}))
	result, err := engine.Sync(context.Background())
	if err != nil {
		t.Fatalf("wasmagent-mesh sync: %v", err)
	}

	if len(result.Peers) != len(cfg.Clusters) {
		t.Errorf("expected %d peers synced, got %d", len(cfg.Clusters), len(result.Peers))
	}
	for _, cluster := range cfg.Clusters {
		found := false
		for _, peer := range result.Peers {
			if peer == cluster.Name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("peer %q was not part of the sync cycle", cluster.Name)
		}
	}
	if len(result.Admitted) != len(cfg.Clusters) {
		t.Errorf("expected %d admitted artifacts, got %d", len(cfg.Clusters), len(result.Admitted))
	}
	if len(result.Quarantined) != 0 {
		t.Errorf("expected no quarantined artifacts, got %d: %+v", len(result.Quarantined), result.Quarantined)
	}
	if !result.FinishedAt.After(result.StartedAt) {
		t.Error("sync result timestamps are inconsistent")
	}
}

// TestCrossDomainAttestationQuarantinesUnsignedEvidence verifies that
// unsigned evidence is rejected at admission when
// attestation.requireSignedEvidence is true.
func TestCrossDomainAttestationQuarantinesUnsignedEvidence(t *testing.T) {
	cfg := minimalConfig()
	fetcher := &fakePeerFetcher{artifacts: map[string][]Artifact{
		"c1": {{ID: "unsigned-evidence", Scope: "aep-evidence", Cluster: "c1", Payload: []byte(`{"evidence":"unsigned"}`)}},
	}}

	pub, _ := testKeys(t)
	engine := NewSyncEngine(cfg, fetcher, NewEd25519Verifier(map[string]ed25519.PublicKey{cfg.Attestation.TrustRoots[0]: pub}))
	result, err := engine.Sync(context.Background())
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if len(result.Admitted) != 0 {
		t.Errorf("expected no admitted artifacts, got %d", len(result.Admitted))
	}
	if len(result.Quarantined) != 1 {
		t.Fatalf("expected 1 quarantined artifact, got %d", len(result.Quarantined))
	}
	if !strings.Contains(result.Quarantined[0].Reason, "unsigned") {
		t.Errorf("quarantine reason = %q, want it to mention unsigned evidence", result.Quarantined[0].Reason)
	}
}

// TestCrossDomainAttestationQuarantinesUntrustedSignature verifies that
// evidence signed by a key outside the federation trust roots is quarantined.
func TestCrossDomainAttestationQuarantinesUntrustedSignature(t *testing.T) {
	cfg := minimalConfig()
	_, trustedPriv := testKeys(t)
	_, roguePriv := testKeys(t)

	rogue := signedArtifact("rogue-evidence", "aep-evidence", "c1", `{"evidence":"rogue"}`, cfg.Attestation.TrustRoots[0], roguePriv)
	fetcher := &fakePeerFetcher{artifacts: map[string][]Artifact{"c1": {rogue}}}

	engine := NewSyncEngine(cfg, fetcher, NewEd25519Verifier(map[string]ed25519.PublicKey{
		cfg.Attestation.TrustRoots[0]: pubOf(t, trustedPriv),
	}))
	result, err := engine.Sync(context.Background())
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if len(result.Quarantined) != 1 {
		t.Fatalf("expected 1 quarantined artifact, got %d", len(result.Quarantined))
	}
	if !strings.Contains(result.Quarantined[0].Reason, "signature verification failed") {
		t.Errorf("quarantine reason = %q, want it to mention signature verification failure", result.Quarantined[0].Reason)
	}
}

func pubOf(t *testing.T, priv ed25519.PrivateKey) ed25519.PublicKey {
	t.Helper()
	pub, ok := priv.Public().(ed25519.PublicKey)
	if !ok {
		t.Fatal("private key has no Ed25519 public key")
	}
	return pub
}

// TestCrossDomainAttestationRejectsNonTrustRoot verifies that an artifact
// declaring a trust root outside the federation policy is quarantined even
// when the signature itself is valid.
func TestCrossDomainAttestationRejectsNonTrustRoot(t *testing.T) {
	cfg := minimalConfig()
	pub, priv := testKeys(t)

	foreign := signedArtifact("foreign-evidence", "aep-evidence", "c1", `{"evidence":"foreign"}`, "urn:foreign:trust-root:v9", priv)
	fetcher := &fakePeerFetcher{artifacts: map[string][]Artifact{"c1": {foreign}}}

	engine := NewSyncEngine(cfg, fetcher, NewEd25519Verifier(map[string]ed25519.PublicKey{
		"urn:foreign:trust-root:v9": pub,
	}))
	result, err := engine.Sync(context.Background())
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if len(result.Quarantined) != 1 {
		t.Fatalf("expected 1 quarantined artifact, got %d", len(result.Quarantined))
	}
	if !strings.Contains(result.Quarantined[0].Reason, "not in the federation trust roots") {
		t.Errorf("quarantine reason = %q, want it to mention federation trust roots", result.Quarantined[0].Reason)
	}
}

// TestSyncQuarantinesExcludedScopes verifies that artifact scopes listed in
// sync.exclude are never propagated across the mesh.
func TestSyncQuarantinesExcludedScopes(t *testing.T) {
	cfg := minimalConfig()
	cfg.Sync.Exclude = []string{"secrets"}

	pub, priv := testKeys(t)
	secret := signedArtifact("cluster-secret", "secrets", "c1", `{"secret":true}`, cfg.Attestation.TrustRoots[0], priv)
	fetcher := &fakePeerFetcher{artifacts: map[string][]Artifact{"c1": {secret}}}

	engine := NewSyncEngine(cfg, fetcher, NewEd25519Verifier(map[string]ed25519.PublicKey{cfg.Attestation.TrustRoots[0]: pub}))
	result, err := engine.Sync(context.Background())
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if len(result.Admitted) != 0 {
		t.Errorf("expected no admitted artifacts, got %d", len(result.Admitted))
	}
	if len(result.Quarantined) != 1 {
		t.Fatalf("expected 1 quarantined artifact, got %d", len(result.Quarantined))
	}
	if !strings.Contains(result.Quarantined[0].Reason, "excluded") {
		t.Errorf("quarantine reason = %q, want it to mention excluded scope", result.Quarantined[0].Reason)
	}
}

// TestSyncRefusesInvalidConfig verifies the control plane refuses to run a
// sync cycle over an invalid mesh topology.
func TestSyncRefusesInvalidConfig(t *testing.T) {
	cfg := minimalConfig()
	cfg.Attestation.CrossDomain = false

	fetcher := &fakePeerFetcher{artifacts: map[string][]Artifact{}}
	pub, _ := testKeys(t)
	engine := NewSyncEngine(cfg, fetcher, NewEd25519Verifier(map[string]ed25519.PublicKey{cfg.Attestation.TrustRoots[0]: pub}))
	if _, err := engine.Sync(context.Background()); err == nil {
		t.Fatal("expected sync to refuse an invalid mesh configuration")
	}
}

// TestBuildSyncPlanAgainstRepoPeers verifies the offline dry-run sync plan
// derived from the canonical mesh-peers.yaml.
func TestBuildSyncPlanAgainstRepoPeers(t *testing.T) {
	cfg, err := LoadMeshPeers(DefaultConfigPath)
	if err != nil {
		t.Fatalf("load mesh-peers.yaml: %v", err)
	}
	plan, err := BuildSyncPlan(cfg)
	if err != nil {
		t.Fatalf("build sync plan: %v", err)
	}
	if plan.MeshName != "wasmagent-global-mesh" {
		t.Errorf("plan mesh name = %q, want wasmagent-global-mesh", plan.MeshName)
	}
	if len(plan.Peers) != len(cfg.Clusters) {
		t.Errorf("plan peers = %v, want all %d clusters", plan.Peers, len(cfg.Clusters))
	}
	for _, peer := range []string{"us-east-1", "eu-west-1", "ap-southeast-1"} {
		found := false
		for _, p := range plan.Peers {
			if p == peer {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("plan is missing peer %q", peer)
		}
	}
	if !plan.RequireSignedEvidence {
		t.Error("plan must require signed evidence")
	}
}

// TestParseMeshPeersYAML validates the dependency-free YAML subset parser
// against a representative mesh-peers document, including a folded scalar,
// sequences of scalars, and sequences of inline mappings.
func TestParseMeshPeersYAML(t *testing.T) {
	content := []byte(`
apiVersion: mesh.wasmagent.dev/v1
kind: MeshPeers
metadata:
  name: test-mesh
  namespace: wasmagent-ops
  description: >-
    Multi-cluster agent mesh
    for cross-domain attestation testing.
clusters:
  - name: c1
    region: us-east-1
    controlPlane: https://mesh.c1.example
    attestationDomain: cluster.c1.mesh.example
  - name: c2
    region: eu-west-1
    controlPlane: https://mesh.c2.example
    attestationDomain: cluster.c2.mesh.example
sync:
  mode: bidirectional
  intervalSeconds: 30
  conflictPolicy: last-writer-wins
  include:
    - agentboms
    - trust-passports
    - aep-evidence
  exclude:
    - secrets
attestation:
  crossDomain: true
  verificationMode: verify-on-sync
  trustRoots:
    - urn:test:trust-root:v1
  requireSignedEvidence: true
`)
	cfg, err := ParseMeshPeers(content)
	if err != nil {
		t.Fatalf("parse mesh peers YAML: %v", err)
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("parsed config failed validation: %v", err)
	}

	if cfg.Metadata.Name != "test-mesh" {
		t.Errorf("metadata.name = %q, want test-mesh", cfg.Metadata.Name)
	}
	if cfg.Metadata.Description != "Multi-cluster agent mesh for cross-domain attestation testing." {
		t.Errorf("metadata.description = %q, want folded scalar joined with spaces", cfg.Metadata.Description)
	}
	if len(cfg.Clusters) != 2 {
		t.Fatalf("expected 2 clusters, got %d", len(cfg.Clusters))
	}
	if cfg.Clusters[0].Name != "c1" || cfg.Clusters[0].Region != "us-east-1" {
		t.Errorf("cluster 0 parsed incorrectly: %+v", cfg.Clusters[0])
	}
	if cfg.Clusters[1].AttestationDomain != "cluster.c2.mesh.example" {
		t.Errorf("cluster 1 attestationDomain = %q", cfg.Clusters[1].AttestationDomain)
	}
	if cfg.Sync.Mode != "bidirectional" || cfg.Sync.IntervalSeconds != 30 {
		t.Errorf("sync policy parsed incorrectly: %+v", cfg.Sync)
	}
	if len(cfg.Sync.Include) != 3 || cfg.Sync.Include[0] != "agentboms" {
		t.Errorf("sync.include parsed incorrectly: %v", cfg.Sync.Include)
	}
	if len(cfg.Sync.Exclude) != 1 || cfg.Sync.Exclude[0] != "secrets" {
		t.Errorf("sync.exclude parsed incorrectly: %v", cfg.Sync.Exclude)
	}
	if !cfg.Attestation.CrossDomain || !cfg.Attestation.RequireSignedEvidence {
		t.Errorf("attestation policy parsed incorrectly: %+v", cfg.Attestation)
	}
	if len(cfg.Attestation.TrustRoots) != 1 || cfg.Attestation.TrustRoots[0] != "urn:test:trust-root:v1" {
		t.Errorf("attestation.trustRoots parsed incorrectly: %v", cfg.Attestation.TrustRoots)
	}
}

// TestValidateRejectsBrokenConfig ensures the validation gate catches the
// structural failure modes the control plane must refuse.
func TestValidateRejectsBrokenConfig(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(cfg *MeshPeers)
		wantSub string
	}{
		{
			name:    "single cluster",
			mutate:  func(cfg *MeshPeers) { cfg.Clusters = cfg.Clusters[:1] },
			wantSub: "at least 2 clusters",
		},
		{
			name:    "plaintext control plane",
			mutate:  func(cfg *MeshPeers) { cfg.Clusters[0].ControlPlane = "http://mesh.c1.example" },
			wantSub: "HTTPS",
		},
		{
			name:    "duplicate attestation domain",
			mutate:  func(cfg *MeshPeers) { cfg.Clusters[1].AttestationDomain = cfg.Clusters[0].AttestationDomain },
			wantSub: "duplicate attestationDomain",
		},
		{
			name:    "unsupported sync mode",
			mutate:  func(cfg *MeshPeers) { cfg.Sync.Mode = "one-way" },
			wantSub: "must be bidirectional or unidirectional",
		},
		{
			name:    "cross domain disabled",
			mutate:  func(cfg *MeshPeers) { cfg.Attestation.CrossDomain = false },
			wantSub: "crossDomain must be true",
		},
		{
			name:    "empty trust roots",
			mutate:  func(cfg *MeshPeers) { cfg.Attestation.TrustRoots = nil },
			wantSub: "trustRoots must not be empty",
		},
		{
			name:    "unsigned evidence allowed",
			mutate:  func(cfg *MeshPeers) { cfg.Attestation.RequireSignedEvidence = false },
			wantSub: "requireSignedEvidence must be true",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := minimalConfig()
			tt.mutate(cfg)
			err := cfg.Validate()
			if err == nil {
				t.Fatalf("expected validation error containing %q", tt.wantSub)
			}
			if !strings.Contains(err.Error(), tt.wantSub) {
				t.Errorf("validation error = %q, want it to contain %q", err.Error(), tt.wantSub)
			}
		})
	}
}
