// Automated circuit breaker and transactional rollback mechanism tests.
//
// Exercises fail-fast circuit breaking, half-open recovery, transactional
// rollback, and the combined coordinator for the Milestone 6 reference
// surface:
//
// > `wasmagent-ops/resilience/`: Automated circuit breaker and transactional
// > rollback mechanism triggered on policy violation events

import { describe, expect, it } from "bun:test";

import type { PolicyViolationEvent, TransactionStep } from "./resilience";
import {
  CircuitBreakerOpenError,
  InvalidViolationEventError,
  PolicyCircuitBreaker,
  ResilienceCoordinator,
  TransactionAlreadyEndedError,
  TransactionNotFoundError,
  TransactionalRollbackManager,
} from "./resilience";

function violation(overrides: Partial<PolicyViolationEvent> = {}): PolicyViolationEvent {
  return {
    violationId: "v-1",
    agentId: "agent-1",
    timestamp: "2026-08-03T00:00:00.000Z",
    policyRef: "agentbom.policy.tool-admission",
    kind: "policy.denied",
    severity: 3,
    detail: "tool call not admitted by AgentBOM",
    ...overrides,
  };
}

const step = (operationId: string, name: string): TransactionStep => ({
  operationId,
  name,
  recordedAt: "2026-08-03T00:00:00.000Z",
});

describe("PolicyCircuitBreaker", () => {
  it("trips the circuit breaker after repeated policy violations", () => {
    const breaker = new PolicyCircuitBreaker("agent-1", { failureThreshold: 3 });
    const tripped: string[] = [];
    breaker.onTrip((snapshot) => tripped.push(snapshot.state));

    breaker.recordViolation(violation({ violationId: "v-1" }));
    breaker.recordViolation(violation({ violationId: "v-2" }));
    expect(breaker.getState().state).toBe("closed");

    breaker.recordViolation(violation({ violationId: "v-3" }));
    expect(breaker.getState().state).toBe("open");
    expect(tripped).toEqual(["open"]);
    expect(breaker.getState().consecutiveViolations).toBe(3);
  });

  it("fails fast while the circuit is open", () => {
    const breaker = new PolicyCircuitBreaker("agent-1", { failureThreshold: 2 });
    breaker.recordViolation(violation({ violationId: "v-1" }));
    breaker.recordViolation(violation({ violationId: "v-2" }));
    expect(breaker.getState().state).toBe("open");

    expect(() =>
      breaker.allowOperation({
        operationId: "op-1",
        agentId: "agent-1",
        name: "tool.call.write-file",
      }),
    ).toThrow(CircuitBreakerOpenError);
  });

  it("recovers through the half-open trial window after the cooldown elapses", () => {
    const breaker = new PolicyCircuitBreaker("agent-1", {
      failureThreshold: 2,
      cooldownMs: 5_000,
      maxTrials: 1,
    });
    breaker.recordViolation(
      violation({ violationId: "v-1", timestamp: "2026-08-03T00:00:00.000Z" }),
    );
    breaker.recordViolation(
      violation({ violationId: "v-2", timestamp: "2026-08-03T00:00:01.000Z" }),
    );
    expect(breaker.getState().state).toBe("open");

    const later = "2026-08-03T00:01:00.000Z";
    expect(breaker.getState(later).state).toBe("half_open");

    breaker.allowOperation({
      operationId: "op-1",
      agentId: "agent-1",
      name: "tool.call.read",
    });
    breaker.recordSuccess();
    const snapshot = breaker.getState(later);
    expect(snapshot.state).toBe("closed");
    expect(snapshot.consecutiveViolations).toBe(0);
  });

  it("trips immediately on a critical-severity violation", () => {
    const breaker = new PolicyCircuitBreaker("agent-1", {
      failureThreshold: 5,
      maxSeverity: 10,
    });
    breaker.recordViolation(violation({ violationId: "v-1", severity: 10 }));
    expect(breaker.getState().state).toBe("open");
  });

  it("rejects malformed violation events and mismatched agents", () => {
    const breaker = new PolicyCircuitBreaker("agent-1");
    expect(() => breaker.recordViolation(violation({ violationId: "" }))).toThrow(
      InvalidViolationEventError,
    );
    expect(() =>
      breaker.recordViolation(violation({ agentId: "other-agent" })),
    ).toThrow(InvalidViolationEventError);
  });
});

describe("TransactionalRollbackManager", () => {
  it("rolls back a transaction triggered by a policy violation", () => {
    const manager = new TransactionalRollbackManager();
    const txn = manager.begin("agent-1");
    manager.addStep(txn.transactionId, step("op-1", "data.write.ledger"));
    manager.addStep(txn.transactionId, step("op-2", "data.write.budget"));

    const record = manager.rollback(
      txn.transactionId,
      "policy violation v-1",
      "agentbom.policy.tool-admission",
    );
    expect(record.revertedSteps.map((s) => s.name)).toEqual([
      "data.write.ledger",
      "data.write.budget",
    ]);
    expect(record.policyRef).toBe("agentbom.policy.tool-admission");
    expect(manager.activeTransactions()).toHaveLength(0);
    expect(manager.getRollbackLog()).toHaveLength(1);
  });

  it("commits a transaction and refuses further steps or rollback", () => {
    const manager = new TransactionalRollbackManager();
    const txn = manager.begin("agent-1");
    manager.addStep(txn.transactionId, step("op-1", "network.read"));
    const committed = manager.commit(txn.transactionId);
    expect(committed.committed).toBe(true);

    expect(() => manager.addStep(txn.transactionId, step("op-2", "network.read"))).toThrow(
      TransactionAlreadyEndedError,
    );
    expect(() => manager.rollback(txn.transactionId, "late")).toThrow(
      TransactionAlreadyEndedError,
    );
  });

  it("rejects operations on unknown transactions", () => {
    const manager = new TransactionalRollbackManager();
    expect(() => manager.commit("txn:nope")).toThrow(TransactionNotFoundError);
    expect(() => manager.rollback("txn:nope", "unknown")).toThrow(
      TransactionNotFoundError,
    );
  });
});

describe("ResilienceCoordinator", () => {
  it("coordinates circuit tripping and transactional rollback from a single violation", () => {
    const coordinator = new ResilienceCoordinator({ failureThreshold: 2 });
    const txn = coordinator.beginTransaction("agent-1");
    coordinator.addStep(txn.transactionId, step("op-1", "data.write"));

    coordinator.onPolicyViolation(
      violation({ violationId: "v-1", transactionId: txn.transactionId }),
    );
    expect(coordinator.getCircuitState("agent-1").state).toBe("closed");

    coordinator.onPolicyViolation(
      violation({ violationId: "v-2", transactionId: txn.transactionId }),
    );
    expect(coordinator.getCircuitState("agent-1").state).toBe("open");
    expect(coordinator.getRollbackLog()).toHaveLength(2);
    expect(coordinator.activeTransactions()).toHaveLength(0);

    expect(() =>
      coordinator.allowOperation({
        operationId: "op-2",
        agentId: "agent-1",
        name: "tool.call.read",
      }),
    ).toThrow(CircuitBreakerOpenError);
  });
});
