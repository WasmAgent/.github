# RFC-0002: Causal Fabric Evidence Protocol (CFEP)

| Field | Value |
|-------|-------|
| Status | Draft |
| Author | @telleroutlook |
| Created | 2026-07 |
| Classification | Direction 3 — low-probability, high-prestige research bet |
| Discussion | [.github#95](https://github.com/WasmAgent/.github/issues/95) — Phase 0 go/no-go and four open questions |
| Affects | wasmagent-js (`@wasmagent/aep`, `@wasmagent/otel-exporter`, `@wasmagent/mcp-policy`) |
| Not a dependency of | any current sprint, roadmap item, or semver commitment |

## Problem

AEP v0.2 (`@wasmagent/aep`) already records fine-grained causal lineage for
*software* agent actions: `parent_action_id`, `causal_chain_id`,
`memory_read_refs`, `memory_write_refs`, `pre_state_digest`,
`post_state_digest`. The signing contract (canonical JSON + Ed25519 via
`AEPSigner`) and the multi-agent topology primitives
(`run_context.delegation_chain`, `agent_id`, `subagent_id`) form a solid
software-layer foundation.

The unsolved problem is one level down: **heterogeneous compute fabrics**.
When a workload spans CPU, GPU, DPU, and CXL memory pool "islands" that
communicate across programmable boundaries, the traditional CPU-trace replay
model fails. Each island is an autonomous, boundary-limited actor. No single
coordinator owns the global address space, event ordering, or causal
dependency graph. Standard hardware telemetry (including CXL 3.2 CHMU/RAS)
tells you *what events happened* within a device; it does not tell you *which
events causally depend on which other events across islands*.

The gap: no open protocol today describes how to record, seal, and reconstruct
a minimum-sufficient causal evidence chain across heterogeneous fabric
boundaries — in a way that is verifiable, deterministically replayable, and
composable with existing software-layer provenance systems like AEP.

This RFC proposes **CFEP (Causal Fabric Evidence Protocol)** as a
research-grade protocol draft that fills exactly that gap, positioned as a
*software-layer causal reconstruction protocol* sitting above hardware
telemetry rather than replacing it.

## Non-Goals (explicit, permanent)

1. **No real CXL protocol implementation** — CXL.io/cache/mem register-level
   semantics are out of scope for any foreseeable phase.
2. **No FPGA or hardware prototype** — out of scope for an independent software
   team.
3. **No claim to influence CXL Consortium standardisation** — CFEP is
   independent research; the Consortium owns hardware register definitions;
   CFEP owns the causal-reconstruction layer above them.
4. **No production stability commitment** — CFEP is `research` maturity;
   interfaces may change without notice and without semver bump.
5. **No claim to satisfy regulatory certifications** — CFEP produces evidence
   artefacts; third-party audit determines their regulatory weight.

## Background: existing infrastructure inventory

| Layer | Existing asset | Relationship to CFEP |
|-------|----------------|----------------------|
| Software causal lineage | AEP v0.2 `ActionEvidence.parent_action_id` / `causal_chain_id` | CFEP's fabric-level `FabricActivity` maps directly to AEP's `ActionEvidence` — same conceptual primitive, different substrate |
| Signing infrastructure | `AEPSigner` interface (canonical JSON + Ed25519); `LocalEd25519Signer`; KMS adapter slot | CFEP seals reuse the same signing contract verbatim — no new crypto primitives required |
| Multi-agent topology | `run_context.delegation_chain`, `agent_id`, `subagent_id` | A fabric island maps to the `agent_id`/`subagent_id` role in a delegation chain — the conceptual parallel is exact |
| Cross-run correlation | `trace_id`, `parent_trace_id` (OTel-compatible) | Fabric epochs map to OTel trace spans; `@wasmagent/otel-exporter` bridge extended |
| Boundary programmability | WebAssembly Component Model (W3C Wasm 3.0, Sept 2025); WASI capability sandbox | CFEP's island controller interface defined in WIT; loaded via Wasmtime or compatible runtime |
| CXL simulation | QEMU CXL 2.0, gem5-CXL, CXL-DMSim (silicon pre-validation), CXLMemSim (trace-driven, epoch concept already present) | Phase 0 toy simulator builds on CXL-DMSim or QEMU CXL — no simulator written from scratch |
| Multi-device interconnect simulation | SimBricks | Long-term multi-island simulation; prefer reuse over custom build |
| Policy governance | `@wasmagent/mcp-policy` (alpha-private) `PolicyBundle` | CFEP island controllers load policy bundles to decide recording mode dynamically |

## Protocol draft: CFEP v0.1

### Core principle

Record the minimum evidence that allows a *different* instance (different
machine, different time) to reconstruct the causal dependency graph and
deterministically replay — or prove the original execution consistent with —
the recorded event sequence.

AEP's design principle applied to hardware: **don't record what can be
recomputed; record only what is needed to re-establish ordering and causality.**

### Island

An *island* is any autonomous compute unit with a programmable, monitorable
boundary:
- CPU socket or NUMA node
- GPU / accelerator
- DPU / SmartNIC
- CXL memory pool controller

Each island has an `island_id` (stable string identifier, e.g. `cpu:0`,
`gpu:0`, `cxl-mem:0`). The island concept deliberately mirrors AEP's
`run_context.agent_id`: both are autonomous actors in a
delegation/dependency topology.

### Epoch

An *epoch* is a time-bounded, causally-closed recording window. At epoch
boundaries:
- All in-flight cross-island transactions are quiesced.
- Each island's controller emits a `SealRecord` (hash commitment over its
  local state).
