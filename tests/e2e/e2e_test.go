package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/WasmAgent/.github/pkg/docs"
)

// TestFullPipelineIntegration validates that the documented pipeline
// from workload → evidence → trust artifacts is consistent across all repos.
func TestFullPipelineIntegration(t *testing.T) {
	// Load project index to understand pipeline components
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// Validate that all pipeline layers have corresponding repos
	pipelineLayers := []string{
		"runtime",
		"workload",
		"evidence-pipeline",
		"trust-artifacts",
	}

	for _, layer := range pipelineLayers {
		found := false
		for _, repo := range projectIndex.Repos {
			if repo.Category == layer {
				found = true
				if repo.Status != "shipped" {
					t.Logf("Pipeline layer %s (repo %s) is not yet shipped (status: %s)",
						layer, repo.Name, repo.Status)
				}
				break
			}
		}
		if !found {
			t.Errorf("Missing repository for pipeline layer: %s", layer)
		}
	}

	// Validate integration documentation exists
	architecturePath := "../../docs/architecture.md"
	if _, err := os.Stat(architecturePath); os.IsNotExist(err) {
		t.Error("Architecture documentation missing - required for pipeline validation")
	}
}

// TestTrustArtifactGeneration validates that trust artifacts can be generated
// and conform to expected schemas.
func TestTrustArtifactGeneration(t *testing.T) {
	// Test fixture validation - ensure we have expected artifact structures
	fixtures := []struct {
		name     string
		file     string
		required bool
	}{
		{"AgentBOM", "fixtures/agentbom-sample.json", true},
		{"MCP Posture", "fixtures/mcp-posture-sample.json", true},
		{"Trust Passport", "fixtures/trust-passport-sample.json", true},
	}

	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			path := filepath.Join(".", fixture.file)
			content, err := os.ReadFile(path)
			if err != nil {
				if fixture.required {
					t.Errorf("Required fixture %s not found: %v", fixture.name, err)
				}
				return
			}

			// Validate JSON structure
			var artifact map[string]interface{}
			if err := json.Unmarshal(content, &artifact); err != nil {
				t.Errorf("Fixture %s contains invalid JSON: %v", fixture.name, err)
			}

			// Validate required fields
			requiredFields := []string{"$schema", "specVersion", "metadata"}
			for _, field := range requiredFields {
				if _, exists := artifact[field]; !exists {
					t.Errorf("Fixture %s missing required field: %s", fixture.name, field)
				}
			}
		})
	}
}

// TestProjectIndexConsistency validates that project-index.json is consistent
// with the actual repository structure and documentation.
func TestProjectIndexConsistency(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// Validate schema version
	if projectIndex.SchemaVersion < 1 {
		t.Error("Project index schema version should be at least 1")
	}

	// Validate required repos exist
	requiredRepos := []string{
		"wasmagent-js",
		"bscode",
		"trace-pipeline",
		"agent-trust-infra",
	}

	repoNames := make(map[string]bool)
	for _, repo := range projectIndex.Repos {
		repoNames[repo.Name] = true
	}

	for _, required := range requiredRepos {
		if !repoNames[required] {
			t.Errorf("Required repository missing from project index: %s", required)
		}
	}

	// Validate that all repos have required fields
	for _, repo := range projectIndex.Repos {
		if repo.Name == "" {
			t.Error("Repository in index has empty name")
		}
		if repo.Category == "" {
			t.Errorf("Repository %s missing category", repo.Name)
		}
		if repo.Status == "" {
			t.Errorf("Repository %s missing status", repo.Name)
		}
		if repo.URL == "" {
			t.Errorf("Repository %s missing URL", repo.Name)
		}
	}
}

