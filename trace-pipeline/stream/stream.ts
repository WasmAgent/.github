/**
 * Real-time gRPC telemetry and event ingestion pipeline.
 *
 * Reference surface for the Milestone 6 bullet:
 *
 * > `trace-pipeline/stream/`: Real-time gRPC telemetry and event ingestion
 * > pipeline for instant posture drift detection and passport revocation
 *
 * Dependency-free by design (matching `wasmagent-js/runtime.ts`). Agents open a
 * streaming telemetry channel (`TelemetryIngestPipeline.connect()`), push typed
 * telemetry/event frames (`TelemetryStream.send()`), and the pipeline compares
 * every frame against the agent's declared posture baseline. A non-compliant
 * frame produces a `DriftSignal` in near real time; once drift crosses the
 * configured severity or distinct-kind thresholds the pipeline emits a
 * `RevocationSignal` so the trust network can revoke the agent's Trust Passport
 * immediately.
 */

export type AgentId = string;
export type PassportId = string;
export type PolicyRef = string;

/** A single telemetry event frame streamed by an agent over the gRPC channel. */
export interface TelemetryEvent {
  readonly agentId: AgentId;
  readonly eventId: string;
  /** ISO-8601 timestamp captured at emission time. */
  readonly timestamp: string;
  /** Event kind, e.g. "tool.call", "network.read", "data.write". */
  readonly kind: string;
  /** Optional observed payload; may carry a numeric `severity` (1..maxSeverity). */
  readonly observed: Record<string, unknown>;
}

/** The declared posture baseline an agent must hold to. */
export interface PostureBaseline {
  readonly agentId: AgentId;
  readonly policyRef: PolicyRef;
  /** Event kinds the agent's posture allows; everything else is drift. */
  readonly allowedKinds: readonly string[];
  /** Maximum severity a single drift event can carry. */
  readonly maxSeverity: number;
}

/** A posture drift signal emitted when an event violates the baseline. */
export interface DriftSignal {
  readonly agentId: AgentId;
  readonly eventId: string;
  readonly kind: string;
  readonly policyRef: PolicyRef;
  readonly severity: number;
  readonly reason: string;
  readonly timestamp: string;
}

/** A passport revocation signal emitted when drift crosses the threshold. */
export interface RevocationSignal extends DriftSignal {
  readonly passportId: PassportId;
  readonly revocationReason: string;
}

/** Snapshot of an agent's posture after a telemetry event is ingested. */
export interface PostureSnapshot {
  readonly agentId: AgentId;
  readonly compliant: boolean;
  readonly driftCount: number;
  readonly lastDriftKind: string | undefined;
  readonly revoked: boolean;
}

export class PassportRevokedError extends Error {
  constructor(agentId: AgentId, passportId: PassportId) {
    super(`passport ${passportId} for agent ${agentId} has been revoked`);
    this.name = "PassportRevokedError";
  }
}

export class InvalidTelemetryEventError extends Error {
  constructor(reason: string) {
    super(`invalid telemetry event: ${reason}`);
    this.name = "InvalidTelemetryEventError";
  }
}

export class StreamAlreadyOpenError extends Error {
  constructor(agentId: AgentId) {
    super(`agent ${agentId} already has an open telemetry stream`);
    this.name = "StreamAlreadyOpenError";
  }
}

/**
 * A real-time streaming telemetry channel for a single agent. Mirrors the
 * streaming shape of a gRPC bidi `TelemetryStream` RPC: `send()` ingests a
 * frame, `onDrift`/`onRevocation` deliver push signals, and `close()`
 * terminates the channel.
 */
export interface TelemetryStream {
  readonly agentId: AgentId;
  readonly passportId: PassportId;
  /** Ingest a telemetry event frame and return the agent's updated posture. */
  send(event: TelemetryEvent): PostureSnapshot;
  /** Subscribe to drift signals; returns an unsubscribe function. */
  onDrift(callback: (signal: DriftSignal) => void): () => void;
  /** Subscribe to passport revocation signals; returns an unsubscribe function. */
  onRevocation(callback: (signal: RevocationSignal) => void): () => void;
  /** Close the streaming channel. Sends after close throw. */
  close(): void;
  /** Whether the channel has been closed (or revoked). */
  isClosed(): boolean;
}

export interface TelemetryIngestPipelineOptions {
  /** Drift severity at or above which the passport is revoked (default 5). */
  readonly revokeSeverityThreshold?: number;
  /** Distinct non-compliant kinds allowed before revocation (default 3). */
  readonly maxDriftKinds?: number;
}

/** Extract the drift severity carried by an event, clamped to the baseline max. */
export function eventSeverity(event: TelemetryEvent, maxSeverity: number): number {
  const raw = event.observed?.severity;
  const severity = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 1;
  return Math.min(severity, Math.max(1, maxSeverity));
}

/** Validate a telemetry event frame against the stream it is sent on. */
export function validateEvent(event: TelemetryEvent, agentId: AgentId): void {
  if (!event || typeof event !== "object") {
    throw new InvalidTelemetryEventError("event must be an object");
  }
  if (!event.eventId || typeof event.eventId !== "string") {
    throw new InvalidTelemetryEventError("eventId is required");
  }
  if (event.agentId !== agentId) {
    throw new InvalidTelemetryEventError(
      `agentId ${event.agentId} does not match stream agent ${agentId}`,
    );
  }
  if (!event.kind || typeof event.kind !== "string") {
    throw new InvalidTelemetryEventError("kind is required");
  }
  if (!event.timestamp || typeof event.timestamp !== "string") {
    throw new InvalidTelemetryEventError("timestamp is required");
  }
}

