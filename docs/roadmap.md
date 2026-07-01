# Roadmap

Living roadmap for the WasmAgent organization. Ticked items ship as public
repositories under [github.com/WasmAgent](https://github.com/WasmAgent);
unticked items are planned or in progress. This document mirrors
`gh repo list WasmAgent --visibility public`.

## Status legend

- ✅ Public repository exists and is the source of truth for its layer.
- 🚧 In progress — spec or reference implementation landing.
- 📋 Planned — not yet public.

## Layers

### Runtime ✅

- ✅ `wasmagent-js` — embedded agent runtime: WASM sandbox, MCP firewall,
  capability manifests, signed AEP event emitter.

### Workloads ✅

- ✅ `bscode` — reference coding-agent workload on Cloudflare Workers with
  AEP evidence export.
- 📋 `erp-agent` — ERP-domain workload with order-state and ledger verifiers,
  mirroring the role `bscode` plays for coding tasks.

### Evidence pipelines ✅

- ✅ `trace-pipeline` — measurement trust, evidence admission gate, and
  training-audit backend; records every training run as auditable evidence.

### Trust artifacts ✅

- ✅ `agent-trust-infra` — AgentBOM, MCP Posture, and Trust Passport: spec,
  reference implementation, and CLI giving every agent run a machine-readable
  identity and policy posture.
- 🚧 Reference-implementation coverage across all three artifact types.

### Audit ✅

- ✅ `open-agent-audit` — enterprise audit product; evidence reports and
  regulatory mappings, deployed at [trustavo.com](https://trustavo.com).
- 🚧 Regulatory profiles: OWASP Agentic Top 10, NIST AI RMF,
  ISO/IEC 42001, EU AI Act Annex IV.

### Evaluation ✅

- ✅ `fresharena` — dynamic, verifiable, adversarial evaluation protocol for
  coding agents; results feed back into the evidence chain.
- 🚧 Public benchmark task set and paired-statistics reporting.

### Project home ✅

- ✅ `.github` — org profile, public ledgers, shared org docs, and the
  source of truth for the full roadmap and project list.
- ✅ `wasmagent` — public landing page that directs readers to `.github` for
  the full roadmap and project list.

### Ops ✅

- ✅ `wasmagent-ops` — internal operations hub: generators and ops tooling for
  the org. Ships no public product; listed for inventory completeness.

## Cross-cutting (planned)

- 📋 Ingestion adapters: OpenTelemetry GenAI, Langfuse, LangSmith.
- 📋 Cross-repo coherence patrol: org repo list ↔ profile README ↔
  cross-repo URLs ↔ roadmap completion.
