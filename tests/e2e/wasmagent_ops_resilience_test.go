package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestWasmagentOpsResilience validates the wasmagent-ops/resilience reference
// surface for the Milestone 6 bullet:
//
//	wasmagent-ops/resilience/: Automated circuit breaker and transactional
//	rollback mechanism triggered on policy violation events
//
// It checks that:
//   - wasmagent-ops/resilience/resilience.ts ships a PolicyCircuitBreaker with
//     fail-fast operation gating (recordViolation / allowOperation /
//     recordSuccess with closed → open → half_open recovery), a
//     TransactionalRollbackManager with begin/addStep/commit/rollback and
//     RollbackRecord production, and a ResilienceCoordinator wiring both
//     behind a single onPolicyViolation entry point.
//   - wasmagent-ops/resilience/resilience.test.ts exercises circuit tripping,
//     fail-fast rejection, half-open recovery, transactional rollback, and
//     coordinator integration.
//   - The Milestone 6 bullet in docs/15-milestones.md is marked complete so the
//     hub roadmap tracks the shipped surface.
func TestWasmagentOpsResilience(t *testing.T) {
	resilienceDir := filepath.Join("..", "..", "wasmagent-ops", "resilience")

	// 1. Reference implementation must ship the resilience surface.
	driverPath := filepath.Join(resilienceDir, "resilience.ts")
	driverSource, err := os.ReadFile(driverPath)
	if err != nil {
		t.Fatalf("wasmagent-ops/resilience/resilience.ts is missing: %v", err)
	}
	for _, fragment := range []string{
		"export class PolicyCircuitBreaker",
		"export class TransactionalRollbackManager",
		"export class ResilienceCoordinator",
		"export class CircuitBreakerOpenError",
		"export class TransactionNotFoundError",
		"export interface PolicyViolationEvent",
		"export interface CircuitStateSnapshot",
		"export interface Transaction",
		"export interface RollbackRecord",
		"export type CircuitState",
		"recordViolation(",
		"allowOperation(",
		"recordSuccess(",
		"begin(",
		"commit(",
		"rollback(",
		"onPolicyViolation(",
	} {
		if !strings.Contains(string(driverSource), fragment) {
			t.Errorf("wasmagent-ops/resilience resilience.ts is missing required capability %q", fragment)
		}
	}

	// 2. Reference tests must cover circuit tripping, fail-fast rejection,
	// half-open recovery, transactional rollback, and coordinator integration.
	testPath := filepath.Join(resilienceDir, "resilience.test.ts")
	testSource, err := os.ReadFile(testPath)
	if err != nil {
		t.Fatalf("wasmagent-ops/resilience coverage is missing: %v", err)
	}
	for _, scenario := range []string{
		"trips the circuit breaker after repeated policy violations",
		"fails fast while the circuit is open",
		"recovers through the half-open trial window after the cooldown elapses",
		"rolls back a transaction triggered by a policy violation",
		"coordinates circuit tripping and transactional rollback from a single violation",
	} {
		if !strings.Contains(string(testSource), scenario) {
			t.Errorf("wasmagent-ops/resilience test is missing scenario %q", scenario)
		}
	}

	// 3. The milestone bullet must be marked complete.
	milestones, err := os.ReadFile("../../docs/15-milestones.md")
	if err != nil {
		t.Fatalf("Failed to read docs/15-milestones.md: %v", err)
	}
	bulletFound := false
	for _, line := range strings.Split(string(milestones), "\n") {
		if strings.Contains(line, "`wasmagent-ops/resilience/`") {
			bulletFound = true
			if !strings.HasPrefix(strings.TrimSpace(line), "- [x]") {
				t.Errorf("wasmagent-ops/resilience milestone bullet is not checked: %s", line)
			}
		}
	}
	if !bulletFound {
		t.Error("wasmagent-ops/resilience milestone bullet not found in docs/15-milestones.md")
	}

	t.Log("Automated circuit breaker and transactional rollback mechanism validated for wasmagent-ops")
}