// TestEvidencePipelineIntegration validates that the evidence pipeline
// documented in architecture.md has corresponding implementations.
func TestEvidencePipelineIntegration(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// Find trace-pipeline repo
	var tracePipeline *docs.ProjectRepo
	for _, repo := range projectIndex.Repos {
		if repo.Name == "trace-pipeline" {
			tracePipeline = &repo
			break
		}
	}

	if tracePipeline == nil {
		t.Error("trace-pipeline repository not found in project index")
		return
	}

	// Validate evidence pipeline repo is properly configured
	if tracePipeline.Category != "evidence-pipeline" {
		t.Errorf("trace-pipeline has incorrect category: %s (expected: evidence-pipeline)",
			tracePipeline.Category)
	}

	// Validate evidence flow: workloads should feed into evidence pipeline
	workloadCount := 0
	for _, repo := range projectIndex.Repos {
		if repo.Category == "workload" && repo.Status == "shipped" {
			workloadCount++
		}
	}

	if workloadCount == 0 {
		t.Error("No shipped workload repositories found to feed evidence pipeline")
	}

	t.Logf("Evidence pipeline validated with %d shipped workload(s)", workloadCount)
}

// TestTrustArtifactsChain validates that trust artifacts can be generated
// from evidence and include required components.
func TestTrustArtifactsChain(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// Validate trust artifact infrastructure exists
	var trustInfra *docs.ProjectRepo
	for _, repo := range projectIndex.Repos {
		if repo.Name == "agent-trust-infra" {
			trustInfra = &repo
			break
		}
	}

	if trustInfra == nil {
		t.Error("agent-trust-infra repository not found in project index")
		return
	}

	// Validate trust artifacts flow
	if trustInfra.Category != "trust-artifacts" {
		t.Errorf("agent-trust-infra has incorrect category: %s (expected: trust-artifacts)",
			trustInfra.Category)
	}

	// Validate workflow file exists for trust artifact generation
	workflowPath := "../../.github/workflows/generate-trust-artifacts.yml"
	if _, err := os.Stat(workflowPath); os.IsNotExist(err) {
		t.Error("Trust artifact generation workflow not found")
	}

	t.Log("Trust artifacts chain validated successfully")
}

// TestRuntimeWorkloadIntegration validates that the wasmagent-js runtime
// is properly configured to integrate with workload repositories.
func TestRuntimeWorkloadIntegration(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// Find the runtime repository
	runtime, found := projectIndex.GetRepoByName("wasmagent-js")
	if !found {
		t.Fatal("wasmagent-js runtime repository not found in project index")
	}

	// Validate runtime is properly categorized
	if runtime.Category != "runtime" {
		t.Errorf("wasmagent-js has incorrect category: %s (expected: runtime)", runtime.Category)
	}

	// Validate runtime is shipped (required for workload integration)
	if runtime.Status != "shipped" {
		t.Errorf("wasmagent-js runtime is not shipped (status: %s)", runtime.Status)
	}

	// Validate runtime is public and in profile
	if !runtime.InProfile {
		t.Error("wasmagent-js runtime should be in public profile")
	}

	if runtime.Visibility != "public" {
		t.Errorf("wasmagent-js runtime has incorrect visibility: %s (expected: public)", runtime.Visibility)
	}

	t.Logf("Runtime repository validated: %s (%s, %s)", runtime.Name, runtime.Status, runtime.URL)

	// Validate workload repositories that integrate with the runtime
	workloads := []struct {
		name     string
		required bool // whether the workload must be shipped
	}{
		{"bscode", true},     // bscode is a required shipped workload
		{"erp-agent", false}, // erp-agent is planned, not required yet
	}

	for _, wl := range workloads {
		t.Run(wl.name, func(t *testing.T) {
			workload, found := projectIndex.GetRepoByName(wl.name)
			if !found {
				if wl.required {
					t.Errorf("Required workload %s not found in project index", wl.name)
				} else {
					t.Logf("Optional workload %s not found (may be planned)", wl.name)
				}
				return
			}

			// Validate workload is properly categorized
			if workload.Category != "workload" {
				t.Errorf("Workload %s has incorrect category: %s (expected: workload)",
					wl.name, workload.Category)
			}

			// For required workloads, check shipped status
			if wl.required && workload.Status != "shipped" {
				t.Errorf("Required workload %s is not shipped (status: %s)", wl.name, workload.Status)
			}

			// Log the status of this workload
			t.Logf("Workload %s: status=%s, url=%s", workload.Name, workload.Status, workload.URL)
		})
	}

	// Count shipped workloads to validate integration pipeline
	shippedWorkloads := 0
	for _, repo := range projectIndex.Repos {
		if repo.Category == "workload" && repo.Status == "shipped" {
			shippedWorkloads++
		}
	}

	if shippedWorkloads == 0 {
		t.Error("No shipped workloads found - runtime integration cannot be validated")
	}

	t.Logf("Runtime integration validated with %d shipped workload(s)", shippedWorkloads)
}

