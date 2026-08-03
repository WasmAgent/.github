package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/WasmAgent/.github/pkg/docs"
)

// TestWasmOPARegoPolicyEvaluator validates the agentbom/policy reference
// artifacts for the Milestone 6 bullet:
//
//	agentbom/policy/: Embed WebAssembly-native Open Policy Agent (OPA/Rego)
//	evaluator for inline runtime guardrail enforcement
//
// It checks that:
//   - agentbom/policy/ ships a Rego module (guardrails.rego) with a
//     fail-closed `allow` entrypoint for inline guardrail decisions.
//   - agentbom/policy/ ships an OPA/Rego WASM evaluator configuration schema
//     and a conformant sample config.
//   - The wasmagent-js runtime exposes the inline enforcement point
//     (TrustPolicy.evaluate) so an embedded OPA/Rego WASM evaluator can gate
//     requests before execution.
//   - The project index advertises the evaluator on the agentbom repo (the
//     owning repo of the policy/ surface).
func TestWasmOPARegoPolicyEvaluator(t *testing.T) {
	policyDir := filepath.Join("..", "..", "agentbom", "policy")

	// 1. Rego module must exist with the fail-closed guardrail entrypoint.
	regoPath := filepath.Join(policyDir, "guardrails.rego")
	regoSource, err := os.ReadFile(regoPath)
	if err != nil {
		t.Fatalf("agentbom/policy/guardrails.rego is missing: %v", err)
	}
	for _, fragment := range []string{
		"package wasmagent.guardrails",
		"default allow := false",
		"allow {",
	} {
		if !strings.Contains(string(regoSource), fragment) {
			t.Errorf("guardrails.rego is missing required fragment %q", fragment)
		}
	}

	// 2. Evaluator configuration schema must exist and parse as JSON.
	schemaPath := filepath.Join(policyDir, "opa-evaluator-config.schema.json")
	schemaContent, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("opa-evaluator-config.schema.json is missing: %v", err)
	}
	var schema map[string]interface{}
	if err := json.Unmarshal(schemaContent, &schema); err != nil {
		t.Fatalf("opa-evaluator-config.schema.json is not valid JSON: %v", err)
	}
	if schema["title"] != "OPA/Rego WASM Evaluator Configuration" {
		t.Errorf("evaluator config schema has unexpected title: %v", schema["title"])
	}

	// 3. Sample evaluator config must exist and carry the WASM embed fields.
	samplePath := filepath.Join(policyDir, "opa-evaluator-config-sample.json")
	sampleContent, err := os.ReadFile(samplePath)
	if err != nil {
		t.Fatalf("opa-evaluator-config-sample.json is missing: %v", err)
	}
	var sample struct {
		EvaluatorFormat string `json:"evaluatorFormat"`
		SpecVersion     string `json:"specVersion"`
		Entrypoint      string `json:"entrypoint"`
		Decision        string `json:"decision"`
		FailClosed      bool   `json:"failClosed"`
		WasmModule      struct {
			Name   string `json:"name"`
			Source string `json:"source"`
			SHA256 string `json:"sha256"`
		} `json:"wasmModule"`
		InputEnvelope struct {
			Tool                 string   `json:"tool"`
			Action               string   `json:"action"`
			DeclaredTools        []string `json:"declared_tools"`
			DeclaredCapabilities []string `json:"declared_capabilities"`
		} `json:"inputEnvelope"`
	}
	if err := json.Unmarshal(sampleContent, &sample); err != nil {
		t.Fatalf("opa-evaluator-config-sample.json is not valid JSON: %v", err)
	}
	if sample.EvaluatorFormat != "OPARegoWasmEvaluator" {
		t.Errorf("sample evaluator format = %q, want OPARegoWasmEvaluator", sample.EvaluatorFormat)
	}
	if sample.Entrypoint != "wasmagent.guardrails/allow" {
		t.Errorf("sample entrypoint = %q, want wasmagent.guardrails/allow", sample.Entrypoint)
	}
	if sample.Decision != "allow" {
		t.Errorf("sample decision = %q, want allow", sample.Decision)
	}
	if !sample.FailClosed {
		t.Error("sample evaluator must fail closed by default")
	}
	if sample.WasmModule.Name == "" || sample.WasmModule.Source == "" || sample.WasmModule.SHA256 == "" {
		t.Error("sample evaluator config must reference the compiled WASM module (name/source/sha256)")
	}
	if len(sample.InputEnvelope.DeclaredTools) == 0 || len(sample.InputEnvelope.DeclaredCapabilities) == 0 {
		t.Error("sample input envelope must declare tools and capabilities for guardrail evaluation")
	}

	// 4. The wasmagent-js runtime must expose the inline policy evaluation hook
	// so an embedded OPA/Rego WASM evaluator can gate requests before execution.
	runtimePath := filepath.Join("..", "..", "wasmagent-js", "runtime.ts")
	runtimeSource, err := os.ReadFile(runtimePath)
	if err != nil {
		t.Fatalf("wasmagent-js runtime is missing: %v", err)
	}
	for _, fragment := range []string{
		"evaluate?: (",
		"PolicyDecision",
		"evaluateTrustPolicy",
	} {
		if !strings.Contains(string(runtimeSource), fragment) {
			t.Errorf("wasmagent-js runtime is missing inline policy evaluation capability %q", fragment)
		}
	}

	// 5. The project index must advertise the WASM-native OPA/Rego evaluator on
	// the agentbom repository (the owning repo of the policy/ surface).
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}
	agentbomRepo, found := projectIndex.GetRepoByName("agentbom")
	if !found {
		t.Fatal("agentbom repository not found in project index")
	}
	if !strings.Contains(strings.ToLower(agentbomRepo.Summary), "opa/rego") {
		t.Errorf("agentbom summary does not mention the OPA/Rego evaluator: %s", agentbomRepo.Summary)
	}

	t.Logf("WASM-native OPA/Rego evaluator validated: %s", sample.Entrypoint)
}
