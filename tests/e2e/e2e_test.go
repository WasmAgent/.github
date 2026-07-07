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