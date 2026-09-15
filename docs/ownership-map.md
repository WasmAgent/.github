# Ownership Map

| Area | Repos / paths | Owning role | Review requirement |
|---|---|---|---|
| Protocol & conformance | `wasmagent-protocol` (schemas, `conformance/aep`) | Protocol reviewer | Protected main, required CI, PR only |
| Org governance & ledgers | `.github` (`claims/`, `evidence/`, `docs/`, `policies/`) | Maintainer + Security reviewer | Public-claims CI, external-evidence CI |
| Runtime Worker & deploy gate | `open-agent-audit` (`packages/worker`, `.github/workflows/deploy.yml`) | Runtime reviewer | Protected main; R0.5 toolchain + R0 identity + R1 smoke gates fail the deploy |
| Package releases | `wasmagent-js`, `open-agent-audit`, `agentbom` (changesets) | Release maintainer | Release preconditions CI |
| Production secrets | Cloudflare account (Workers deploy token, `API_KEY`) | Maintainer only | Rotation procedure in `maintainer-continuity.md` |
| Production D1 (`oaa-meta`) | schema migrations, tables | Runtime reviewer | Migrations applied via `wrangler d1 execute --remote` from `packages/worker/migrations` |
| External claims | `evidence/external-validation.json`, `claims/public-claims.yml` | Security reviewer | EXT/claims validators + overreach guard |

Nothing in this map grants exceptions to branch protection or to the runtime
gates (R0/R0.5/R1). Where a role is vacant, the Maintainer holds it and the
gap is recorded in `MAINTAINERS.md`.