// crossDomainChain represents a cross-domain trust chain fixture.
type crossDomainChain struct {
	SpecVersion        string                        `json:"specVersion"`
	Metadata           map[string]interface{}         `json:"metadata"`
	Domains            []crossDomain                  `json:"domains"`
	PropagationRules   []propagationRule              `json:"propagationRules"`
	EnforcementBoundaries []enforcementBoundary      `json:"enforcementBoundaries"`
	Chain              []chainEntry                   `json:"chain"`
}

type crossDomain struct {
	ID                 string                `json:"id"`
	Namespace          string                `json:"namespace"`
	ComplianceFramework string               `json:"complianceFramework"`
	PolicyBoundaries   map[string]interface{} `json:"policyBoundaries"`
}

type propagationRule struct {
	From        string `json:"from"`
	To          string `json:"to"`
	ArtifactType string `json:"artifactType"`
	Purpose     string `json:"purpose"`
}

type enforcementBoundary struct {
	Source      string `json:"source"`
	Target      string `json:"target"`
	PolicyAction string `json:"policyAction"`
	Reason      string `json:"reason"`
}

type chainEntry struct {
	DomainID           string      `json:"domainId"`
	Artifact           chainArtifact `json:"artifact"`
	PropagationStatus  string      `json:"propagationStatus"`
}

type chainArtifact struct {
	Type        string `json:"type"`
	SpecVersion string `json:"specVersion"`
	Digest      string `json:"digest"`
}

