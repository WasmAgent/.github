# WasmAgent Repository Boundary Policy

> One capability → one primary owner.
> One public schema → one canonical source.
> Cross-repo reuse → versioned contract or adapter.

This document is the org-level boundary policy referenced by each repo's CLAUDE.md.
For schema ownership details see `docs/org-contract-map.md`.
For per-repo maturity see `docs/maturity-matrix.md`.

## Tiers

| Tier | Repos | Role |
|---|---|---|
| **Tier 0** — Governance | `.github` | Org portal, Golden Path, ledgers, governance docs |
| **Tier 1** — Core product | `wasmagent-js`, `open-agent-audit`, `trace-pipeline` | Runtime, audit, admission |
| **Tier 2** — Reference workload | `bscode` | Real coding workload, Golden Path fixture producer |
| **Tier 3** — Specification incubator | `agent-trust-infra` | AgentBOM, MCP Posture specs |
| **Tier 4** — Research | `fresharena` | Dynamic evaluation protocol |
| **Infrastructure** | `wasmagent-proxy`, `symkernel`, `wasmagent-train-replay` | Gateway evidence, verification, training audit |

## Focus & lifecycle

The maturity tiers above answer *"how stable is this repo?"* A second,
orthogonal axis answers *"how central is it to the mission, and what happens to
it long-term?"* — captured by the `focus` field in `docs/project-index.json`:

- **Core spine** — `wasmagent-js`, `symkernel`, `agent-trust-infra`, and planned
  `wasmagent-py`. Evidence, verification, trust. Sustained investment; these
  define the org's identity.
- **Adjacent** — `wasmagent-proxy`, `trace-pipeline`, `wasmagent-train-replay`.
  Extend the spine to a surface. Their **exit condition** (per the "Adding a new
  repository" rule) is *roadmap complete → community maintenance*, not
  archival: code, schemas, and history stay in place.
- **Product / research / reference** — `open-agent-audit`, `fresharena`,
  `bscode`. Downstream surfaces, governed by their own repo scope.

A repo's focus changing (e.g. adjacent → community-maintained) is an
architecture-review event, like any change to org-wide structure.

## Rules

### Adding a new capability
Before implementing, answer:
1. Which repo's core responsibility does this belong to?
2. Does an equivalent implementation already exist?
3. Does it introduce or modify a cross-repo schema?
4. Does it require a stable interface, adapter, or compatibility layer?
5. Will it force other repos to synchronize a release?
6. How does it strengthen this repo rather than duplicate another?

### Adding a new public schema
- Requires an entry in `docs/org-contract-map.md` before merge
- Requires a versioning policy (semver or explicit stability label)
- Requires at least one conformance test
- Architecture review: decision within 48 hours

### Adding a new repository
Required before creating:
- Independent publishing value
- Named maintainer
- Exit condition (what would cause it to be archived or merged)
- Entry in `docs/project-index.json` and `docs/maturity-matrix.md`

### Cross-repo reuse
- Consume schemas via versioned npm/pip packages — never copy JSON locally
- Breaking contract changes announced in release ledger before merging
- Adapters preferred over copied implementations

### What is always allowed
- New features and research directions within a repo's defined scope
- New models, frameworks, and infrastructure integrations
- New benchmarks, worlds, policy profiles, and verifiers
- New CLI, UI, registry, and dev tools within scope
- Fast prototypes and experiments (labelled as such)
