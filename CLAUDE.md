# WasmAgent .github — CLAUDE.md

## What this repository is

Org profile, governance documents, Golden Path integration demo, and shared ledgers
for the WasmAgent organization. Content here is linkable from the org profile and
owned by the organization rather than any single product repo.

## Repository maturity

| | |
|---|---|
| **Status** | Active |
| **Contract stability** | Stable (ledgers, assets); Evolving (Golden Path, docs) |
| **Recommended for** | Org navigation, cross-repo integration testing, governance docs |
| **Not recommended for** | Product-specific implementation or runtime code |

## Repository Boundaries

### This repository owns
- Org profile (`profile/README.md`) — renders at github.com/WasmAgent
- **Golden Path**: end-to-end `Protect → Record → Audit → Admit` demo (`golden-path/`)
- Cross-repo contract map (`docs/org-contract-map.md`)
- Repository boundary policy (`docs/repository-boundaries.md`)
- Org-level roadmap (`docs/roadmap.md`)
- Repository maturity matrix (`docs/maturity-matrix.md`)
- Claims registry (`claims/public-claims.yml`)
- Release ledger (`releases/public-release-ledger.yml`)
- Media and posts (`media/posts.yml`)
- Machine-readable project index (`docs/project-index.json`)
- Shared org assets: logo, product matrix SVG (`assets/`)
- Org-level RFC index (`docs/RFC/`)

### Other repositories own — do not duplicate here

| Capability | Owner |
|---|---|
| Runtime code, AEP emitter, MCP firewall | `wasmagent-js` |
| AgentBOM / MCP Posture specifications | `agent-trust-infra` |
| Trust Passport specification and product | `open-agent-audit` (`@openagentaudit/passport`) |
| Enterprise audit reports, regulatory mapping, Trustavo | `open-agent-audit` |
| Evidence admission, training data pipeline | `trace-pipeline` |
| Dynamic evaluation protocol (FAEP) | `fresharena` |
| Reference coding workload, bench-v0 fixtures | `bscode` |
| Gateway-level Proxy-Wasm evidence | `wasmagent-proxy` |
| Symbolic verification (CEL/wazero/Z3) | `symkernel` |
| Distributed training causal provenance | `wasmagent-train-replay` |

### Golden Path ownership
This repo owns the Golden Path **orchestration, fixture version lock, and
cross-repo integration tests**. Each product repo owns its own implementation.
The Golden Path is the shared integration acceptance line — not a replacement
for each repo's own CI.

## Bot instructions
- Run lint/typecheck only if scripts are added to `golden-path/`
- All new governance docs go in `docs/`; all new Golden Path scripts go in `golden-path/`
- `docs/project-index.json` is machine-readable — keep it in sync with `docs/roadmap.md`
- `docs/org-contract-map.md` is the schema ownership registry — update when ownership changes
- When adding a repo to `docs/maturity-matrix.md`, also add it to `docs/project-index.json`
- Never add product runtime code here — this repo is orchestration and documentation only

## Roadmap

### P0 — Foundation (now)
- [x] Repository boundary policy written into each repo's CLAUDE.md
- [x] Maturity status added to each repo's README
- [ ] `CLAUDE.md` created (this file)
- [ ] `docs/org-contract-map.md` — schema ownership table
- [ ] `docs/maturity-matrix.md` — per-repo maturity matrix
- [ ] `docs/repository-boundaries.md` — org boundary policy doc
- [ ] `golden-path/README.md` — Golden Path entry point
- [ ] `golden-path/versions.lock` — pinned compatible versions
- [ ] `golden-path/scripts/` — bootstrap, run-agent, verify-aep, audit, admit, demo stubs
- [ ] `.github/workflows/org-contract-compatibility.yml` — cross-repo contract tests

### P1 — Golden Path v1 (30 days)
- [ ] `golden-path/docker-compose.yml` — one-command local demo
- [ ] `golden-path/tests/golden-path.test.ts` — automated integration test
- [ ] `golden-path/fixtures/` — safe-call.json, malicious-call.json
- [ ] `golden-path/expected/` — aep.json, audit-report.json, admission-decision.json
- [ ] `profile/README.md` updated to reference Golden Path

### P2 — Org metrics (60 days)
- [ ] Weekly KPI tracking (Golden Path pass/fail, external users, npm downloads)
- [ ] `claims/` registry updated with verified external citations
- [ ] `docs/RFC/` — first RFC for cross-repo AEP contract versioning
