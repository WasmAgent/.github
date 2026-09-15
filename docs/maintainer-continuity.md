# Maintainer Continuity

Operational procedures so a new maintainer (or a future you) can run the
platform from this document alone.

## Cut a package release

1. Changesets accumulate on `main`; changesets bot opens a
   `changeset-release/main` PR (e.g. #299).
2. Review the version bump and changelog against actual merged changes.
3. Merge the release PR; the Release workflow publishes. Never merge a release
   PR merely because CI is green — confirm the changelog describes real changes.

## Rotate production secrets

| Secret | Where | Rotation |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` (Actions deploy token) | Cloudflare dashboard → Account API tokens | Edit permissions in place (token value survives edits) or Roll (new value) → `gh secret set CLOUDFLARE_API_TOKEN -R WasmAgent/open-agent-audit` |
| `API_KEY` (production Worker auth / R1 smoke) | Cloudflare Worker secret | `openssl rand -hex 32` → `wrangler secret put API_KEY --name open-agent-audit`; keep in sync with GitHub `OAA_SMOKE_API_KEY` |
| `CF_D1_DATABASE_ID` / KV ids | GitHub secrets | Stable identifiers; rotate only on database recreation |

After any deploy-token change, run the D1 REST probe
(`diag-d1-rest.yml`) — probes 3/4 must return 200.

## Roll back a broken deployment

1. Fastest lever: `wrangler rollback` in `open-agent-audit` (immediate, keeps
   the bad commit in history).
2. Proper lever: revert PR on `main`; the Deploy workflow re-runs R0.5/R0/R1
   gates on the revert commit.
3. If R1 smoke fails on a good commit, suspect the D1 quota window
   (see `docs/runbooks` in product repos and the structured
   `dependency_unavailable` 503 semantics) — rerun the deploy job once the
   window reopens; never disable the gate.

## Publish a certified target

See `wasmagent-protocol/conformance/aep/README.md` ("Component identity vs
publication identity") and `scripts/verify-certified-publication.mjs`.
Component tuple ≠ publication commit; consumers pin both.

## Emergency revocation

Passports: `POST /passport/:id/revoke` with a valid key — D1
(`passport_revocations`) is the authoritative registry; the KV mirror is
best-effort only. If D1 is unavailable, revocation fails closed (503/409
semantics) and MUST NOT be bypassed via KV.

## Approve an external claim

1. Add/update a record in `evidence/external-validation.json` with
   `evidence_type`, `claim_ceiling`, `prohibited_claims`, `limitations`.
2. Reference it from `claims/public-claims.yml` via `external_evidence_refs`
   with a matching `claim_class`.
3. EXT + claims validators enforce the rest in CI.
