# WasmAgent

Verifiable evidence and security control plane for AI agents and MCP-based
tool use.

## Projects

| Repository | Role |
|---|---|
| [wasmagent-js](https://github.com/WasmAgent/wasmagent-js) | Embedded agent runtime — WASM sandbox, MCP firewall, capability manifests, AEP emitter |
| [bscode](https://github.com/WasmAgent/bscode) | Reference coding-agent workload on Cloudflare Workers; AEP evidence export |
| [trace-pipeline](https://github.com/WasmAgent/trace-pipeline) | Trace → training-data pipeline; eval trust audit toolkit |
| [open-agent-audit](https://github.com/WasmAgent/open-agent-audit) | Open evidence format and Cloudflare-native audit toolkit |
| [wasmagent](https://github.com/WasmAgent/wasmagent) | Project home — roadmap, claim registry, release ledger |

Planned: `erp-agent` — an ERP-domain workload with order-state and ledger
verifiers, mirroring the role `bscode` plays for coding tasks.

## Product matrix

![WasmAgent product matrix](https://raw.githubusercontent.com/WasmAgent/wasmagent/main/assets/product-matrix.webp)

A single runtime (`wasmagent-js`) emits AEP records from real workloads.
Two downstream pipelines consume the same AEP JSONL: `trace-pipeline`
produces training data, and `open-agent-audit` produces audit evidence.

## Maintainers wanted

We are looking for maintainers across several focus areas. Open to
part-time and async contribution; commit access is granted after a
sustained track record.

- **Runtime** — `wasmagent-js`, AEP, MCP firewall, capability manifests
- **Workloads** — `bscode`, the planned `erp-agent`, future domain workloads
- **Pipelines** — `trace-pipeline` (training data), `open-agent-audit` (audit evidence)
- **Adapters** — OpenTelemetry GenAI, Langfuse, LangSmith ingestion
- **Regulatory profiles** — OWASP Agentic Top 10, NIST AI RMF, ISO/IEC 42001, EU AI Act Annex IV mappings
- **DevRel & docs** — quickstart guides, integration walkthroughs, sample reports

Interested? Open an issue titled `maintainer: <area>` in the relevant
repository, or email the project home repository's maintainers via a
GitHub Discussion.

## Disclaimer

Repositories in this organization produce **technical evidence** and
research tooling. They do not provide legal advice, regulatory
certification, or compliance determinations.
