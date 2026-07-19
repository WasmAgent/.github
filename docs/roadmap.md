# Roadmap

Living roadmap for the WasmAgent organization. Ticked items ship as public
repositories under [github.com/WasmAgent](https://github.com/WasmAgent);
unticked items are planned or in progress. This document mirrors
`gh repo list WasmAgent --visibility public`, and its machine-readable
counterpart is [`project-index.json`](project-index.json).

## Status legend

- ✅ Public repository exists and is the source of truth for its layer.
- 🚧 In progress — spec or reference implementation landing.
- 📋 Planned — not yet public.

## Layers

### Runtime ✅

- ✅ `wasmagent-js` v1.x — embedded agent runtime: WASM kernels (QuickJS,
  Pyodide, Wasmtime, Remote), MCP gateway, MCP attestation, AEP emitter,
  capability manifests; adapters for A2A, AG-UI, AI SDK, Claude Agent SDK.
- 📋 `wasmagent-py` — Python agent runtime sibling; shares AEP schema,
  Criterion/ConstraintIR protocol, and symkernel HTTP adapter.

### Gateway 🚧

- 🚧 `wasmagent-proxy` — Proxy-Wasm (Rust) evidence engine for Envoy, Istio,
  Kong, and Consul: intercepts Agent/MCP/A2A HTTP traffic, applies
  `validation → delta → full` recording policy, emits Ed25519-signed AEP
  records (DSSE envelope). Joins `mcp-firewall` via shared `trace_id`.

### Verification 🚧

- 🚧 `symkernel` — Go symbolic verification backend: cel-go lightweight rules,
  wazero Wasm sandbox hard-isolation, Z3 SMT satisfiability proofs. OPA-style
  HTTP service; consumed by wasmagent-js (CelGoVerifier / Z3Verifier) and
  future wasmagent-py via a thin adapter. Deploys on Cloudflare Containers.

### Workloads ✅

- ✅ `bscode` — coding-agent workload on Cloudflare Workers with AEP evidence
  export, deny capabilities, output taint labels, and RolloutProvenance.
- 📋 `erp-agent` — ERP-domain workload with order-state and ledger verifiers,
  mirroring the role `bscode` plays for coding tasks.

### Evidence pipelines ✅

- ✅ `trace-pipeline` (`evomerge` on PyPI) — eval_trust paired statistics,
  AgentTrustScore stable JSON schema, training-data admission gate; schema
  compatible with `wasmagent-js` v1.x AEP.
- 🚧 `wasmagent-train-replay` — causal evidence layer for distributed GPU
  training: reads PyTorch Flight Recorder dumps, builds cross-rank PROV-DM
  provenance graphs, records Ed25519-signed `EpochEvidenceBundle`s, supports
  tensor-origin tracing and deterministic replay.

### Trust artifacts ✅

- ✅ `agent-trust-infra` — AgentBOM, MCP Posture, and Trust Passport: spec,
  reference implementation, and CLI.
- 🚧 EU AI Act Annex IV compliance mapping — draft covers 20/29 Annex IV
  sub-items; deadline 2026-08-02 (Article 11 effective for high-risk AI).

### Audit ✅

- ✅ `open-agent-audit` — enterprise audit product with AEP v0.3 adapter;
  deployed at [trustavo.com](https://trustavo.com).
  `@openagentaudit/core`, `adapters`, `schema` published on npm.
- 🚧 Regulatory profiles: OWASP Agentic Top 10, NIST AI RMF,
  ISO/IEC 42001, EU AI Act Annex IV.

### Evaluation ✅

- ✅ `fresharena` — dynamic, verifiable, adversarial evaluation protocol for
  coding agents; FAEP schema, submit-then-test adversarial testing, Public
  Immunity Pool. Results feed back into the evidence chain.
- 🚧 Technical paper (FreshArena: FAEP protocol + empirical results on
  JSON Transform World) in preparation.

### Project home ✅

- ✅ `.github` — org portal; profile, public ledgers, shared org docs, RFC
  registry, and the source of truth for the full roadmap and project list.

### Ops ✅

- ✅ `wasmagent-ops` — internal operations hub: generators and ops tooling for
  the org. Ships no public product; listed for inventory completeness.

## Cross-cutting (planned)

- 📋 Ingestion adapters: OpenTelemetry GenAI, Langfuse, LangSmith.
- 📋 `erp-agent` public repository.
- 📋 `wasmagent-py` Python runtime and symkernel adapter.
- 📋 Cross-repo coherence patrol: org repo list ↔ profile README ↔
  cross-repo URLs ↔ roadmap completion.
- 📋 Trust Passport product module: issuance, verification, renewal (Trustavo).
- 📋 symkernel Phase 1: wazero sandbox (`/v1/sandbox/run`), Z3 integration
  (`/v1/verify/z3`), generate-error-repair loop.
