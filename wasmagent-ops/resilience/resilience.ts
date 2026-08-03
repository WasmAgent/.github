/**
 * Automated circuit breaker and transactional rollback mechanism.
 *
 * Reference surface for the Milestone 6 bullet:
 *
 * > `wasmagent-ops/resilience/`: Automated circuit breaker and transactional
 * > rollback mechanism triggered on policy violation events
 *
 * Dependency-free by design (matching `wasmagent-js/runtime.ts`). Enforcement
 * points across the agent mesh emit typed policy-violation events
 * (`PolicyViolationEvent`). A `PolicyCircuitBreaker` tracks consecutive
 * violations per agent and trips from `closed` to `open` once the configured
 * failure threshold is crossed — or immediately on a critical-severity
 * violation. While `open`, `allowOperation()` fails fast with
 * `CircuitBreakerOpenError` so no further policy-violating work is admitted.
 * After a cooldown window the breaker enters `half_open` and admits a bounded
 * number of trial operations; a successful trial closes the circuit, a
 * further violation re-opens it.
 *
 * In parallel, a `TransactionalRollbackManager` keeps per-transaction step
 * logs (`begin()` / `addStep()` / `commit()`) and, on a policy violation,
 * `rollback()` reverts the in-flight transaction and produces a
 * `RollbackRecord` — the transactional complement to the circuit breaker's
 * fail-fast gate.
 *
 * A `ResilienceCoordinator` wires the two together: a single
 * `onPolicyViolation(event)` entry point feeds the circuit breaker (trip
 * accounting) and rolls back any in-flight transaction the violating
 * operation belonged to, giving operators one automated response path for
 * policy violation events.
 */

export type AgentId = string;
export type PolicyRef = string;
export type ViolationId = string;
export type TransactionId = string;
export type OperationId = string;

/** Lifecycle state of a circuit breaker. */
export type CircuitState = "closed" | "open" | "half_open";

/** A policy violation event emitted by an enforcement point. */
export interface PolicyViolationEvent {
  readonly violationId: ViolationId;
  readonly agentId: AgentId;
  /** ISO-8601 timestamp captured at detection time. */
  readonly timestamp: string;
  /** Policy reference that was violated, e.g. "agentbom.policy.tool-admission". */
  readonly policyRef: PolicyRef;
  /** Violation kind, e.g. "policy.denied" or "policy.drift". */
  readonly kind: string;
  /** Severity in 1..maxSeverity; higher is more severe. */
  readonly severity: number;
  /** Human-readable violation detail. */
  readonly detail: string;
  /** Optional enclosing transaction to roll back as part of the response. */
  readonly transactionId?: TransactionId;
}

/** An operation the agent is about to perform, gated by the breaker. */
export interface OperationDescriptor {
  readonly operationId: OperationId;
  readonly agentId: AgentId;
  /** Operation name, e.g. "tool.call.write-file". */
  readonly name: string;
  /** Optional enclosing transaction. */
  readonly transactionId?: TransactionId;
}

/** Immutable snapshot of a circuit breaker's state. */
export interface CircuitStateSnapshot {
  readonly agentId: AgentId;
  readonly state: CircuitState;
  /** Total violations recorded since the breaker was created or reset. */
  readonly violationsRecorded: number;
  /** Consecutive violations that count toward tripping the breaker. */
  readonly consecutiveViolations: number;
  /** ISO-8601 timestamp when the circuit opened, if it is open/half-open. */
  readonly openedAt: string | undefined;
  /** Trial operations still admitted while the circuit is half-open. */
  readonly halfOpenTrialsRemaining: number;
  /** ISO-8601 timestamp of the most recent violation, if any. */
  readonly lastViolationAt: string | undefined;
}

