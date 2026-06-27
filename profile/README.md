# WasmAgent

Evidence-first stack for governed AI agents and MCP-based tool use.

> **Training is optional and gated. Evidence is mandatory.**

## Projects

| Repository | Role |
|---|---|
| [wasmagent-js](https://github.com/WasmAgent/wasmagent-js) | Embedded agent runtime — WASM sandbox, MCP firewall, capability manifests, AEP emitter |
| [bscode](https://github.com/WasmAgent/bscode) | Reference coding-agent workload on Cloudflare Workers; AEP evidence export |
| [trace-pipeline](https://github.com/WasmAgent/trace-pipeline) | Measurement trust · evidence admission gate · training-audit backend |
| [open-agent-audit](https://github.com/WasmAgent/open-agent-audit) | Enterprise audit product — evidence reports, regulatory mappings, benchmark claim audit |
| [wasmagent](https://github.com/WasmAgent/wasmagent) | Project home — roadmap, claim registry, release ledger |

Planned: `erp-agent` — an ERP-domain workload with order-state and ledger
verifiers, mirroring the role `bscode` plays for coding tasks.

## Product matrix

![WasmAgent product matrix](https://raw.githubusercontent.com/WasmAgent/wasmagent/main/assets/product-matrix.webp)

`wasmagent-js` protects agent execution and emits signed AEP events. Real
workloads (`bscode`, future `erp-agent`) produce verifiable runtime traces.
`trace-pipeline` audits benchmark claims with paired statistics, gates training
data admission, and records every training run as auditable evidence.
`open-agent-audit` turns the full evidence chain into enterprise-readable
audit reports — deployed at **[trustavo.com](https://trustavo.com)**.

## What is Trustavo?

**[Trustavo](https://trustavo.com)** is the production deployment of
OpenAgentAudit. The name combines *trust* with *-avo* — evoking a trustworthy,
authoritative voice. In AI governance, evidence only counts when it is trusted;
Trustavo exists to make that trust legible to enterprise teams, auditors, and
regulators.

## Maintainers wanted

We are looking for maintainers across several focus areas. Open to
part-time and async contribution; commit access is granted after a
sustained track record.

- **Runtime** — `wasmagent-js`, AEP, MCP firewall, capability manifests
- **Workloads** — `bscode`, the planned `erp-agent`, future domain workloads
- **Pipelines** — `trace-pipeline` (measurement trust, admission, training audit)
- **Audit product** — `open-agent-audit` / Trustavo (evidence reports, Cloudflare Workers)
- **Adapters** — OpenTelemetry GenAI, Langfuse, LangSmith ingestion
- **Regulatory profiles** — OWASP Agentic Top 10, NIST AI RMF, ISO/IEC 42001, EU AI Act Annex IV mappings
- **DevRel & docs** — quickstart guides, integration walkthroughs, sample reports

Interested? Open an issue titled `maintainer: <area>` in the relevant
repository, or start a GitHub Discussion in the project home repository.

## Disclaimer

Repositories in this organization produce **technical evidence** and
research tooling. They do not provide legal advice, regulatory
certification, or compliance determinations.
