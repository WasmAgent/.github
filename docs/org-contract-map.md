# Org Contract Map

Canonical ownership of all cross-repository schemas, protocols, and trust artifacts.
Update this file when ownership changes. This is the authoritative reference —
individual repo CLAUDE.md files should agree with this table.

Last updated: 2026-07-27

## Single source of truth

**All cross-repository schemas are owned by [`WasmAgent/wasmagent-protocol`](https://github.com/WasmAgent/wasmagent-protocol).**
That repository is the canonical source; its `schemas/index.json` is the machine-readable
registry. Schemas are published as two versioned packages that downstream repos depend on:

- npm: [`@wasmagent/protocol`](https://www.npmjs.com/package/@wasmagent/protocol)
- PyPI: [`wasmagent-protocol`](https://pypi.org/project/wasmagent-protocol/)

**No repository may define, fork, or vendor a hand-edited copy of a cross-repo schema.**
Consumers depend on the package (or, in a language without one, `$ref` the canonical
`https://wasmagent.dev/schemas/...` URL and pin a version). A repository named in the
"Domain steward" column below owns the *design* of that schema — it proposes changes
through `wasmagent-protocol`'s [contract change process](https://github.com/WasmAgent/wasmagent-protocol/blob/main/docs/CONTRACT-CHANGE-PROCESS.md) —
but the schema JSON itself lives only in `wasmagent-protocol`.

## Schema ownership

| Schema / Artifact | Canonical source | Version | Domain steward | Consumers |
|---|---|---|---|---|
| AEP record (`aep-record`) | `wasmagent-protocol` | `aep/v0.2` | `wasmagent-js` | `wasmagent-js`, `wasmagent-proxy`, `trace-pipeline`, `wasmagent-train-replay`, `open-agent-audit` |
| Evidence envelope (`evidence-envelope`) | `wasmagent-protocol` | `aep/v0.1` | `wasmagent-js` | `wasmagent-js`, `wasmagent-proxy`, `trace-pipeline`, `open-agent-audit` |
| `ConstraintIR` (`constraint-ir`) | `wasmagent-protocol` | `compliance/v1` | `symkernel` | `wasmagent-js`, `symkernel`, `trace-pipeline` |
| `ConstraintViolation` (`constraint-violation`) | `wasmagent-protocol` | `compliance/v1` | `symkernel` | `wasmagent-js`, `symkernel`, `trace-pipeline` |
| `RepairTrace` (`repair-trace`) | `wasmagent-protocol` | `compliance/v1` | `wasmagent-js` | `wasmagent-js`, `trace-pipeline` |
| `TaskSpec` (`task-spec`) | `wasmagent-protocol` | `compliance/v1` | `wasmagent-js` | `wasmagent-js`, `trace-pipeline` |
| `ComplianceEvalRecord` (`compliance-eval-record`) | `wasmagent-protocol` | `compliance-eval-record/v1` | `wasmagent-js` | `wasmagent-js`, `trace-pipeline` |
| Rollout wire format (`rollout-wire`) | `wasmagent-protocol` | `rollout-wire/v1` | `wasmagent-js` | `wasmagent-js`, `trace-pipeline` |
| AgentBOM (`agentbom`) | `wasmagent-protocol` | `agentbom/v0.1` | `agent-trust-infra` | `agent-trust-infra`, `open-agent-audit` |
| MCP Posture (`mcp-posture`) | `wasmagent-protocol` | `mcp-posture/v0.1` | `agent-trust-infra` | `agent-trust-infra`, `open-agent-audit` |
| Trust Passport (`trust-passport`) | `wasmagent-protocol` | `trust-passport/v0.1` | `open-agent-audit` | `agent-trust-infra`, `open-agent-audit` |

### Repo-local schemas (single consumer — intentionally NOT centralized)

These are owned by a single repository and consumed only there, so per the
`wasmagent-protocol` scope rule ("a schema is admitted only when there is a demonstrated
second consumer") they stay local. Listed here so the boundary is explicit:

| Schema / Artifact | Owner | Notes |
|---|---|---|
| `EpochEvidenceBundle` | `wasmagent-train-replay` | Wraps AEP records for replay; bundle envelope is replay-private |
| SFT/DPO/PPO training records | `trace-pipeline` | Training-pipeline-private; single owner |
| Audit report (`@openagentaudit/schema`) | `open-agent-audit` | Product schema, published independently |
| FAEP record (`faep-schema/v0.1`) | `fresharena` | Research artifact |
| bench-task (`bench-task.v1`) | `bscode` | Benchmark fixture format |
| Admission decision | `trace-pipeline` | evomerge-private |

If any of these gains a second org consumer, it must be promoted into
`wasmagent-protocol` before the second consumer ships.

## Deprecation policy

- Schema changes that remove or rename fields are **breaking** and require a major version bump.
- Producers must support the previous minor version for at least one release cycle.
- Breaking changes must be announced in the `.github` release ledger before merging.
- All changes flow through `wasmagent-protocol`'s
  [contract change process](https://github.com/WasmAgent/wasmagent-protocol/blob/main/docs/CONTRACT-CHANGE-PROCESS.md).

## Cross-repo coupling rules

1. Downstream repos consume schemas via the versioned `@wasmagent/protocol` (npm) or
   `wasmagent-protocol` (PyPI) package — **never copy or fork schema JSON locally**.
2. If a schema is needed in a language without a package, `$ref` the canonical
   `https://wasmagent.dev/schemas/...` URL and pin the version; if the schema must be
   vendored (offline build, Go/Rust), vendor it **verbatim from the published package**
   and add a CI drift gate against the pinned package version (see `symkernel`'s
   `make sync-schemas` for the reference implementation).
3. A repo may not extend a canonical schema with local-only fields. If a field is needed,
   propose it upstream in `wasmagent-protocol`.
4. Any new cross-repo schema requires promotion into `wasmagent-protocol` and an entry in
   this table before the second consumer merges.
5. `agent-trust-infra` `specs/trust-passport/` is **frozen** — consume the canonical
   `trust-passport` schema from `@wasmagent/protocol` instead.