- The epoch's causal graph is finalised: no new edges can be added
  retroactively.

Epochs are the unit of replayability. To replay epoch N you need: the
`CheckpointRecord` from the start of epoch N, plus all
`FabricActivityRecord`s within epoch N.

### Record types

#### `CheckpointRecord`

```
{
  schema_version:         "cfep/v0.1",
  epoch_id:               string,          // UUIDv7 — monotonic + time-ordered
  island_id:              string,
  controller_wasm_digest: string,          // SHA-256 of loaded Wasm module
  state_digest:           string,          // SHA-256 of serialised island state snapshot
  memory_map_digest:      string,          // SHA-256 of CXL address-range ownership table
  timestamp_ms:           number,
  signature:              AEPSignature,    // { alg: "ed25519", key_id, sig } — same as AEP v0.2
}
```

#### `FabricActivityRecord`

```
{
  schema_version: "cfep/v0.1",
  activity_id:    string,           // UUIDv7
  epoch_id:       string,
  island_id:      string,
  activity_type:  enum {
    memory_read, memory_write, cache_invalidate,
    cxl_mem_read, cxl_mem_write, io_doorbell,
    page_migration, ownership_transfer
  },
  address_range:  string,           // "start-end" hex, or object_id for abstract mode
  recording_tier: enum {
    validation,   // hash + ordering only — default
    delta,        // compressed structural diff — uncertain but low-risk ranges
    full,         // complete payload — untrusted islands or debug windows
  },

  // Causal lineage (mirrors AEP v0.2 ActionEvidence causal fields)
  parent_activity_id?: string,      // direct predecessor in happens-before chain
  causal_chain_id:     string,      // groups a causally-related sequence across islands

  // Tier-specific payload (at most one present)
  pre_state_digest?:   string,      // validation tier
  post_state_digest?:  string,      // validation tier
  delta_payload?:      string,      // delta tier, base64
  full_payload_ref?:   string,      // full tier, content-addressable ref (not inline)

  // Provenance
  controller_wasm_digest: string,   // which controller version made this decision
  policy_bundle_digest?:  string,   // which PolicyBundle was active

  timestamp_ms: number,
  signature:    AEPSignature,
}
```

#### `SealRecord`

```
{
  schema_version:    "cfep/v0.1",
  epoch_id:          string,
  island_id:         string,
  activity_root:     string,    // Merkle root over all FabricActivityRecord activity_ids in epoch
  state_digest:      string,    // post-epoch island state hash
  cross_island_refs: string[],  // activity_ids in other islands this island depended on
  timestamp_ms:      number,
  signature:         AEPSignature,
}
```

### Recording tier selection

The island controller (a Wasm module) decides `recording_tier`
per-transaction at runtime based on the active `PolicyBundle`. No static
configuration. The three tiers mirror the intent behind AEP v0.2's
`pre_state_digest`/`post_state_digest` (validation) vs.
`memory_read_refs`/`memory_write_refs` (delta) vs. full output capture.

