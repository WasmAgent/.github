package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWasmagentJSRuntimeContract(t *testing.T) {
	runtimePath := filepath.Join("..", "..", "wasmagent-js", "runtime.ts")
	runtimeSource, err := os.ReadFile(runtimePath)
	if err != nil {
		t.Fatalf("wasmagent-js runtime is missing: %v", err)
	}

	for _, symbol := range []string{
		"export class MultiTenantVerificationRuntime",
		"registerTenant(tenantId: TenantId, policy: TrustPolicy)",
		"maxConcurrentVerifications",
		"getAuditLog(tenantId: TenantId, agentId?: AgentId)",
	} {
		if !strings.Contains(string(runtimeSource), symbol) {
			t.Errorf("wasmagent-js runtime is missing required capability %q", symbol)
		}
	}

	testPath := filepath.Join("..", "..", "wasmagent-js", "runtime.test.ts")
	testSource, err := os.ReadFile(testPath)
	if err != nil {
		t.Fatalf("wasmagent-js runtime coverage is missing: %v", err)
	}
	for _, scenario := range []string{
		"isolates concurrency gates so another tenant can verify concurrently",
		"evaluates and records each tenant with its own trust policy",
	} {
		if !strings.Contains(string(testSource), scenario) {
			t.Errorf("wasmagent-js runtime test is missing scenario %q", scenario)
		}
	}
}