export class InvalidViolationEventError extends Error {
  constructor(reason: string) {
    super(`invalid policy violation event: ${reason}`);
    this.name = "InvalidViolationEventError";
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(agentId: AgentId, violations: number) {
    super(
      `circuit breaker is open for agent ${agentId}: ${violations} consecutive policy violations`,
    );
    this.name = "CircuitBreakerOpenError";
  }
}

export class TransactionNotFoundError extends Error {
  constructor(transactionId: TransactionId) {
    super(`transaction ${transactionId} not found`);
    this.name = "TransactionNotFoundError";
  }
}

export class TransactionAlreadyEndedError extends Error {
  constructor(transactionId: TransactionId) {
    super(
      `transaction ${transactionId} has already been committed or rolled back`,
    );
    this.name = "TransactionAlreadyEndedError";
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive violations that trip the breaker (default 3). */
  readonly failureThreshold?: number;
  /** Milliseconds the circuit stays open before half-open (default 30000). */
  readonly cooldownMs?: number;
  /** Trial operations admitted in half-open before re-tripping (default 1). */
  readonly maxTrials?: number;
  /** Maximum severity a single violation can carry (default 10). */
  readonly maxSeverity?: number;
}

/** Clamp a violation's severity into 1..maxSeverity. */
export function violationSeverity(
  event: PolicyViolationEvent,
  maxSeverity: number,
): number {
  const raw = event.severity;
  const severity =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 1;
  return Math.min(severity, Math.max(1, maxSeverity));
}

/** Validate a policy violation event before it is recorded. */
export function validateViolationEvent(event: PolicyViolationEvent): void {
  if (!event || typeof event !== "object") {
    throw new InvalidViolationEventError("event must be an object");
  }
  if (!event.violationId || typeof event.violationId !== "string") {
    throw new InvalidViolationEventError("violationId is required");
  }
  if (!event.agentId || typeof event.agentId !== "string") {
    throw new InvalidViolationEventError("agentId is required");
  }
  if (!event.policyRef || typeof event.policyRef !== "string") {
    throw new InvalidViolationEventError("policyRef is required");
  }
  if (!event.kind || typeof event.kind !== "string") {
    throw new InvalidViolationEventError("kind is required");
  }
  if (!event.timestamp || typeof event.timestamp !== "string") {
    throw new InvalidViolationEventError("timestamp is required");
  }
}

/**
 * The automated circuit breaker half of the resilience mechanism. It tracks
 * policy violations per agent and, once the configured failure threshold is
 * crossed (or a critical-severity violation arrives), trips from `closed` to
 * `open`. While open, `allowOperation()` fails fast. After a cooldown the
 * breaker probes with a bounded half-open trial budget, closing again on
 * success and re-opening on any further violation.
 */
export class PolicyCircuitBreaker {
  private readonly agentId: AgentId;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly maxTrials: number;
  private readonly maxSeverity: number;
  private readonly tripCallbacks = new Set<
    (snapshot: CircuitStateSnapshot) => void
  >();
  private readonly closeCallbacks = new Set<
    (snapshot: CircuitStateSnapshot) => void
  >();
  private state: CircuitState = "closed";
  private violationsRecorded = 0;
  private consecutiveViolations = 0;
  private lastViolationAt: string | undefined;
  private openedAt: string | undefined;
  private halfOpenTrialsRemaining = 0;

  constructor(agentId: AgentId, options: CircuitBreakerOptions = {}) {
    if (!agentId) throw new InvalidViolationEventError("agentId is required");
    this.agentId = agentId;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.maxTrials = options.maxTrials ?? 1;
    this.maxSeverity = options.maxSeverity ?? 10;
    if (this.failureThreshold <= 0) {
      throw new InvalidViolationEventError("failureThreshold must be positive");
    }
    if (this.cooldownMs <= 0) {
      throw new InvalidViolationEventError("cooldownMs must be positive");
    }
    if (this.maxTrials <= 0) {
      throw new InvalidViolationEventError("maxTrials must be positive");
    }
  }

  /** Agent ID this breaker protects. */
  getAgentId(): AgentId {
    return this.agentId;
  }

  /**
   * Snapshot the breaker's current state. Calling this after the cooldown
   * window automatically transitions `open` → `half_open` and grants the
   * trial budget, which is how a tripped circuit recovers over time.
   */
  getState(now: string = new Date().toISOString()): CircuitStateSnapshot {
    if (this.state === "open" && this.cooldownElapsed(now)) {
      this.state = "half_open";
      this.halfOpenTrialsRemaining = this.maxTrials;
    }
    return {
      agentId: this.agentId,
      state: this.state,
      violationsRecorded: this.violationsRecorded,
      consecutiveViolations: this.consecutiveViolations,
      openedAt: this.openedAt,
      halfOpenTrialsRemaining: this.halfOpenTrialsRemaining,
      lastViolationAt: this.lastViolationAt,
    };
  }

  /**
   * Record a policy violation event. While `closed`, consecutive violations
   * accumulate and trip the breaker when they reach the failure threshold, or
   * immediately when the violation's severity is at the maximum. While
   * `half_open`, any violation re-opens the circuit immediately.
   */
  recordViolation(event: PolicyViolationEvent): CircuitStateSnapshot {
    validateViolationEvent(event);
    if (event.agentId !== this.agentId) {
      throw new InvalidViolationEventError(
        `agentId ${event.agentId} does not match breaker agent ${this.agentId}`,
      );
    }
    this.violationsRecorded += 1;
    this.lastViolationAt = event.timestamp;
    const severity = violationSeverity(event, this.maxSeverity);

    if (this.state === "half_open") {
      this.open();
      return this.getState(event.timestamp);
    }

    this.consecutiveViolations += 1;
    if (
      severity >= this.maxSeverity ||
      this.consecutiveViolations >= this.failureThreshold
    ) {
      this.open();
    }
    return this.getState(event.timestamp);
  }

