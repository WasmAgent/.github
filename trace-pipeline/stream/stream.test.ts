// Real-time gRPC telemetry and event ingestion pipeline tests.
//
// Exercises real-time ingestion, instant posture drift detection, and Trust
// Passport revocation for the Milestone 6 reference surface:
//
// > `trace-pipeline/stream/`: Real-time gRPC telemetry and event ingestion
// > pipeline for instant posture drift detection and passport revocation

import { describe, expect, it } from "bun:test";
import {
  InvalidTelemetryEventError,
  PassportRevokedError,
  StreamAlreadyOpenError,
  TelemetryIngestPipeline,
  type PostureBaseline,
  type TelemetryEvent,
} from "./stream";

const baseline: PostureBaseline = {
  agentId: "agent-1",
  policyRef: "posture:payroll:1.2",
  allowedKinds: ["tool.call", "network.read"],
  maxSeverity: 5,
};

function event(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    agentId: "agent-1",
    eventId: "evt-1",
    timestamp: "2026-08-03T00:00:00.000Z",
    kind: "tool.call",
    observed: {},
    ...overrides,
  };
}

describe("TelemetryIngestPipeline", () => {
  it("ingests compliant telemetry events in real time", () => {
    const pipeline = new TelemetryIngestPipeline();
    const stream = pipeline.connect(baseline, "passport-1");
    const snapshot = stream.send(event({ eventId: "evt-1" }));
    expect(snapshot.compliant).toBe(true);
    expect(snapshot.driftCount).toBe(0);
    expect(snapshot.revoked).toBe(false);
    expect(pipeline.openStreams()).toContain("agent-1");
    stream.close();
  });

  it("detects posture drift immediately on a non-compliant event", () => {
    const pipeline = new TelemetryIngestPipeline();
    const stream = pipeline.connect(baseline, "passport-1");
    const driftSignals: string[] = [];
    stream.onDrift((signal) => driftSignals.push(signal.kind));
    const snapshot = stream.send(
      event({ eventId: "evt-2", kind: "data.write", observed: { severity: 2 } }),
    );
    expect(snapshot.compliant).toBe(false);
    expect(snapshot.driftCount).toBe(1);
    expect(snapshot.lastDriftKind).toBe("data.write");
    expect(driftSignals).toEqual(["data.write"]);
  });

  it("revokes the Trust Passport when drift severity crosses the threshold", () => {
    const pipeline = new TelemetryIngestPipeline({ revokeSeverityThreshold: 4 });
    const stream = pipeline.connect(baseline, "passport-1");
    const revocations: string[] = [];
    stream.onRevocation((signal) => revocations.push(signal.passportId));
    stream.send(
      event({ eventId: "evt-3", kind: "data.write", observed: { severity: 5 } }),
    );
    expect(revocations).toEqual(["passport-1"]);
    expect(stream.isClosed()).toBe(true);
  });

  it("revokes the Trust Passport after too many distinct drift kinds accumulate", () => {
    const pipeline = new TelemetryIngestPipeline({ maxDriftKinds: 2 });
    const stream = pipeline.connect(baseline, "passport-1");
    const revocations: string[] = [];
    stream.onRevocation((signal) => revocations.push(signal.revocationReason));
    stream.send(event({ eventId: "evt-4", kind: "data.write" }));
    expect(revocations).toEqual([]);
    stream.send(event({ eventId: "evt-5", kind: "exec.shell" }));
    expect(revocations).toHaveLength(1);
    expect(revocations[0]).toContain("passport-1");
  });

  it("rejects telemetry after the passport has been revoked", () => {
    const pipeline = new TelemetryIngestPipeline({ revokeSeverityThreshold: 1 });
    const stream = pipeline.connect(baseline, "passport-1");
    stream.send(
      event({ eventId: "evt-6", kind: "exec.shell", observed: { severity: 3 } }),
    );
    expect(() =>
      stream.send(event({ eventId: "evt-7", kind: "tool.call" })),
    ).toThrow(PassportRevokedError);
  });

  it("rejects malformed telemetry events and duplicate open streams", () => {
    const pipeline = new TelemetryIngestPipeline();
    const stream = pipeline.connect(baseline, "passport-1");
    expect(() => stream.send(event({ eventId: "" }))).toThrow(
      InvalidTelemetryEventError,
    );
    expect(() => pipeline.connect(baseline, "passport-2")).toThrow(
      StreamAlreadyOpenError,
    );
    stream.close();
    expect(pipeline.openStreams()).not.toContain("agent-1");
  });
});
