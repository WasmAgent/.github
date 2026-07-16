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

### Workloads ✅

- ✅ `bscode` — coding-agent workload on Cloudflare Workers with AEP evidence
  export, deny capabilities, output taint labels, and RolloutProvenance.
- 📋 `erp-agent` — ERP-domain workload with order-state and ledger verifiers,
  mirroring the role `bscode` plays for coding tasks.

### Evidence pipelines ✅

- ✅ `trace-pipeline` (`evomerge` on PyPI) — eval_trust paired statistics,
  AgentTrustScore stable JSON schema, training-data admission gate; schema
  compatible with `wasmagent-js` v1.x AEP.

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
- 📋 Cross-repo coherence patrol: org repo list ↔ profile README ↔
  cross-repo URLs ↔ roadmap completion.
- 📋 Trust Passport product module: issuance, verification, renewal (Trustavo).
