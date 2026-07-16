# WasmAgent

Protect agent runs. Record evidence. Audit claims. Train only from trusted traces.

## Projects

The **architecture** layer below is the human-readable view of
[`docs/project-index.json`](../docs/project-index.json), the machine-readable
source of truth for the project list. This repository (`.github`) is the
organization's sole public portal.

| Repository | Role |
| --- | --- |
| [`.github`](https://github.com/WasmAgent/.github) | **Org hub** · Organization portal — roadmap, claims registry, release ledger, project index, and cross-repo documentation |
| [wasmagent-js](https://github.com/WasmAgent/wasmagent-js) | **Runtime** · Embedded agent runtime v1.x — WASM kernels (QuickJS, Pyodide, Wasmtime, Remote), MCP gateway + attestation, AEP emitter, capability manifests; adapters for A2A, AG-UI, AI SDK, and Claude Agent SDK |
| [bscode](https://github.com/WasmAgent/bscode) | **Workload** · Coding-agent workload on Cloudflare Workers — AEP evidence export, deny capabilities, output taint labels, RolloutProvenance |
| [trace-pipeline](https://github.com/WasmAgent/trace-pipeline) | **Evidence pipeline** · `evomerge` — trace-to-training backend: eval_trust paired statistics, AgentTrustScore, training-data admission gate, wasmagent-js v1.x schema compat |
| [agent-trust-infra](https://github.com/WasmAgent/agent-trust-infra) | **Trust artifacts** · AgentBOM, MCP Posture, and Trust Passport spec, reference impl, and CLI; EU AI Act Annex IV compliance mapping (draft) |
| [open-agent-audit](https://github.com/WasmAgent/open-agent-audit) | **Audit** · Enterprise audit product with AEP v0.3 adapter; deployed at [trustavo.com](https://trustavo.com) |
| [fresharena](https://github.com/WasmAgent/fresharena) | **Evaluation protocol** · Dynamic, verifiable, adversarial evaluation — FAEP schema, submit-then-test, Public Immunity Pool; paper in preparation |

## Architecture

![WasmAgent architecture](../assets/product-matrix.svg)

The **runtime** layer — `wasmagent-js` (v1.x) — protects agent execution across
multiple WASM kernels, enforces MCP policy via `mcp-gateway` and `mcp-attestation`,
and emits signed AEP events that flow into verifiable runtime traces.

`bscode` and `fresharena` are the two live agent surfaces: coding workload and
adversarial evaluation, both instrumented to produce AEP evidence.

`trace-pipeline` (`evomerge` on PyPI) gates training-data admission with paired
statistics and records every training run as auditable evidence. Compatible with
`wasmagent-js` v1.x AEP schema.

`agent-trust-infra` layers on trust artifacts — AgentBOM, MCP Posture, and Trust
Passport — giving every agent run a machine-readable identity and policy posture.
An EU AI Act Annex IV compliance mapping (Article 11 / Annex IV, effective 2026-08-02)
is in draft, covering 20 of 29 Annex IV sub-items.

`open-agent-audit` turns the full evidence chain into enterprise-readable audit
reports with AEP v0.3 adapter support — deployed at **[trustavo.com](https://trustavo.com)**.

`fresharena` closes the loop with dynamic, verifiable, adversarial evaluation,
grounding the runtime, evidence, and audit story in measured benchmark performance.
A technical paper (FAEP protocol + empirical results) is in preparation.

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

- **Runtime** — `wasmagent-js`, AEP, MCP gateway/attestation, capability manifests
- **Pipelines** — `trace-pipeline` / `evomerge` (measurement trust, admission, training audit)
- **Trust artifacts** — `agent-trust-infra` (AgentBOM, MCP Posture, Trust Passport, EU AI Act mapping)
- **Audit product** — `open-agent-audit` / Trustavo (evidence reports, Cloudflare Workers)
- **Evaluation** — `fresharena` (dynamic, verifiable, adversarial evaluation; paper preparation)
- **Adapters** — OpenTelemetry GenAI, Langfuse, LangSmith ingestion
- **Regulatory profiles** — OWASP Agentic Top 10, NIST AI RMF, ISO/IEC 42001, EU AI Act Annex IV
- **DevRel & docs** — quickstart guides, integration walkthroughs, sample reports

Interested? Open an issue titled `maintainer: <area>` in the relevant
repository, or start a GitHub Discussion in the project home repository.

## Ledgers & registries

Public ledgers and shared docs live in this repository so they belong to the
org, not any single product.

- [RFC registry](../docs/RFC/README.md) — org-level design decisions that span multiple repositories
- [Claims registry](../claims/public-claims.yml) — org claims mapped to evidence and review status
- [Release ledger](../releases/public-release-ledger.yml) — public releases across repositories
- [Media & posts](../media/posts.yml) — talks, posts, and appearances
- [Project index](../docs/project-index.json) — machine-readable source of truth for the project list
- [Roadmap](../docs/roadmap.md) — living roadmap mirroring the public repo list

## Disclaimer

Repositories in this organization produce **technical evidence** and
research tooling. They do not provide legal advice, regulatory
certification, or compliance determinations.
