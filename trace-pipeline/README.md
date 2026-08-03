# trace-pipeline reference surfaces

This directory hosts the hub-tracked reference surfaces for the
[`WasmAgent/trace-pipeline`](https://github.com/WasmAgent/trace-pipeline)
repository (evidence-pipeline tier — trace ingestion, evidence admission, and
training-data pipeline). The production implementation lives in the sibling
repo; this hub copy is the org-level reference contract exercised by
`tests/e2e/`.

## `stream/` — Real-time gRPC telemetry and event ingestion pipeline

Milestone 6 bullet:

> `trace-pipeline/stream/`: Real-time gRPC telemetry and event ingestion
> pipeline for instant posture drift detection and passport revocation

`stream/stream.ts` ships a dependency-free `TelemetryIngestPipeline`:

- **`connect(baseline, passportId)`** opens a gRPC-style streaming telemetry
  channel for an agent bound to a declared `PostureBaseline`.
- **`send(event)`** ingests a `TelemetryEvent` frame and returns the agent's
  updated `PostureSnapshot` in real time.
- **`onDrift(callback)`** pushes a `DriftSignal` the instant an event violates
  the agent's posture baseline.
- **`onRevocation(callback)`** emits a `RevocationSignal` (revoking the agent's
  Trust Passport) when drift crosses the configured severity or distinct-kind
  thresholds; subsequent sends raise `PassportRevokedError`.

```ts
import { TelemetryIngestPipeline } from "./stream/stream";

const pipeline = new TelemetryIngestPipeline({ revokeSeverityThreshold: 5 });
const stream = pipeline.connect(
  {
    agentId: "agent-1",
    policyRef: "posture:payroll:1.2",
    allowedKinds: ["tool.call", "network.read"],
    maxSeverity: 5,
  },
  "passport-1",
);
stream.onRevocation((signal) => console.log("revoked", signal.passportId));
const snapshot = stream.send({
  agentId: "agent-1",
  eventId: "evt-42",
  timestamp: new Date().toISOString(),
  kind: "data.write",
  observed: { severity: 5 },
});
// snapshot.compliant === false; revocation signal fires immediately
```

Run the reference tests with `bun test` from this directory.
