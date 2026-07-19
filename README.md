# .github

Org profile, public ledgers, and shared org docs for
[WasmAgent](https://github.com/WasmAgent). Visitors land at
[github.com/WasmAgent](https://github.com/WasmAgent), which renders
[`profile/README.md`](profile/README.md).

Public ledgers and shared docs live here so they are linkable from the org
profile and owned by the organization rather than any single product repo.
Generators and ops tooling live in
[`wasmagent-ops`](https://github.com/WasmAgent/wasmagent-ops).

## Contents

- [`profile/README.md`](profile/README.md) — organization profile
- [`docs/`](docs/) — roadmap, architecture, evaluation summary, RFC registry
- [`docs/project-index.json`](docs/project-index.json) — machine-readable project index (source of truth for the project list)
- [`claims/`](claims/), [`releases/`](releases/), [`media/`](media/) — public ledgers
- [`assets/`](assets/) — logo and product matrix

## Canonical paths

The assets and ledgers above are the org-wide source of truth. Product
repositories should link to these centralized paths instead of keeping local copies.

- Product matrix image: `https://raw.githubusercontent.com/WasmAgent/.github/main/assets/product-matrix.svg`
- Project index: `https://github.com/WasmAgent/.github/blob/main/docs/project-index.json`
- Claims registry: `https://github.com/WasmAgent/.github/blob/main/claims/public-claims.yml`
- Release ledger: `https://github.com/WasmAgent/.github/blob/main/releases/public-release-ledger.yml`
- Media & posts: `https://github.com/WasmAgent/.github/blob/main/media/posts.yml`

## WasmAgent Ecosystem

| Repository | Role |
|---|---|
| [.github](https://github.com/WasmAgent/.github) | **Org hub** — this repo: org portal, roadmap, claims registry, release ledger, project index |
| [wasmagent-js](https://github.com/WasmAgent/wasmagent-js) | Runtime — embedded agent runtime (WASM kernels, MCP gateway, AEP emitter, capability manifests; A2A/AG-UI/Claude Agent SDK adapters) |
| wasmagent-py | Runtime (planned) — Python agent runtime; shares AEP schema, Criterion/ConstraintIR, symkernel adapter |
| [wasmagent-proxy](https://github.com/WasmAgent/wasmagent-proxy) | Gateway 🚧 — Proxy-Wasm evidence engine for Envoy/Istio/Kong; Ed25519-signed AEP records |
| [symkernel](https://github.com/WasmAgent/symkernel) | Verification 🚧 — Go symbolic verification backend; cel-go rules, wazero sandbox, Z3 SMT proofs |
| [bscode](https://github.com/WasmAgent/bscode) | Workload — coding-agent workload on Cloudflare Workers; AEP evidence, deny capabilities, RolloutProvenance |
| [fresharena](https://github.com/WasmAgent/fresharena) | Evaluation — dynamic adversarial evaluation protocol; FAEP schema, submit-then-test, Public Immunity Pool |
| [trace-pipeline](https://github.com/WasmAgent/trace-pipeline) | Evidence pipeline — trace-to-training backend; AgentTrustScore, training-data admission gate |
| [wasmagent-train-replay](https://github.com/WasmAgent/wasmagent-train-replay) | Evidence pipeline 🚧 — causal evidence for distributed GPU training; cross-rank PROV-DM graph, signed EpochEvidenceBundles |
| [agent-trust-infra](https://github.com/WasmAgent/agent-trust-infra) | Trust artifacts — AgentBOM, MCP Posture, Trust Passport spec + CLI; EU AI Act Annex IV mapping |
| [open-agent-audit](https://github.com/WasmAgent/open-agent-audit) | Audit — enterprise audit product with AEP v0.3 adapter; deployed at trustavo.com |
