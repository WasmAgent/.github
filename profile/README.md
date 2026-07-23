# WasmAgent — The Trusted Agent OS

> The industry's focus is shifting from *"can the agent do the task?"* to *"can the agent run reliably, at scale, over time?"* We believe that is still not enough. The real question is: **"can you prove the agent ran correctly?"**
>
> WasmAgent is building the infrastructure layer for that — a Trusted Agent OS: runtime isolation, protocol-level interception, symbolic verification, tamper-evident evidence, and regulatory compliance, composable as open infrastructure rather than a single product.
>
> Parts of this vision are shipping today. Parts are in active development. The table below is honest about which is which.


## Golden Path

The fastest way to see WasmAgent's trust loop end-to-end:

```bash
git clone https://github.com/WasmAgent/.github
cd .github/golden-path
./scripts/demo.sh
```

This runs `Protect → Record → Audit → Admit` across all core repos.
See [`golden-path/README.md`](../golden-path/README.md) for details.

> **Status:** scaffolded — not yet runnable. Track progress via the [issue tracker](https://github.com/WasmAgent/.github/issues?q=is%3Aissue+golden-path).

## Projects

WasmAgent is **open infrastructure for _provable_ AI agents** — not another
agent framework. The mission answers one question end-to-end: *can you prove the
agent ran correctly?* The organization is a **tree**, not a flat list: a **Core**
spine, the **Official tooling** and **Apps** that will grow around it, the
**Research** that feeds it, and the **evidence surfaces** that extend it. A
first-time visitor should tell the mission from its supporting cast at a glance.

This section is the human-readable view of
[`docs/project-index.json`](../docs/project-index.json), the machine-readable
source of truth (see each repo's `focus` field). This repository (`.github`) is
the organization's sole public portal.

### ⭐ Core — the platform

Evidence, verification, trust. Sustained, long-term investment; these define the
platform's identity.

| Repository | Role |
| --- | --- |
| [wasmagent-js](https://github.com/WasmAgent/wasmagent-js) | **Runtime** · Embedded agent runtime v1.x — WASM kernels (QuickJS, Pyodide, Wasmtime, Remote), MCP gateway + attestation, AEP emitter, capability manifests; adapters for A2A, AG-UI, AI SDK, and Claude Agent SDK. This is where signed evidence is born. |
| [wasmagent-protocol](https://github.com/WasmAgent/wasmagent-protocol) | **Protocol** · Canonical AEP + compliance JSON Schemas — the single source of truth every repo agrees on. Published as `@wasmagent/protocol` (npm) and `wasmagent-protocol` (PyPI). |
| [symkernel](https://github.com/WasmAgent/symkernel) | **Verification** 🚧 · Go symbolic verification backend — cel-go lightweight rules, wazero Wasm sandbox hard-isolation, Z3 SMT proofs; HTTP service consumed by wasmagent-js and wasmagent-py. "Proving it ran correctly" is the mission itself. |
| [agent-trust-infra](https://github.com/WasmAgent/agent-trust-infra) | **Trust & compliance** · AgentBOM, MCP Posture, and Trust Passport spec, reference impl, and CLI; EU AI Act Annex IV compliance mapping (draft, deadline **2026-08-02**). |

> **`wasmagent-py`** *(planned)* joins Core as the Python runtime sibling — same
> AEP schema, Criterion/ConstraintIR protocol, and symkernel adapter — so
> evidence is emitted wherever agents actually run, not just in JS.
>
> **AEP (Agent Evidence Protocol)** is the connective standard across Core,
> sedimented from the shipping runtime rather than designed up front and now
> versioned in `wasmagent-protocol`.

### 🛠 Official tooling

Official supporting tools that will grow around Core — CLI, devtools, examples,
starters. *Planned; no public repos yet.* Tracked so the tree has a home for
them rather than scattering them later.

### 🔌 Evidence surfaces — maturing, then handed to the community

These extend Core to a specific surface (gateway, training, pipeline). Once
their roadmaps land they move to **community maintenance** — not retired; code,
schemas, and history stay put.

| Repository | Role |
| --- | --- |
| [wasmagent-proxy](https://github.com/WasmAgent/wasmagent-proxy) | **Gateway** 🚧 · Proxy-Wasm (Rust) evidence engine for Envoy, Istio, Kong, Consul — intercepts Agent/MCP/A2A traffic, emits Ed25519-signed AEP records, joins mcp-firewall via shared trace_id |
| [trace-pipeline](https://github.com/WasmAgent/trace-pipeline) | **Evidence pipeline** · `evomerge` — trace-to-training backend: eval_trust paired statistics, AgentTrustScore, training-data admission gate, consumes `wasmagent-protocol` |
| [wasmagent-train-replay](https://github.com/WasmAgent/wasmagent-train-replay) | **Evidence pipeline** 🚧 · Causal evidence for distributed GPU training — cross-rank PROV-DM provenance graph, Ed25519-signed EpochEvidenceBundles, tensor-origin tracing, deterministic replay CLI |

### 🧪 Research

Grounds the platform in measured results; interfaces may change as experiments
evolve.

| Repository | Role |
| --- | --- |
| [fresharena](https://github.com/WasmAgent/fresharena) | **Evaluation** · Dynamic, verifiable, adversarial evaluation — FAEP schema, submit-then-test, Public Immunity Pool; paper in preparation |

### 📦 Product, reference & hub

The commercial audit surface, the reference workload, and this portal.

| Repository | Role |
| --- | --- |
| [open-agent-audit](https://github.com/WasmAgent/open-agent-audit) | **Audit product** · Enterprise audit product with AEP adapter; deployed at [trustavo.com](https://trustavo.com) |
| [bscode](https://github.com/WasmAgent/bscode) | **Reference workload** · Coding-agent workload on Cloudflare Workers — AEP evidence export, deny capabilities, output taint labels, RolloutProvenance |
| [`.github`](https://github.com/WasmAgent/.github) | **Org hub** · Organization portal — roadmap, claims registry, release ledger, project index, and cross-repo documentation |

### 🎮 Apps

End-user applications on top of the platform — playground, desktop, editor
extensions, demos. *Planned; no public repos yet.*

## Vision

The broader industry is converging on *Agent Runtime / Agent OS* as the next infrastructure frontier — the layer that moves agents from stateless one-shot calls to long-running, stateful, recoverable systems. We agree with that framing, and we go one step further.

**Reliability is necessary but not sufficient.** An agent that runs stably but whose behavior cannot be verified, audited, or proven correct is not ready for production systems, regulated industries, or multi-agent trust chains. The gap between "it finished" and "it did the right thing" is exactly where WasmAgent operates.

The Trusted Agent OS adds three layers that a plain Agent Runtime omits:

| Layer | What it solves | Status |
| --- | --- | --- |
| **Provable correctness** | `symkernel` — cel-go rules, wazero hard-isolation, Z3 SMT proofs | 🚧 in progress |
| **Tamper-evident evidence** | AEP (Agent Evidence Protocol) — Ed25519-signed behavioral records at gateway and runtime | shipping in `wasmagent-js` v1.x |
| **Regulatory compliance** | EU AI Act Annex IV mapping, OWASP Agentic Top 10, NIST AI RMF | draft in `agent-trust-infra` |

The analogy: if Agent Runtime is Kubernetes (run things reliably at scale), the Trusted Agent OS is Kubernetes + audit logging + policy enforcement + compliance reporting — composable, open, and infrastructure-grade.

## Architecture

![WasmAgent architecture](../assets/product-matrix.svg)

The **gateway** layer — `wasmagent-proxy` — sits at the network boundary, intercepting
Agent/MCP/A2A HTTP traffic across Envoy, Istio, Kong, and Consul, and emitting
Ed25519-signed AEP records before requests reach the runtime.

The **runtime** layer — `wasmagent-js` (v1.x) — protects agent execution across
multiple WASM kernels, enforces MCP policy via `mcp-gateway` and `mcp-attestation`,
and emits signed AEP events that flow into verifiable runtime traces. A Python
sibling, `wasmagent-py`, is planned and will share the same AEP schema, protocol,
and symkernel adapter.

`symkernel` backs both runtimes with symbolic verification: cel-go for lightweight
high-frequency rule evaluation, wazero for hard-isolated Wasm sandbox execution of
LLM-generated code, and Z3 SMT solving for combinatorial constraint proofs.

`bscode` and `fresharena` are the two live agent surfaces: coding workload and
adversarial evaluation, both instrumented to produce AEP evidence.

`trace-pipeline` (`evomerge` on PyPI) gates training-data admission with paired
statistics and records every training run as auditable evidence. Compatible with
`wasmagent-js` v1.x AEP schema. `wasmagent-train-replay` extends this to distributed
GPU training jobs: it reads PyTorch Flight Recorder dumps, builds a cross-rank
PROV-DM causal graph, and produces tamper-evident `EpochEvidenceBundle` records,
enabling tensor-origin tracing and deterministic replay.

`agent-trust-infra` layers on trust artifacts — AgentBOM, MCP Posture, and Trust
Passport — giving every agent run a machine-readable identity and policy posture.
An EU AI Act Annex IV compliance mapping (Article 11 / Annex IV, effective 2026-08-02)
is in draft, covering 20 of 29 Annex IV sub-items.

`open-agent-audit` turns the full evidence chain into enterprise-readable audit
reports with AEP v0.2 adapter support — deployed at **[trustavo.com](https://trustavo.com)**.

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
- **Runtime (Python)** — `wasmagent-py`, Python agent runtime and symkernel adapter
- **Gateway** — `wasmagent-proxy`, Proxy-Wasm evidence engine (Rust, Envoy/Istio/Kong)
- **Verification** — `symkernel`, cel-go rules, wazero sandbox, Z3 SMT integration (Go)
- **Pipelines** — `trace-pipeline` / `evomerge` (measurement trust, admission, training audit)
- **Training evidence** — `wasmagent-train-replay`, PyTorch Flight Recorder, PROV-DM, GPU training causal graphs
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
