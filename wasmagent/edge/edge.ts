/**
 * Low-latency WasmAgent edge runtime.
 *
 * Reference surface for the Milestone 6 bullet:
 *
 * > `wasmagent/edge/`: Low-latency WasmAgent edge runtime supporting offline
 * > evidence buffering and eventual ledger synchronization
 *
 * Dependency-free by design (matching `wasmagent-js/runtime.ts`). The edge
 * runtime keeps agent execution off the network critical path: every AEP
 * evidence event is appended to an in-process offline buffer synchronously,
 * and a background sync loop flushes buffered evidence to the distributed
 * trust ledger whenever connectivity is available. When the ledger becomes
 * unreachable the runtime keeps serving agent steps, buffering all evidence,
 * and resumes eventual ledger synchronization as soon as the transport is
 * reachable again — so an edge agent survives network partitions without
 * losing an evidence record.
 */

export type AgentId = string;
export type LedgerId = string;
export type EvidenceId = string;
export type StepId = string;

/** A single AEP evidence event produced during edge execution. */
export interface EvidenceEvent {
  readonly evidenceId: EvidenceId;
  readonly agentId: AgentId;
  /** ISO-8601 timestamp captured at emission time. */
  readonly timestamp: string;
  /** Event kind, e.g. "aep.step.executed" or "aep.tool.call". */
  readonly kind: string;
  /** Optional event payload (tool inputs, hashes, signature refs, ...). */
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Acknowledged ledger append returned by the transport. */
export interface LedgerSyncResult {
  readonly ledgerId: LedgerId;
  /** Number of buffered evidence events durably appended to the ledger. */
  readonly syncedCount: number;
  /** ISO-8601 timestamp of the ledger acknowledgement. */
  readonly syncedAt: string;
}

/** Snapshot of the offline evidence buffer. */
export interface OfflineBufferStats {
  /** Number of evidence events currently buffered offline. */
  readonly bufferedCount: number;
  /** Timestamp of the oldest buffered evidence event, if any. */
  readonly oldestBufferedAt: string | undefined;
  /** Estimated serialized size of the buffered events, in bytes. */
  readonly totalBytes: number;
}

/** A single agent step executed on the edge runtime. */
export interface AgentStep {
  readonly stepId: StepId;
  readonly operation: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** Outcome of executing a single agent step on the edge. */
export interface AgentStepResult {
  readonly stepId: StepId;
  readonly accepted: boolean;
  /** Wall-clock latency of the local step execution, in milliseconds. */
  readonly durationMs: number;
  /** Evidence ID of the AEP event recorded for this step. */
  readonly evidenceId: EvidenceId;
}

/**
 * Pluggable distributed trust ledger transport. Production implementations
 * talk to a WasmAgent mesh sync node or the cross-domain trust ledger; tests
 * use a fake that can be flipped between online and offline states.
 */
export interface LedgerTransport {
  readonly ledgerId: LedgerId;
  /** Whether the ledger is reachable right now. */
  isOnline(): boolean;
  /** Durably append evidence events to the ledger. */
  append(events: readonly EvidenceEvent[]): Promise<LedgerSyncResult>;
}

export class InvalidEvidenceEventError extends Error {
  constructor(reason: string) {
    super(`invalid evidence event: ${reason}`);
    this.name = "InvalidEvidenceEventError";
  }
}

export class EvidenceBufferFullError extends Error {
  constructor(agentId: AgentId, capacity: number) {
    super(`offline evidence buffer for agent ${agentId} is full (${capacity} events)`);
    this.name = "EvidenceBufferFullError";
  }
}

export class LedgerSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerSyncError";
  }
}

export interface EdgeEvidenceRuntimeOptions {
  readonly agentId: AgentId;
  readonly transport: LedgerTransport;
  /** Max buffered evidence events before recordEvidence throws (default 10000). */
  readonly maxBufferSize?: number;
  /** Interval between background ledger sync attempts (default 1000ms). */
  readonly syncIntervalMs?: number;
  /** Start the background sync loop on start() (default true). */
  readonly autoSync?: boolean;
}

/** Estimate the serialized byte size of an evidence event. */
export function estimateEvidenceBytes(event: EvidenceEvent): number {
  try {
    return new TextEncoder().encode(JSON.stringify(event)).byteLength;
  } catch {
    return 0;
  }
}