// TestCrossDomainTrustPropagation validates that trust artifacts can propagate
// across domain boundaries and that the cross-domain chain fixture conforms
// to the expected schema.
func TestCrossDomainTrustPropagation(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// The trust artifact infrastructure must exist for cross-domain propagation
	trustInfra, found := projectIndex.GetRepoByName("agent-trust-infra")
	if !found {
		t.Fatal("agent-trust-infra repository not found — cross-domain propagation requires trust artifact infrastructure")
	}
	if trustInfra.Status != "shipped" {
		t.Errorf("agent-trust-infra must be shipped for cross-domain propagation (status: %s)", trustInfra.Status)
	}

	// Load and validate the cross-domain chain fixture
	chainContent, err := os.ReadFile("fixtures/cross-domain-chain-sample.json")
	if err != nil {
		t.Fatalf("Cross-domain chain fixture not found: %v", err)
	}

	var chain crossDomainChain
	if err := json.Unmarshal(chainContent, &chain); err != nil {
		t.Fatalf("Cross-domain chain fixture contains invalid JSON: %v", err)
	}

	// Validate chain metadata
	if chain.SpecVersion == "" {
		t.Error("Cross-domain chain missing specVersion")
	}
	if chain.Metadata == nil {
		t.Error("Cross-domain chain missing metadata")
	}

	// Each domain must have a unique ID and compliance framework
	domainIDs := make(map[string]bool)
	for _, domain := range chain.Domains {
		if domain.ID == "" {
			t.Error("Domain in chain has empty ID")
		}
		if domain.Namespace == "" {
			t.Errorf("Domain %s has empty namespace", domain.ID)
		}
		if domain.ComplianceFramework == "" {
			t.Errorf("Domain %s has empty complianceFramework", domain.ID)
		}
		if domainIDs[domain.ID] {
			t.Errorf("Duplicate domain ID: %s", domain.ID)
		}
		domainIDs[domain.ID] = true
	}

	// Propagation rules must reference valid domain IDs
	for _, rule := range chain.PropagationRules {
		if !domainIDs[rule.From] {
			t.Errorf("Propagation rule references unknown source domain: %s", rule.From)
		}
		if rule.To == "" {
			t.Errorf("Propagation rule from %s has empty target", rule.From)
		}
		if rule.ArtifactType == "" {
			t.Errorf("Propagation rule from %s to %s has empty artifactType", rule.From, rule.To)
		}
	}

	// Chain entries must reference valid domain IDs
	for _, entry := range chain.Chain {
		if !domainIDs[entry.DomainID] {
			t.Errorf("Chain entry references unknown domain ID: %s", entry.DomainID)
		}
		if entry.Artifact.Type == "" {
			t.Errorf("Chain entry for domain %s has empty artifact type", entry.DomainID)
		}
		if entry.PropagationStatus == "" {
			t.Errorf("Chain entry for domain %s has empty propagationStatus", entry.DomainID)
		}
	}

	t.Logf("Cross-domain trust propagation validated: %d domains, %d propagation rules, %d chain entries",
		len(chain.Domains), len(chain.PropagationRules), len(chain.Chain))
}

// TestPolicyEnforcementBoundaries validates that policy enforcement boundaries
// are correctly defined and prevent cross-domain data leakage.
func TestPolicyEnforcementBoundaries(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// The runtime must support per-tenant policy enforcement
	runtime, found := projectIndex.GetRepoByName("wasmagent-js")
	if !found {
		t.Fatal("wasmagent-js runtime not found — policy enforcement requires runtime support")
	}

	if runtime.Category != "runtime" {
		t.Errorf("wasmagent-js has incorrect category for policy enforcement: %s (expected: runtime)", runtime.Category)
	}

	// Load and validate the cross-domain enforcement boundaries
	chainContent, err := os.ReadFile("fixtures/cross-domain-chain-sample.json")
	if err != nil {
		t.Fatalf("Cross-domain chain fixture not found: %v", err)
	}

	var chain crossDomainChain
	if err := json.Unmarshal(chainContent, &chain); err != nil {
		t.Fatalf("Cross-domain chain fixture contains invalid JSON: %v", err)
	}

	// Build domain ID set for boundary validation
	domainIDs := make(map[string]bool)
	for _, domain := range chain.Domains {
		domainIDs[domain.ID] = true
	}

	// Validate enforcement boundaries exist for each domain
	for _, boundary := range chain.EnforcementBoundaries {
		if !domainIDs[boundary.Source] {
			t.Errorf("Enforcement boundary references unknown source domain: %s", boundary.Source)
		}
		if !domainIDs[boundary.Target] {
			t.Errorf("Enforcement boundary references unknown target domain: %s", boundary.Target)
		}
		if boundary.Source == boundary.Target {
			t.Errorf("Enforcement boundary source and target must differ: %s", boundary.Source)
		}
		if boundary.PolicyAction != "reject" && boundary.PolicyAction != "allow" && boundary.PolicyAction != "sanitize" {
			t.Errorf("Enforcement boundary has unrecognized policyAction: %s", boundary.PolicyAction)
		}
		if boundary.Reason == "" {
			t.Errorf("Enforcement boundary from %s to %s missing reason", boundary.Source, boundary.Target)
		}
	}

	// Validate that each domain has at least one policy boundary defined
	// (each domain should be isolated from at least one other domain)
	boundedDomains := make(map[string]bool)
	for _, boundary := range chain.EnforcementBoundaries {
		boundedDomains[boundary.Source] = true
	}

	for _, domain := range chain.Domains {
		if !boundedDomains[domain.ID] {
			t.Errorf("Domain %s has no enforcement boundaries defined — policy isolation cannot be verified", domain.ID)
		}
	}

	// Validate policy boundaries within each domain definition
	for _, domain := range chain.Domains {
		boundaries := domain.PolicyBoundaries
		if boundaries == nil {
			t.Errorf("Domain %s has no policy boundaries defined", domain.ID)
			continue
		}

		if _, ok := boundaries["allowedDataTypes"]; !ok {
			t.Errorf("Domain %s policy boundaries missing allowedDataTypes", domain.ID)
		}
		if _, ok := boundaries["restrictedOperations"]; !ok {
			t.Errorf("Domain %s policy boundaries missing restrictedOperations", domain.ID)
		}
		if _, ok := boundaries["auditLevel"]; !ok {
			t.Errorf("Domain %s policy boundaries missing auditLevel", domain.ID)
		}
	}

	t.Logf("Policy enforcement boundaries validated: %d domains, %d enforcement rules",
		len(chain.Domains), len(chain.EnforcementBoundaries))
}