Default policy: `validation` for all transactions. Escalation triggers:
untrusted island, address range flagged in policy, active debug window, or
verifier failure in the previous epoch.

### Island controller interface (WIT)

The island controller is a Wasm Component Model component loaded by a CFEP
runtime host:

```wit
package wasmagent:cfep@0.1.0;

interface island-controller {
  use types.{fabric-transaction, recording-tier, fabric-event, fabric-activity-record};

  observe-transaction: func(txn: fabric-transaction) -> recording-tier;
  classify-event:      func(event: fabric-event) -> event-classification;
  emit-activity-record: func(record: fabric-activity-record);
}

world cfep-controller {
  import wasmagent:cfep/policy-bundle;
  export island-controller;
}
```

Controllers can be written in any language that compiles to Wasm (Rust, C,
TinyGo). The host runtime (Wasmtime or compatible WASI runtime) provides the
`policy-bundle` import.

**Key open question:** at simulated high-frequency transaction rates
(nanosecond–microsecond scale), is a per-transaction Wasm boundary crossing
feasible? The Phase 0 toy simulator must benchmark this *early* because if
the overhead is prohibitive, the entire "Wasm instead of eBPF" premise needs
revisiting. Mitigation candidates: AOT compilation, transaction batching
before the policy check, host-side fast path for `validation` tier.

### Checkpoint → Record → Seal → Reconstruct

1. **Checkpoint**: Each island's controller serialises its architectural state
   + CXL address-range ownership map + loaded controller Wasm digest. Emits a
   `CheckpointRecord`. This is the "start state" for deterministic replay.

2. **Record**: During execution, the controller emits a stream of
   `FabricActivityRecord`s. `causal_chain_id` groups cross-island dependency
   sequences. `parent_activity_id` encodes direct happens-before edges within
   a chain.

3. **Seal**: At epoch boundary, each island's controller emits a `SealRecord`
   containing the Merkle root over its epoch's activities and the list of
   `cross_island_refs`. A global `EpochSeal` is the set of all islands'
   `SealRecord`s — it is the minimal certificate that the epoch's causal graph
   is consistent and complete.

4. **Reconstruct**: A verifier loads the `CheckpointRecord`, replays
   `FabricActivityRecord`s in causal order (respecting `parent_activity_id`
   and `cross_island_refs`), and validates each `post_state_digest` or delta
   payload. If a dependency is unmet, the verifier stalls that island's replay
   — equivalent to the epoch/stall mechanism in distributed snapshot
   algorithms.

### Relationship to AEP v0.2

CFEP is not a replacement for AEP. It is a *downward extension* into hardware
fabric:

```
┌─────────────────────────────────────────────────┐
│  Software layer: AEP v0.2 ActionEvidence         │
│  (agent tool calls, LLM turn boundaries)         │
│  Signing: AEPSigner / Ed25519 — unchanged        │
├─────────────────────────────────────────────────┤
│  Fabric layer: CFEP v0.1 FabricActivityRecord    │
│  (cross-island memory/cache/migration events)    │
│  Signing: same AEPSignature contract — reused    │
└─────────────────────────────────────────────────┘
```

Bridging: a fabric epoch that triggers a GPU kernel dispatch can be linked to
the AEP `ActionEvidence` record for that dispatch via `causal_chain_id` (same
field name, same semantic — the chain spans layers). The
`@wasmagent/otel-exporter` bridge would emit fabric epochs as OTel spans
nested under the corresponding AEP trace.

CFEP explicitly does *not* extend the `AEPRecord` Zod schema — it is a
separate record type with its own `schema_version: "cfep/v0.1"` namespace to
avoid polluting the stable AEP v0.2 contract.

## Phase 0: toy simulator (the only thing worth building now)

**Scope**: pure-software, abstract-event-level topology — no real CXL
registers.
- 2 CPU islands + 1 GPU island + 1 CXL memory pool island.
- Events: abstract `read`, `write`, `migrate` — not real CXL register
  semantics.
- Target base: CXL-DMSim or QEMU CXL as the simulation substrate (not written
  from scratch).

**Deliverables**:
1. A runnable demo that executes Checkpoint → Record → Seal → Reconstruct
   end-to-end.
2. A Wasm overhead benchmark: at what simulated transaction frequency does
   per-call Wasm overhead become the bottleneck? Report the number honestly —
   "too slow without AOT" is useful output.