/** Validate an evidence event before it is buffered. */
export function validateEvidenceEvent(event: EvidenceEvent): void {
  if (!event || typeof event !== "object") {
    throw new InvalidEvidenceEventError("event must be an object");
  }
  if (!event.evidenceId || typeof event.evidenceId !== "string") {
    throw new InvalidEvidenceEventError("evidenceId is required");
  }
  if (!event.agentId || typeof event.agentId !== "string") {
    throw new InvalidEvidenceEventError("agentId is required");
  }
  if (!event.kind || typeof event.kind !== "string") {
    throw new InvalidEvidenceEventError("kind is required");
  }
  if (!event.timestamp || typeof event.timestamp !== "string") {
    throw new InvalidEvidenceEventError("timestamp is required");
  }
}

/**
 * The low-latency WasmAgent edge runtime.
 *
 * Agent steps are executed synchronously with no network I/O on the critical
 * path; every step's AEP evidence event is buffered in-process. A background
 * sync loop (or an explicit `flushBuffered()` call) pushes buffered evidence
 * to the ledger transport once connectivity is available, delivering eventual
 * ledger synchronization across offline periods.
 */
export class EdgeEvidenceRuntime {
  private readonly agentId: AgentId;
  private readonly transport: LedgerTransport;
  private readonly maxBufferSize: number;
  private readonly syncIntervalMs: number;
  private readonly autoSync: boolean;
  private readonly buffer: EvidenceEvent[] = [];
  private readonly drainCallbacks = new Set<(result: LedgerSyncResult) => void>();
  private readonly offlineCallbacks = new Set<(stats: OfflineBufferStats) => void>();
  private readonly onlineCallbacks = new Set<(result: LedgerSyncResult) => void>();
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private syncInFlight = false;
  private onlineState = false;
  private started = false;
  private stopped = false;

  constructor(options: EdgeEvidenceRuntimeOptions) {
    if (!options || !options.agentId) {
      throw new InvalidEvidenceEventError("agentId is required");
    }
    if (!options.transport) {
      throw new InvalidEvidenceEventError("ledger transport is required");
    }
    this.agentId = options.agentId;
    this.transport = options.transport;
    this.maxBufferSize = options.maxBufferSize ?? 10_000;
    this.syncIntervalMs = options.syncIntervalMs ?? 1000;
    this.autoSync = options.autoSync ?? true;
    if (this.maxBufferSize <= 0) {
      throw new InvalidEvidenceEventError("maxBufferSize must be positive");
    }
    if (this.syncIntervalMs <= 0) {
      throw new InvalidEvidenceEventError("syncIntervalMs must be positive");
    }
  }

  /** Start the background eventual-synchronization loop. */
  start(): void {
    if (this.stopped) {
      throw new LedgerSyncError("edge runtime has been stopped");
    }
    if (this.started) return;
    this.started = true;
    if (this.autoSync) this.scheduleSync();
  }

  /**
   * Execute a single agent step on the low-latency path. The step is accepted
   * unless its input carries `deny: true`; its AEP evidence event is buffered
   * synchronously so no network I/O blocks execution.
   */
  executeStep(step: AgentStep): AgentStepResult {
    if (!step || !step.stepId) {
      throw new InvalidEvidenceEventError("step.stepId is required");
    }
    if (!step.operation) {
      throw new InvalidEvidenceEventError("step.operation is required");
    }
    const startedAt = Date.now();
    const accepted = step.input?.deny !== true;
    const evidenceId = `evt:${this.agentId}:${step.stepId}:${this.buffer.length}`;
    this.recordEvidence({
      evidenceId,
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      kind: "aep.step.executed",
      payload: { stepId: step.stepId, operation: step.operation, accepted },
    });
    return {
      stepId: step.stepId,
      accepted,
      durationMs: Date.now() - startedAt,
      evidenceId,
    };
  }

