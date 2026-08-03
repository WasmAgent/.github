// Low-latency WasmAgent edge runtime tests.
//
// Exercises low-latency agent step execution, offline evidence buffering, and
// eventual ledger synchronization for the Milestone 6 reference surface:
//
// > `wasmagent/edge/`: Low-latency WasmAgent edge runtime supporting offline
// > evidence buffering and eventual ledger synchronization

import { describe, expect, it } from "bun:test";
import {
  EdgeEvidenceRuntime,
  EvidenceBufferFullError,
  InvalidEvidenceEventError,
  LedgerSyncError,
  type EvidenceEvent,
  type LedgerSyncResult,
  type LedgerTransport,
} from "./edge";

class FakeLedgerTransport implements LedgerTransport {
  readonly ledgerId = "ledger:mesh-1";
  private online = false;
  readonly appended: EvidenceEvent[][] = [];

  isOnline(): boolean {
    return this.online;
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  append(events: readonly EvidenceEvent[]): Promise<LedgerSyncResult> {
    if (!this.online) {
      return Promise.reject(new Error("transport offline"));
    }
    this.appended.push([...events]);
    return Promise.resolve({
      ledgerId: this.ledgerId,
      syncedCount: events.length,
      syncedAt: new Date().toISOString(),
    });
  }
}

function evidence(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    evidenceId: "evt-1",
    agentId: "edge-agent-1",
    timestamp: "2026-08-03T00:00:00.000Z",
    kind: "aep.step.executed",
    payload: {},
    ...overrides,
  };
}

describe("EdgeEvidenceRuntime", () => {
  it("executes agent steps with low latency while recording evidence", () => {
    const transport = new FakeLedgerTransport();
    const runtime = new EdgeEvidenceRuntime({ agentId: "edge-agent-1", transport });
    const startedAt = Date.now();
    const result = runtime.executeStep({
      stepId: "step-1",
      operation: "tool.call.read-file",
      input: { path: "/tmp/evidence.jsonl" },
    });
    expect(result.accepted).toBe(true);
    expect(result.evidenceId).toContain("step-1");
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(runtime.getBufferStats().bufferedCount).toBe(1);
  });

  it("buffers evidence while the ledger is offline", () => {
    const transport = new FakeLedgerTransport(); // offline by default
    const runtime = new EdgeEvidenceRuntime({ agentId: "edge-agent-1", transport });
    runtime.recordEvidence(evidence({ evidenceId: "evt-1" }));
    runtime.recordEvidence(evidence({ evidenceId: "evt-2" }));
    const stats = runtime.getBufferStats();
    expect(stats.bufferedCount).toBe(2);
    expect(stats.oldestBufferedAt).toBe("2026-08-03T00:00:00.000Z");
    expect(stats.totalBytes).toBeGreaterThan(0);
  });

  it("rejects a flush attempt while the ledger is offline", async () => {
    const transport = new FakeLedgerTransport();
    const runtime = new EdgeEvidenceRuntime({ agentId: "edge-agent-1", transport });
    runtime.recordEvidence(evidence());
    await expect(runtime.flushBuffered()).rejects.toThrow(LedgerSyncError);
    expect(runtime.getBufferStats().bufferedCount).toBe(1);
  });

  it("synchronizes buffered evidence to the ledger once connectivity returns", async () => {
    const transport = new FakeLedgerTransport();
    const runtime = new EdgeEvidenceRuntime({ agentId: "edge-agent-1", transport });
    runtime.recordEvidence(evidence({ evidenceId: "evt-1" }));
    runtime.recordEvidence(evidence({ evidenceId: "evt-2" }));
    expect(runtime.getBufferStats().bufferedCount).toBe(2);

    transport.setOnline(true);
    const result = await runtime.flushBuffered();
    expect(result.syncedCount).toBe(2);
    expect(result.ledgerId).toBe("ledger:mesh-1");
    expect(runtime.getBufferStats().bufferedCount).toBe(0);
    expect(transport.appended).toHaveLength(1);
  });

  it("rejects malformed evidence events and a full offline buffer", () => {
    const transport = new FakeLedgerTransport();
    const runtime = new EdgeEvidenceRuntime({
      agentId: "edge-agent-1",
      transport,
      maxBufferSize: 2,
    });
    expect(() => runtime.recordEvidence(evidence({ evidenceId: "" }))).toThrow(
      InvalidEvidenceEventError,
    );
    expect(() => runtime.recordEvidence(evidence({ agentId: "other-agent" }))).toThrow(
      InvalidEvidenceEventError,
    );
    runtime.recordEvidence(evidence({ evidenceId: "evt-1" }));
    runtime.recordEvidence(evidence({ evidenceId: "evt-2" }));
    expect(() => runtime.recordEvidence(evidence({ evidenceId: "evt-3" }))).toThrow(
      EvidenceBufferFullError,
    );
  });

  it("notifies drain subscribers when buffered evidence is eventually synced", async () => {
    const transport = new FakeLedgerTransport();
    const runtime = new EdgeEvidenceRuntime({ agentId: "edge-agent-1", transport });
    const drained: number[] = [];
    runtime.onBufferDrain((result) => drained.push(result.syncedCount));
    runtime.recordEvidence(evidence({ evidenceId: "evt-1" }));
    runtime.recordEvidence(evidence({ evidenceId: "evt-2" }));
    transport.setOnline(true);
    await runtime.flushBuffered();
    expect(drained).toEqual([2]);
  });
});
