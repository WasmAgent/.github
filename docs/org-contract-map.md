# Org Contract Map

Canonical ownership of all cross-repository schemas, protocols, and trust artifacts.
Update this file when ownership changes. This is the authoritative reference —
individual repo CLAUDE.md files should agree with this table.

Last updated: 2026-07-21

## Schema ownership

| Schema / Artifact | Canonical owner | Version | Producers | Consumers | Compatibility tests |
|---|---|---|---|---|---|
| AEP record (`aep-record/v0.2`) | `wasmagent-js` (`@wasmagent/aep`) | v0.2 | `wasmagent-js`, `wasmagent-proxy`, `wasmagent-train-replay` | `open-agent-audit`, `trace-pipeline`, `bscode` | nightly parity check in `trace-pipeline` |
| AgentBOM specification | `agent-trust-infra` (`specs/agentbom/`) | v0.x | `agent-trust-infra` CLI | `open-agent-audit`, `wasmagent-js` | fixture tests in `agent-trust-infra` |
| MCP Posture specification | `agent-trust-infra` (`specs/mcp-posture/`) | v0.x | `agent-trust-infra` CLI | `open-agent-audit`, `wasmagent-proxy` | fixture tests in `agent-trust-infra` |
| Trust Passport specification + product | `open-agent-audit` (`@openagentaudit/passport`) | v0.1 | `open-agent-audit` | `wasmagent-js`, `agent-trust-infra` (frozen ref) | open-agent-audit issues #52–#54 |
| Audit report (`@openagentaudit/schema`) | `open-agent-audit` | published | `open-agent-audit` | `trace-pipeline`, `bscode` | open-agent-audit CI |
| Admission decision | `trace-pipeline` (`evomerge`) | v0.x | `trace-pipeline` | Golden Path | trace-pipeline CI |
| FAEP record (`faep-schema/v0.1`) | `fresharena` (`packages/faep-schema`) | v0.1 | `fresharena` | `open-agent-audit` (Phase 3 adapter) | fresharena CI |
| `ComplianceEvalRecord` | `wasmagent-js` (`@wasmagent/compliance`) | v0.x | `wasmagent-js`, `bscode` | `trace-pipeline` | nightly parity check |
| `EpochEvidenceBundle` | `wasmagent-train-replay` | v0.x | `wasmagent-train-replay` | `open-agent-audit`, `trace-pipeline` | wasmagent-train-replay CI |
| Criterion / ConstraintIR protocol | `symkernel` (HTTP API) | v1 | `symkernel` | `wasmagent-js` (`CelGoVerifier`, `Z3Verifier`) | symkernel integration test |
| bscode rollout record (`rollout-wire/v1`) | `bscode` | v1 | `bscode` | `trace-pipeline`, `open-agent-audit` | bscode CI |

## Deprecation policy

- Schema changes that remove or rename fields are **breaking** and require a major version bump.
- Producers must support the previous minor version for at least one release cycle.
- Breaking changes must be announced in `.github` release ledger before merging.

## Cross-repo coupling rules

1. Downstream repos consume schemas via versioned npm/pip packages — never copy schema JSON locally.
2. If a schema is needed in a language without a package, use `$ref` to the canonical source URL.
3. Any new cross-repo schema requires an entry in this table before merge.
4. `agent-trust-infra` `specs/trust-passport/` is **frozen** — use `@openagentaudit/passport` instead.