  /**
   * Gate an operation against the breaker. Throws `CircuitBreakerOpenError`
   * while the circuit is open; in `half_open` each allowed operation consumes
   * a trial slot, bounding the blast radius while probing.
   */
  allowOperation(operation: OperationDescriptor): void {
    if (!operation || !operation.operationId) {
      throw new InvalidViolationEventError("operation.operationId is required");
    }
    if (!operation.name) {
      throw new InvalidViolationEventError("operation.name is required");
    }
    if (operation.agentId !== this.agentId) {
      throw new InvalidViolationEventError(
        `agentId ${operation.agentId} does not match breaker agent ${this.agentId}`,
      );
    }
    const snapshot = this.getState();
    if (snapshot.state === "open") {
      throw new CircuitBreakerOpenError(this.agentId, this.consecutiveViolations);
    }
    if (snapshot.state === "half_open") {
      if (this.halfOpenTrialsRemaining <= 0) {
        throw new CircuitBreakerOpenError(this.agentId, this.consecutiveViolations);
      }
      this.halfOpenTrialsRemaining -= 1;
    }
  }

  /**
   * Record a successful operation. In `half_open`, a success closes the
   * circuit and resets the violation counters; in `closed` it resets the
   * consecutive-violation streak so only genuinely consecutive violations
   * trip the breaker.
   */
  recordSuccess(): CircuitStateSnapshot {
    if (this.state === "half_open") {
      this.close();
    } else {
      this.consecutiveViolations = 0;
    }
    return this.getState();
  }

  /** Manually reset the breaker to a pristine closed state. */
  reset(): CircuitStateSnapshot {
    this.state = "closed";
    this.violationsRecorded = 0;
    this.consecutiveViolations = 0;
    this.lastViolationAt = undefined;
    this.openedAt = undefined;
    this.halfOpenTrialsRemaining = 0;
    return this.getState();
  }

  /** Subscribe to circuit-open transitions. Returns an unsubscribe function. */
  onTrip(callback: (snapshot: CircuitStateSnapshot) => void): () => void {
    this.tripCallbacks.add(callback);
    return () => this.tripCallbacks.delete(callback);
  }

  /** Subscribe to circuit-close transitions. Returns an unsubscribe function. */
  onClose(callback: (snapshot: CircuitStateSnapshot) => void): () => void {
    this.closeCallbacks.add(callback);
    return () => this.closeCallbacks.delete(callback);
  }

  private cooldownElapsed(now: string): boolean {
    if (this.openedAt === undefined) return false;
    const opened = Date.parse(this.openedAt);
    const current = Date.parse(now);
    if (Number.isNaN(opened) || Number.isNaN(current)) return false;
    return current - opened >= this.cooldownMs;
  }

  private open(): void {
    if (this.state === "open") return;
    this.state = "open";
    this.openedAt = new Date().toISOString();
    this.halfOpenTrialsRemaining = 0;
    const snapshot = this.getState(this.openedAt);
    for (const callback of this.tripCallbacks) {
      callback(snapshot);
    }
  }

