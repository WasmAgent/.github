# Architecture

WasmAgent is an evidence-first stack for agent runs: protect execution,
record evidence, layer on trust artifacts, audit claims, and evaluate
adversarially. Each layer maps to a public repository.

```text
Runtime ──▶ Workloads ──▶ Evidence pipelines
                             │
                             ▼
                       Trust artifacts
                             │
                             ▼
                          Audit ◀── Evaluation
```

## Layers

### Runtime — `wasmagent-js`

Sandboxes agent tools in WebAssembly behind an MCP firewall gated by
per-agent capability manifests. Emits signed Agent Evidence Protocol (AEP)
events for every tool call and capability escalation.

### Workloads — `bscode`

Reference coding-agent workload on Cloudflare Workers. Demonstrates the
runtime on a real product surface and exports AEP evidence.

### Evidence pipelines — `trace-pipeline`

Ingests AEP traces, applies paired-statistics checks as an evidence
admission gate for training data, and records every training run as
auditable evidence.

### Trust artifacts — `agent-trust-infra`

Layers machine-readable identity and policy posture onto each run:

- **AgentBOM** — bill of materials for an agent (model, tools, dependencies).
- **MCP Posture** — declared and observed MCP surface and capabilities.
- **Trust Passport** — portable, verifiable run identity and posture.

These artifacts feed downstream audit and evaluation.

### Audit — `open-agent-audit`

Turns the full evidence chain plus trust artifacts into enterprise-readable
audit reports with regulatory mappings. Deployed at
[trustavo.com](https://trustavo.com).

### Evaluation — `fresharena`

Closes the loop with dynamic, verifiable, adversarial evaluation of coding
agents. Results are themselves evidence and re-enter the pipeline, keeping
the runtime, evidence, and audit story grounded in real benchmark
performance.

### Project home — `.github`

Org profile, public ledgers (claims, releases, media), and shared docs
(roadmap, architecture, evaluation summary).

## Data flow

1. `wasmagent-js` protects a run and emits AEP events.
2. Workloads such as `bscode` produce verifiable runtime traces.
3. `trace-pipeline` admits and stores those traces as evidence.
4. `agent-trust-infra` attaches AgentBOM, MCP Posture, and Trust Passport.
5. `open-agent-audit` renders the chain into audit reports.
6. `fresharena` evaluates agents adversarially; results re-enter step 3.