class TelemetryStreamImpl implements TelemetryStream {
  readonly agentId: AgentId;
  readonly passportId: PassportId;

  private readonly baseline: PostureBaseline;
  private readonly revokeSeverityThreshold: number;
  private readonly maxDriftKinds: number;
  private readonly driftCallbacks = new Set<(signal: DriftSignal) => void>();
  private readonly revocationCallbacks = new Set<(signal: RevocationSignal) => void>();
  private readonly driftKinds = new Set<string>();
  private driftCount = 0;
  private lastDriftKind: string | undefined;
  private closed = false;
  private revoked = false;

  constructor(
    baseline: PostureBaseline,
    passportId: PassportId,
    revokeSeverityThreshold: number,
    maxDriftKinds: number,
  ) {
    this.agentId = baseline.agentId;
    this.passportId = passportId;
    this.baseline = baseline;
    this.revokeSeverityThreshold = revokeSeverityThreshold;
    this.maxDriftKinds = maxDriftKinds;
  }

  send(event: TelemetryEvent): PostureSnapshot {
    if (this.closed) {
      throw new InvalidTelemetryEventError("stream is closed");
    }
    if (this.revoked) {
      throw new PassportRevokedError(this.agentId, this.passportId);
    }
    validateEvent(event, this.agentId);

    const snapshot = (compliant: boolean): PostureSnapshot => ({
      agentId: this.agentId,
      compliant,
      driftCount: this.driftCount,
      lastDriftKind: this.lastDriftKind,
      revoked: this.revoked,
    });

    if (this.baseline.allowedKinds.includes(event.kind)) {
      return snapshot(true);
    }

    const severity = eventSeverity(event, this.baseline.maxSeverity);
    const reason = `event kind "${event.kind}" is not allowed by policy ${this.baseline.policyRef}`;
    const drift: DriftSignal = {
      agentId: this.agentId,
      eventId: event.eventId,
      kind: event.kind,
      policyRef: this.baseline.policyRef,
      severity,
      reason,
      timestamp: event.timestamp,
    };
    this.driftCount += 1;
    this.lastDriftKind = event.kind;
    this.driftKinds.add(event.kind);
    for (const callback of this.driftCallbacks) {
      callback(drift);
    }

    if (
      severity >= this.revokeSeverityThreshold ||
      this.driftKinds.size >= this.maxDriftKinds
    ) {
      this.revoke(drift);
    }
    return snapshot(false);
  }

  private revoke(trigger: DriftSignal): void {
    if (this.revoked) return;
    this.revoked = true;
    const signal: RevocationSignal = {
      ...trigger,
      passportId: this.passportId,
      revocationReason:
        `passport ${this.passportId} revoked for agent ${this.agentId}: ` +
        `posture drift "${trigger.kind}" violates policy ${trigger.policyRef}`,
    };
    for (const callback of this.revocationCallbacks) {
      callback(signal);
    }
  }

  onDrift(callback: (signal: DriftSignal) => void): () => void {
    this.driftCallbacks.add(callback);
    return () => this.driftCallbacks.delete(callback);
  }

  onRevocation(callback: (signal: RevocationSignal) => void): () => void {
    this.revocationCallbacks.add(callback);
    return () => this.revocationCallbacks.delete(callback);
  }

  close(): void {
    this.closed = true;
  }

  isClosed(): boolean {
    return this.closed || this.revoked;
  }
}

/**
 * The real-time gRPC telemetry and event ingestion pipeline. Manages one
 * streaming channel per agent and enforces posture baselines with instant
 * drift detection and Trust Passport revocation.
 */
export class TelemetryIngestPipeline {
  private readonly revokeSeverityThreshold: number;
  private readonly maxDriftKinds: number;
  private readonly streams = new Map<AgentId, TelemetryStreamImpl>();

  constructor(options: TelemetryIngestPipelineOptions = {}) {
    this.revokeSeverityThreshold = options.revokeSeverityThreshold ?? 5;
    this.maxDriftKinds = options.maxDriftKinds ?? 3;
    if (this.revokeSeverityThreshold <= 0) {
      throw new InvalidTelemetryEventError("revokeSeverityThreshold must be positive");
    }
    if (this.maxDriftKinds <= 0) {
      throw new InvalidTelemetryEventError("maxDriftKinds must be positive");
    }
  }

  /** Open a real-time gRPC telemetry channel for an agent's posture baseline. */
  connect(baseline: PostureBaseline, passportId: PassportId): TelemetryStream {
    if (!baseline || !baseline.agentId) {
      throw new InvalidTelemetryEventError("baseline.agentId is required");
    }
    if (
      !baseline.policyRef ||
      !baseline.allowedKinds ||
      !Array.isArray(baseline.allowedKinds)
    ) {
      throw new InvalidTelemetryEventError(
        "baseline.policyRef and baseline.allowedKinds are required",
      );
    }
    const existing = this.streams.get(baseline.agentId);
    if (existing && !existing.isClosed()) {
      throw new StreamAlreadyOpenError(baseline.agentId);
    }
    const stream = new TelemetryStreamImpl(
      baseline,
      passportId,
      this.revokeSeverityThreshold,
      this.maxDriftKinds,
    );
    this.streams.set(baseline.agentId, stream);
    return stream;
  }

  /** Agent IDs that currently have an open telemetry stream. */
  openStreams(): AgentId[] {
    const open: AgentId[] = [];
    for (const [agentId, stream] of this.streams) {
      if (!stream.isClosed()) open.push(agentId);
    }
    return open;
  }
}