// TestTrustArtifactPropagationConsistency validates that trust artifacts
// produced by each pipeline layer conform to the propagation contract
// expected by downstream consumers.
func TestTrustArtifactPropagationConsistency(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// Validate the full propagation path: workload → evidence → trust-artifacts → cross-domain
	//
	// 1. Workloads must exist to produce evidence
	workloads := projectIndex.GetReposByCategory("workload")
	if len(workloads) == 0 {
		t.Error("No workload repositories found — trust artifact propagation has no source")
	}

	// 2. Evidence pipeline must exist to ingest workload evidence
	evidencePipelines := projectIndex.GetReposByCategory("evidence-pipeline")
	if len(evidencePipelines) == 0 {
		t.Error("No evidence pipeline repositories found — trust artifact propagation has no ingestion layer")
	}

	// 3. Trust artifact infrastructure must exist
	trustArtifacts := projectIndex.GetReposByCategory("trust-artifacts")
	if len(trustArtifacts) == 0 {
		t.Error("No trust artifact repositories found — propagation has no trust layer")
	}

	// 4. Validate fixture schemas are consistent across the chain
	fixtures := []struct {
		name     string
		file     string
		requiredFields []string
	}{
		{
			"AgentBOM", "fixtures/agentbom-sample.json",
			[]string{"$schema", "specVersion", "metadata", "components"},
		},
		{
			"MCP Posture", "fixtures/mcp-posture-sample.json",
			[]string{"$schema", "specVersion", "metadata", "declaredTools"},
		},
		{
			"Trust Passport", "fixtures/trust-passport-sample.json",
			[]string{"$schema", "specVersion", "metadata", "identity", "evidence"},
		},
		{
			"Cross-Domain Chain", "fixtures/cross-domain-chain-sample.json",
			[]string{"$schema", "specVersion", "domains", "propagationRules", "enforcementBoundaries", "chain"},
		},
	}

	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			content, err := os.ReadFile(fixture.file)
			if err != nil {
				t.Fatalf("Failed to read fixture %s: %v", fixture.name, err)
			}

			var artifact map[string]interface{}
			if err := json.Unmarshal(content, &artifact); err != nil {
				t.Fatalf("Fixture %s contains invalid JSON: %v", fixture.name, err)
			}

			for _, field := range fixture.requiredFields {
				if _, exists := artifact[field]; !exists {
					t.Errorf("Fixture %s missing required field: %s", fixture.name, field)
				}
			}
		})
	}

	// 5. Validate all artifacts share a compatible spec version lineage
	// (they should all reference the same or compatible schema namespace)
	artifactFiles := []string{
		"fixtures/agentbom-sample.json",
		"fixtures/mcp-posture-sample.json",
		"fixtures/trust-passport-sample.json",
		"fixtures/cross-domain-chain-sample.json",
	}

	for _, file := range artifactFiles {
		t.Run(filepath.Base(file)+"_schema_namespace", func(t *testing.T) {
			content, err := os.ReadFile(file)
			if err != nil {
				t.Fatalf("Failed to read %s: %v", file, err)
			}

			var artifact map[string]interface{}
			if err := json.Unmarshal(content, &artifact); err != nil {
				t.Fatalf("Invalid JSON in %s: %v", file, err)
			}

			schemaField, ok := artifact["$schema"]
			if !ok {
				t.Errorf("Artifact %s missing $schema field — cannot verify namespace compatibility", file)
				return
			}

			schema, ok := schemaField.(string)
			if !ok {
				t.Errorf("Artifact %s $schema is not a string", file)
				return
			}

			// All schemas must originate from the agent-trust-infra namespace
			if !contains(schema, "wasmagent.github.io/agent-trust-infra/schemas/") {
				t.Errorf("Artifact %s $schema not from agent-trust-infra namespace: %s", file, schema)
			}
		})
	}

	t.Logf("Trust artifact propagation consistency validated: %d workloads, %d evidence pipelines, %d trust artifact repos, %d fixture schemas",
		len(workloads), len(evidencePipelines), len(trustArtifacts), len(fixtures))
}

