package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
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

// verificationDaemon represents a continuous verification daemon configuration fixture.
type verificationDaemon struct {
	SpecVersion      string                `json:"specVersion"`
	Metadata         map[string]interface{} `json:"metadata"`
	DaemonConfig     daemonConfig          `json:"daemonConfig"`
	MonitoredAgents  []monitoredAgent      `json:"monitoredAgents"`
	TrustPolicies    []trustPolicy         `json:"trustPolicies"`
	AlertChannels    []alertChannel        `json:"alertChannels"`
	SampleViolations []sampleViolation     `json:"sampleViolations"`
}

type daemonConfig struct {
	PollIntervalSeconds   int    `json:"pollIntervalSeconds"`
	AlertBackoffSeconds    int    `json:"alertBackoffSeconds"`
	MaxConcurrentAgents    int    `json:"maxConcurrentAgents"`
	HealthCheckEndpoint    string `json:"healthCheckEndpoint"`
}

type monitoredAgent struct {
	AgentID       string `json:"agentId"`
	Namespace     string `json:"namespace"`
	Endpoint      string `json:"endpoint"`
	TrustPolicyRef string `json:"trustPolicyRef"`
}

type trustPolicy struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Severity string         `json:"severity"`
	Scope    string         `json:"scope"`
	Rules    []policyRule   `json:"rules"`
}

type policyRule struct {
	Type        string `json:"type"`
	Description string `json:"description"`
	Action      string `json:"action"`
}

type alertChannel struct {
	Type        string `json:"type"`
	Destination string `json:"destination"`
}

type sampleViolation struct {
	Timestamp    string `json:"timestamp"`
	AgentID      string `json:"agentId"`
	PolicyID     string `json:"policyId"`
	Severity     string `json:"severity"`
	Description  string `json:"description"`
	EvidenceRef  string `json:"evidenceRef"`
}

// TestContinuousVerificationDaemon validates that the wasmagent-ops repository
// is configured for continuous verification daemon operation and that the
// daemon fixture conforms to the expected schema.
func TestContinuousVerificationDaemon(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	// wasmagent-ops must exist for continuous verification daemon
	opsRepo, found := projectIndex.GetRepoByName("wasmagent-ops")
	if !found {
		t.Fatal("wasmagent-ops repository not found in project index — continuous verification daemon requires ops infrastructure")
	}

	// wasmagent-ops must be shipped
	if opsRepo.Status != "shipped" {
		t.Errorf("wasmagent-ops must be shipped for continuous verification daemon (status: %s)", opsRepo.Status)
	}

	// The summary must reference continuous verification daemon
	if !strings.Contains(strings.ToLower(opsRepo.Summary), "continuous verification") {
		t.Errorf("wasmagent-ops summary does not mention continuous verification daemon: %s", opsRepo.Summary)
	}

	// Load and validate the verification daemon fixture
	daemonContent, err := os.ReadFile("fixtures/verification-daemon-sample.json")
	if err != nil {
		t.Fatalf("Verification daemon fixture not found: %v", err)
	}

	var daemon verificationDaemon
	if err := json.Unmarshal(daemonContent, &daemon); err != nil {
		t.Fatalf("Verification daemon fixture contains invalid JSON: %v", err)
	}

	// Validate spec version
	if daemon.SpecVersion == "" {
		t.Error("Verification daemon fixture missing specVersion")
	}

	// Validate daemon configuration
	if daemon.DaemonConfig.PollIntervalSeconds <= 0 {
		t.Error("Daemon pollIntervalSeconds must be positive")
	}
	if daemon.DaemonConfig.AlertBackoffSeconds <= 0 {
		t.Error("Daemon alertBackoffSeconds must be positive")
	}
	if daemon.DaemonConfig.MaxConcurrentAgents <= 0 {
		t.Error("Daemon maxConcurrentAgents must be positive")
	}
	if daemon.DaemonConfig.HealthCheckEndpoint == "" {
		t.Error("Daemon healthCheckEndpoint must not be empty")
	}

	t.Logf("Continuous verification daemon validated: poll=%ds, backoff=%ds, maxAgents=%d",
		daemon.DaemonConfig.PollIntervalSeconds, daemon.DaemonConfig.AlertBackoffSeconds, daemon.DaemonConfig.MaxConcurrentAgents)
}