  private close(): void {
    if (this.state !== "half_open") return;
    this.state = "closed";
    this.consecutiveViolations = 0;
    this.halfOpenTrialsRemaining = 0;
    this.openedAt = undefined;
    const snapshot = this.getState();
    for (const callback of this.closeCallbacks) {
      callback(snapshot);
    }
  }
}

/** A step recorded inside a transaction, reverted on rollback. */
export interface TransactionStep {
  readonly operationId: OperationId;
  /** Operation name executed inside the transaction. */
  readonly name: string;
  /** ISO-8601 timestamp when the step was recorded. */
  readonly recordedAt: string;
}

/** An in-flight or finished transaction. */
export interface Transaction {
  readonly transactionId: TransactionId;
  readonly agentId: AgentId;
  /** ISO-8601 timestamp when the transaction began. */
  readonly startedAt: string;
  /** Steps recorded in the transaction so far, in execution order. */
  readonly steps: readonly TransactionStep[];
  readonly committed: boolean;
  readonly rolledBack: boolean;
}

/** Result of a transactional rollback triggered by a policy violation. */
export interface RollbackRecord {
  readonly transactionId: TransactionId;
  readonly agentId: AgentId;
  /** ISO-8601 timestamp when the rollback completed. */
  readonly rolledBackAt: string;
  /** Reason captured from the triggering violation. */
  readonly reason: string;
  /** Policy reference that triggered the rollback, if a violation did. */
  readonly policyRef: PolicyRef | undefined;
  /** Steps reverted, in execution order. */
  readonly revertedSteps: readonly TransactionStep[];
}

export interface RollbackManagerOptions {
  /** Maximum simultaneously tracked transactions (default 1000). */
  readonly maxTransactions?: number;
}

interface MutableTransaction {
  transactionId: TransactionId;
  agentId: AgentId;
  startedAt: string;
  steps: TransactionStep[];
  committed: boolean;
  rolledBack: boolean;
}

function snapshotTransaction(txn: MutableTransaction): Transaction {
  return {
    transactionId: txn.transactionId,
    agentId: txn.agentId,
    startedAt: txn.startedAt,
    steps: [...txn.steps],
    committed: txn.committed,
    rolledBack: txn.rolledBack,
  };
}

/**
 * The transactional rollback half of the resilience mechanism. It tracks
 * per-agent transactions with a step log (`begin()` / `addStep()` /
 * `commit()`) and, on a policy violation, `rollback()` reverts the in-flight
 * transaction and produces a `RollbackRecord` describing every reverted step
 * in execution order.
 */
export class TransactionalRollbackManager {
  private readonly maxTransactions: number;
  private readonly transactions = new Map<TransactionId, MutableTransaction>();
  private readonly rollbackLog: RollbackRecord[] = [];
  private nextTransactionId = 0;

  constructor(options: RollbackManagerOptions = {}) {
    this.maxTransactions = options.maxTransactions ?? 1000;
    if (this.maxTransactions <= 0) {
      throw new InvalidViolationEventError("maxTransactions must be positive");
    }
  }

  /** Begin a new transaction for an agent. */
  begin(agentId: AgentId): Transaction {
    if (!agentId) throw new InvalidViolationEventError("agentId is required");
    if (this.transactions.size >= this.maxTransactions) {
      throw new InvalidViolationEventError(
        `transaction table is full (${this.maxTransactions} transactions)`,
      );
    }
    const transactionId = `txn:${this.nextTransactionId++}`;
    const txn: MutableTransaction = {
      transactionId,
      agentId,
      startedAt: new Date().toISOString(),
      steps: [],
      committed: false,
      rolledBack: false,
    };
    this.transactions.set(transactionId, txn);
    return snapshotTransaction(txn);
  }

  /** Record a step inside an in-flight transaction. */
  addStep(transactionId: TransactionId, step: TransactionStep): Transaction {
    const txn = this.lookup(transactionId);
    if (txn.committed || txn.rolledBack) {
      throw new TransactionAlreadyEndedError(transactionId);
    }
    if (!step || !step.operationId) {
      throw new InvalidViolationEventError("step.operationId is required");
    }
    if (!step.name) {
      throw new InvalidViolationEventError("step.name is required");
    }
    txn.steps.push({
      operationId: step.operationId,
      name: step.name,
      recordedAt: step.recordedAt ?? new Date().toISOString(),
    });
    return snapshotTransaction(txn);
  }

  /** Commit an in-flight transaction. */
  commit(transactionId: TransactionId): Transaction {
    const txn = this.lookup(transactionId);
    if (txn.committed || txn.rolledBack) {
      throw new TransactionAlreadyEndedError(transactionId);
    }
    txn.committed = true;
    return snapshotTransaction(txn);
  }

  /**
   * Roll back an in-flight transaction, producing a `RollbackRecord` listing
   * every reverted step in execution order.
   */
  rollback(
    transactionId: TransactionId,
    reason: string,
    policyRef?: PolicyRef,
  ): RollbackRecord {
    const txn = this.lookup(transactionId);
    if (txn.committed || txn.rolledBack) {
      throw new TransactionAlreadyEndedError(transactionId);
    }
    txn.rolledBack = true;
    const record: RollbackRecord = {
      transactionId,
      agentId: txn.agentId,
      rolledBackAt: new Date().toISOString(),
      reason,
      policyRef,
      revertedSteps: [...txn.steps],
    };
    this.rollbackLog.push(record);
    return record;
  }