  /**
   * Buffer an AEP evidence event for eventual ledger synchronization. The
   * append is purely local and never blocks on ledger connectivity, which is
   * what keeps the edge runtime low-latency while offline.
   */
  recordEvidence(event: EvidenceEvent): OfflineBufferStats {
    if (this.stopped) {
      throw new LedgerSyncError("edge runtime has been stopped");
    }
    validateEvidenceEvent(event);
    if (event.agentId !== this.agentId) {
      throw new InvalidEvidenceEventError(
        `agentId ${event.agentId} does not match runtime agent ${this.agentId}`,
      );
    }
    if (this.buffer.length >= this.maxBufferSize) {
      throw new EvidenceBufferFullError(this.agentId, this.maxBufferSize);
    }
    this.buffer.push(event);
    return this.getBufferStats();
  }

  /**
   * Attempt an immediate ledger synchronization of every buffered evidence
   * event. Throws `LedgerSyncError` when the transport is offline or rejects
   * the append; on success the acknowledged prefix of the buffer is dropped.
   */
  async flushBuffered(): Promise<LedgerSyncResult> {
    if (this.buffer.length === 0) {
      return {
        ledgerId: this.transport.ledgerId,
        syncedCount: 0,
        syncedAt: new Date().toISOString(),
      };
    }
    if (!this.transport.isOnline()) {
      throw new LedgerSyncError(
        `ledger ${this.transport.ledgerId} is offline; ${this.buffer.length} evidence events remain buffered`,
      );
    }
    const batch = [...this.buffer];
    let result: LedgerSyncResult;
    try {
      result = await this.transport.append(batch);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new LedgerSyncError(
        `failed to append evidence to ledger ${this.transport.ledgerId}: ${detail}`,
      );
    }
    if (result.syncedCount > 0) {
      this.buffer.splice(0, Math.min(result.syncedCount, this.buffer.length));
    }
    if (result.syncedCount > 0 && this.buffer.length === 0) {
      for (const callback of this.drainCallbacks) {
        callback(result);
      }
    }
    return result;
  }

  /** Snapshot of the offline evidence buffer. */
  getBufferStats(): OfflineBufferStats {
    let totalBytes = 0;
    for (const event of this.buffer) {
      totalBytes += estimateEvidenceBytes(event);
    }
    return {
      bufferedCount: this.buffer.length,
      oldestBufferedAt: this.buffer[0]?.timestamp,
      totalBytes,
    };
  }

  /** Register a callback fired when the buffer drains to the ledger. */
  onBufferDrain(callback: (result: LedgerSyncResult) => void): () => void {
    this.drainCallbacks.add(callback);
    return () => this.drainCallbacks.delete(callback);
  }

  /** Register a callback fired when the ledger transitions to offline. */
  onOffline(callback: (stats: OfflineBufferStats) => void): () => void {
    this.offlineCallbacks.add(callback);
    return () => this.offlineCallbacks.delete(callback);
  }

  /** Register a callback fired when the ledger transitions back online. */
  onOnline(callback: (result: LedgerSyncResult) => void): () => void {
    this.onlineCallbacks.add(callback);
    return () => this.onlineCallbacks.delete(callback);
  }

  /** Stop the background sync loop. Buffered evidence is retained. */
  stop(): void {
    this.stopped = true;
    this.started = false;
    if (this.syncTimer !== undefined) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
    this.drainCallbacks.clear();
    this.offlineCallbacks.clear();
    this.onlineCallbacks.clear();
  }

  private scheduleSync(): void {
    if (!this.started || this.stopped) return;
    this.syncTimer = setTimeout(() => {
      void this.syncTick();
    }, this.syncIntervalMs);
  }

  private async syncTick(): Promise<void> {
    if (this.syncInFlight) {
      this.scheduleSync();
      return;
    }
    if (this.buffer.length === 0) {
      this.scheduleSync();
      return;
    }
    if (!this.transport.isOnline()) {
      this.transitionOffline();
      this.scheduleSync();
      return;
    }
    this.syncInFlight = true;
    try {
      const result = await this.flushBuffered();
      this.transitionOnline(result);
    } catch {
      this.transitionOffline();
    } finally {
      this.syncInFlight = false;
      this.scheduleSync();
    }
  }

  private transitionOffline(): void {
    if (!this.onlineState) return;
    this.onlineState = false;
    const stats = this.getBufferStats();
    for (const callback of this.offlineCallbacks) {
      callback(stats);
    }
  }

  private transitionOnline(result: LedgerSyncResult): void {
    if (this.onlineState) return;
    this.onlineState = true;
    for (const callback of this.onlineCallbacks) {
      callback(result);
    }
  }
}