// TestTrustPolicyViolationAlerting validates that trust policies are properly
// defined with severity levels, rules, and that sample violations reference
// valid policies.
func TestTrustPolicyViolationAlerting(t *testing.T) {
	// Load the verification daemon fixture
	daemonContent, err := os.ReadFile("fixtures/verification-daemon-sample.json")
	if err != nil {
		t.Fatalf("Verification daemon fixture not found: %v", err)
	}

	var daemon verificationDaemon
	if err := json.Unmarshal(daemonContent, &daemon); err != nil {
		t.Fatalf("Verification daemon fixture contains invalid JSON: %v", err)
	}

	// Validate trust policies exist
	if len(daemon.TrustPolicies) == 0 {
		t.Fatal("No trust policies defined — daemon cannot monitor for violations")
	}

	// Validate each trust policy has required fields
	policyIDs := make(map[string]string) // id -> severity
	validSeverities := map[string]bool{"critical": true, "warning": true, "info": true}
	for _, policy := range daemon.TrustPolicies {
		if policy.ID == "" {
			t.Error("Trust policy has empty ID")
		}
		if policy.Name == "" {
			t.Errorf("Trust policy %s has empty name", policy.ID)
		}
		if !validSeverities[policy.Severity] {
			t.Errorf("Trust policy %s has unrecognized severity: %s", policy.ID, policy.Severity)
		}
		if policy.Scope == "" {
			t.Errorf("Trust policy %s has empty scope", policy.ID)
		}
		if len(policy.Rules) == 0 {
			t.Errorf("Trust policy %s has no rules defined", policy.ID)
		}
		for _, rule := range policy.Rules {
			if rule.Type == "" {
				t.Errorf("Rule in policy %s has empty type", policy.ID)
			}
			if rule.Description == "" {
				t.Errorf("Rule in policy %s has empty description", policy.ID)
			}
			if rule.Action == "" {
				t.Errorf("Rule in policy %s has empty action", policy.ID)
			}
		}
		policyIDs[policy.ID] = policy.Severity
	}

	// Validate sample violations reference valid policies
	if len(daemon.SampleViolations) == 0 {
		t.Fatal("No sample violations defined — daemon alerting cannot be validated")
	}

	for _, violation := range daemon.SampleViolations {
		if violation.AgentID == "" {
			t.Error("Sample violation has empty agentId")
		}
		if violation.PolicyID == "" {
			t.Error("Sample violation has empty policyId")
		}
		if violation.Timestamp == "" {
			t.Error("Sample violation has empty timestamp")
		}
		if violation.Description == "" {
			t.Error("Sample violation has empty description")
		}
		if violation.EvidenceRef == "" {
			t.Error("Sample violation has empty evidenceRef")
		}

		// Violation must reference a valid policy
		if _, exists := policyIDs[violation.PolicyID]; !exists {
			t.Errorf("Sample violation references unknown policy: %s", violation.PolicyID)
		}

		// Violation severity must match policy severity
		if expectedSeverity, exists := policyIDs[violation.PolicyID]; exists {
			if violation.Severity != expectedSeverity {
				t.Errorf("Sample violation severity %s does not match policy %s severity %s",
					violation.Severity, violation.PolicyID, expectedSeverity)
			}
		}
	}

	// Validate alert channels exist
	if len(daemon.AlertChannels) == 0 {
		t.Error("No alert channels defined — daemon cannot deliver alerts")
	}

	for _, channel := range daemon.AlertChannels {
		if channel.Type == "" {
			t.Error("Alert channel has empty type")
		}
		if channel.Destination == "" {
			t.Errorf("Alert channel %s has empty destination", channel.Type)
		}
	}

	t.Logf("Trust policy violation alerting validated: %d policies, %d violations, %d alert channels",
		len(daemon.TrustPolicies), len(daemon.SampleViolations), len(daemon.AlertChannels))
}

// TestMonitoredAgentIntegrity validates that each monitored agent has
// a valid namespace, endpoint, and trust policy reference, and that
// all agents referenced in violations are actually monitored.
func TestMonitoredAgentIntegrity(t *testing.T) {
	// Load the verification daemon fixture
	daemonContent, err := os.ReadFile("fixtures/verification-daemon-sample.json")
	if err != nil {
		t.Fatalf("Verification daemon fixture not found: %v", err)
	}

	var daemon verificationDaemon
	if err := json.Unmarshal(daemonContent, &daemon); err != nil {
		t.Fatalf("Verification daemon fixture contains invalid JSON: %v", err)
	}

	// Build set of monitored agent IDs
	monitoredAgentIDs := make(map[string]bool)
	for _, agent := range daemon.MonitoredAgents {
		if agent.AgentID == "" {
			t.Error("Monitored agent has empty agentId")
		}
		if agent.Namespace == "" {
			t.Errorf("Monitored agent %s has empty namespace", agent.AgentID)
		}
		if agent.Endpoint == "" {
			t.Errorf("Monitored agent %s has empty endpoint", agent.AgentID)
		}
		if agent.TrustPolicyRef == "" {
			t.Errorf("Monitored agent %s has empty trustPolicyRef", agent.AgentID)
		}
		monitoredAgentIDs[agent.AgentID] = true
	}

	if len(monitoredAgentIDs) == 0 {
		t.Error("No monitored agents defined — daemon has nothing to monitor")
	}

	// All agents referenced in violations must be monitored
	for _, violation := range daemon.SampleViolations {
		if !monitoredAgentIDs[violation.AgentID] {
			t.Errorf("Sample violation references agent %s which is not in the monitored agents list", violation.AgentID)
		}
	}

	t.Logf("Monitored agent integrity validated: %d agents monitored, %d have violations",
		len(monitoredAgentIDs), len(daemon.SampleViolations))
}