  /**
   * Roll back an in-flight transaction if it is still active. Returns the
   * `RollbackRecord`, or `undefined` when the transaction is unknown or
   * already ended — automated violation handlers can attempt rollback without
   * failing on benign race conditions.
   */
  tryRollback(
    transactionId: TransactionId,
    reason: string,
    policyRef?: PolicyRef,
  ): RollbackRecord | undefined {
    const txn = this.transactions.get(transactionId);
    if (!txn || txn.committed || txn.rolledBack) return undefined;
    return this.rollback(transactionId, reason, policyRef);
  }

  /** Every rollback produced so far, in production order. */
  getRollbackLog(): readonly RollbackRecord[] {
    return [...this.rollbackLog];
  }

  /** Transactions that are still in-flight (not committed or rolled back). */
  activeTransactions(): readonly Transaction[] {
    const active: Transaction[] = [];
    for (const txn of this.transactions.values()) {
      if (!txn.committed && !txn.rolledBack) {
        active.push(snapshotTransaction(txn));
      }
    }
    return active;
  }

  private lookup(transactionId: TransactionId): MutableTransaction {
    const txn = this.transactions.get(transactionId);
    if (!txn) throw new TransactionNotFoundError(transactionId);
    return txn;
  }
}

export interface ResilienceCoordinatorOptions {
  /** Consecutive violations that trip the per-agent breaker (default 3). */
  readonly failureThreshold?: number;
  /** Milliseconds a breaker stays open before half-open (default 30000). */
  readonly cooldownMs?: number;
  /** Trial operations admitted in half-open (default 1). */
  readonly maxTrials?: number;
}

/** Outcome of feeding a policy violation event to the coordinator. */
export interface ViolationOutcome {
  readonly event: PolicyViolationEvent;
  readonly circuit: CircuitStateSnapshot;
  /** Rollback record if the violation referenced an in-flight transaction. */
  readonly rollback: RollbackRecord | undefined;
}

/**
 * Wires the circuit breaker and the transactional rollback manager behind one
 * automated entry point: `onPolicyViolation(event)` trips the per-agent
 * circuit breaker and rolls back the violating transaction in a single call.
 */
export class ResilienceCoordinator {
  private readonly options: ResilienceCoordinatorOptions;
  private readonly breakers = new Map<AgentId, PolicyCircuitBreaker>();
  private readonly transactions = new TransactionalRollbackManager();

  constructor(options: ResilienceCoordinatorOptions = {}) {
    this.options = options;
  }

  /**
   * The single automated response path for a policy violation event: feeds the
   * per-agent circuit breaker (trip accounting) and rolls back the in-flight
   * transaction the violating operation belonged to, if any.
   */
  onPolicyViolation(event: PolicyViolationEvent): ViolationOutcome {
    validateViolationEvent(event);
    const circuit = this.breakerFor(event.agentId).recordViolation(event);
    let rollback: RollbackRecord | undefined;
    if (event.transactionId !== undefined) {
      rollback = this.transactions.tryRollback(
        event.transactionId,
        `policy violation ${event.violationId}: ${event.detail}`,
        event.policyRef,
      );
    }
    return { event, circuit, rollback };
  }

  /** Gate an operation against the agent's circuit breaker. */
  allowOperation(operation: OperationDescriptor): void {
    this.breakerFor(operation.agentId).allowOperation(operation);
  }

  /** Record a successful operation for the agent (closes half-open trials). */
  recordSuccess(agentId: AgentId): CircuitStateSnapshot {
    return this.breakerFor(agentId).recordSuccess();
  }

  /** Begin a new transaction managed by the coordinator. */
  beginTransaction(agentId: AgentId): Transaction {
    return this.transactions.begin(agentId);
  }

  /** Record a step inside a coordinator-managed transaction. */
  addStep(transactionId: TransactionId, step: TransactionStep): Transaction {
    return this.transactions.addStep(transactionId, step);
  }

  /** Commit a coordinator-managed transaction. */
  commitTransaction(transactionId: TransactionId): Transaction {
    return this.transactions.commit(transactionId);
  }

  /** Snapshot the agent's circuit breaker state. */
  getCircuitState(agentId: AgentId): CircuitStateSnapshot {
    return this.breakerFor(agentId).getState();
  }

  /** Every rollback the coordinator has produced, in production order. */
  getRollbackLog(): readonly RollbackRecord[] {
    return this.transactions.getRollbackLog();
  }

  /** Coordinator-managed transactions still in-flight. */
  activeTransactions(): readonly Transaction[] {
    return this.transactions.activeTransactions();
  }

  private breakerFor(agentId: AgentId): PolicyCircuitBreaker {
    let breaker = this.breakers.get(agentId);
    if (!breaker) {
      breaker = new PolicyCircuitBreaker(agentId, this.options);
      this.breakers.set(agentId, breaker);
    }
    return breaker;
  }
}