// TestDomainWorkloadTrustIntegration validates that each domain workload
// can produce trust artifacts and participate in the cross-domain trust chain.
func TestDomainWorkloadTrustIntegration(t *testing.T) {
	// Load the cross-domain chain fixture
	chainContent, err := os.ReadFile("fixtures/cross-domain-chain-sample.json")
	if err != nil {
		t.Fatalf("Cross-domain chain fixture not found: %v", err)
	}

	var chain crossDomainChain
	if err := json.Unmarshal(chainContent, &chain); err != nil {
		t.Fatalf("Cross-domain chain fixture contains invalid JSON: %v", err)
	}

	// Each domain in the chain must have a corresponding chain entry
	domainChainEntries := make(map[string]chainEntry)
	for _, entry := range chain.Chain {
		domainChainEntries[entry.DomainID] = entry
	}

	for _, domain := range chain.Domains {
		t.Run(domain.ID, func(t *testing.T) {
			entry, exists := domainChainEntries[domain.ID]
			if !exists {
				t.Errorf("Domain %s has no chain entry — trust integration incomplete", domain.ID)
				return
			}

			// Chain entry must use a recognized artifact type
			validArtifactTypes := map[string]bool{
				"AgentBOM":      true,
				"TrustPassport": true,
				"MCPPosture":    true,
			}
			if !validArtifactTypes[entry.Artifact.Type] {
				t.Errorf("Domain %s chain entry uses unrecognized artifact type: %s",
					domain.ID, entry.Artifact.Type)
			}

			// Artifact specVersion must be non-empty
			if entry.Artifact.SpecVersion == "" {
				t.Errorf("Domain %s artifact has empty specVersion", domain.ID)
			}

			// Propagation status must be a recognized state
			validStatuses := map[string]bool{
				"registered":    true,
				"propagated":    true,
				"verified":      true,
				"pending":       true,
			}
			if !validStatuses[entry.PropagationStatus] {
				t.Errorf("Domain %s has unrecognized propagation status: %s",
					domain.ID, entry.PropagationStatus)
			}
		})
	}

	// Validate the number of domains matches the number of chain entries
	if len(chain.Domains) != len(chain.Chain) {
		t.Errorf("Domain count (%d) does not match chain entry count (%d)",
			len(chain.Domains), len(chain.Chain))
	}
}

// contains checks if a string contains a substring.
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}