3. A short technical memo establishing CFEP's relationship to the CXL
   Consortium's CHMU/RAS telemetry — specifically: what CHMU gives you ("what
   events happened") vs. what CFEP adds ("which events causally depend on
   which other events").

**Success criterion**: (a) the four-phase lifecycle runs and is
self-consistent; (b) the Wasm overhead question is answered with a number;
(c) the biggest technical risk for Phase 1 is named and documented.

**Resourcing**: 1–2 engineers, part-time, 2–4 weeks. Does not require new
hires.

## Open questions

1. **Wasm overhead ceiling**: At what transaction frequency (ops/sec in
   simulation) does per-call Wasm overhead make `observe-transaction`
   infeasible without AOT or batching? Is there a batching strategy that
   preserves safety semantics while cutting overhead to an acceptable fraction?

2. **Causal graph granularity across layers**: When a fabric-layer
   `FabricActivityRecord` and a software-layer AEP `ActionEvidence` share a
   `causal_chain_id`, what is the correct entity granularity? A CXL page
   migration is not the same abstraction level as an LLM tool call. Is a
   single shared `causal_chain_id` sufficient, or does CFEP need a separate
   `fabric_chain_id` that AEP references by foreign key?

3. **Multi-island simulation fidelity**: CXL-DMSim provides epoch concepts;
   QEMU CXL 2.0 provides device emulation. Do these two simulators compose
   via SimBricks, or does Phase 0 have to pick one and accept its fidelity
   limitations?

4. **IP and data ownership for future industry collaboration**: If a cloud or
   chip vendor provides a real fabric environment for validation, what are the
   IP, data residency, and attribution arrangements? No answer required now —
   record the question so it is not surprised by later.

## Decision record

**Why preserve rather than drop this direction:**
- The AEP signing contract (`AEPSigner` / Ed25519) and the causal chain
  primitives (`parent_action_id`, `causal_chain_id`) already form the exact
  foundation CFEP needs at the software layer. The incremental investment to
  extend downward is smaller than building from scratch.
- Wasm Component Model (W3C Wasm 3.0, 2025) and WASI are now stable enough
  that the "Wasm as programmable boundary" premise has a real standardisation
  basis.
- CXL 3.2 CHMU/RAS validates that the problem space is real and
  industry-recognised; but the Consortium is solving the hardware telemetry
  sub-problem, not the causal reconstruction layer — leaving the latter open.

**Why not pursue it as a primary investment now:**
- Direction 1 (distributed GPU training causal tracing) and Direction 2
  (Proxy-Wasm boundary evidence layer) are higher-probability, nearer-term,
  and consume the same team capacity.
- True validation of CFEP requires either real CXL hardware or a high-fidelity
  simulator that is non-trivial to stand up.
- The Wasm-overhead question is a genuine risk that could invalidate the core
  premise; it should be answered before committing further resources.

**Triggers for re-evaluation:**
- An industry partner (cloud vendor, chip vendor) offers to co-invest in
  real-fabric validation.
- Direction 1 or Direction 2 validates the "layered evidence + causal chain +
  Ed25519 signing" architecture in a production context, making the downward
  extension to fabric events a smaller incremental bet.
- Wasm Component Model runtime performance (Wasmtime, wazero, or WASI Preview
  3) improves to the point where per-transaction overhead is demonstrably
  sub-microsecond without AOT.
- CXL ecosystem or SimBricks tooling reaches a maturity that makes Phase 0 a
  1-week effort rather than a 4-week effort.

## Related

- AEP v0.3 RFC: wasmagent-js#7
- `docs/aep-contract.md` (wasmagent-js) — AEP v0.2 canonical signing contract
- `packages/aep/src/types.ts` — `AEPRecord`, `ActionEvidence`, `AEPSignature` types
- `packages/otel-exporter/src/` — AEP ↔ OTel bridge
- `packages/mcp-policy/src/` — `PolicyBundle` / `PolicyBundleMetadata` (alpha-private)

---

*CXL ecosystem and Wasm Component Model are evolving fast. Before reactivating
this direction, run a fresh survey: CXL Consortium spec delta since CXL 3.2,
Wasmtime AOT performance benchmarks, CXL-DMSim/SimBricks integration status.*
