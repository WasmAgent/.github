# ADR — Governance root authority: dedicated GitHub App runner

Status: proposed (pending maintainer decision on route)
Date: 2026-09-19

## Context

The `.github` repository enforces claim/evidence governance through pinned
trusted validators (`scripts/validate-public-claims.py`,
`scripts/validate-external-evidence.py`) checked out at an immutable main
revision (`.validator` pins in `public-claims-ci.yml` and
`external-outbound-preflight.yml`), plus three generations of stale-pin
discriminator fixtures. Branch protection on `main` requires six status
contexts (`enforce_admins=true`, `strict=true`).

**Residual structural gap:** the workflow DEFINITIONS that host those checks
live in the candidate tree. A PR with repository write access could rewrite
`public-claims-ci.yml` to delete the pinned-validator steps while keeping the
required job names — GitHub identifies required status checks by check-run
name (and optionally by owning App), not by workflow content, so a neutered
workflow still reports green under the same context.

Platform facts verified 2026-09-19 (owner API):

- Org plan is `free`. Organization rulesets are Team/Enterprise — the
  org-level "Require workflows to pass before merging" route is unavailable.
- `file_path_restriction` returned `422 Invalid rule` on this repo. This is a
  **push-ruleset rule for private/internal repositories**, not a general
  branch-ruleset rule; it is unavailable here because `.github` is public,
  regardless of plan. (An earlier attribution to the Free plan was wrong.)
- Required status checks can be bound to a specific GitHub App via the
  branch-protection API (`required_status_checks` contexts accept
  `{context, app_id}`). Statuses created by any token with repository write
  access are NOT bound to a context by default — a same-named commit status
  can be forged by any writer. Therefore a PAT-written status is not a root
  authority; an App-bound check run is.

## Options

- **A. Upgrade org plan (Team/Enterprise).** Unlocks organization rulesets
  and "Require workflows to pass before merging" pointing at a fixed source
  repository/branch. Cost: subscription. Caveat: candidates would still run
  GitHub-Actions-app checks in-tree; the required workflow itself is the
  out-of-band authority.
- **B. Dedicated GitHub App + out-of-band governance runner (proposed).**
  Free-compatible and App-bound:

  ```text
  WasmAgent/governance-runner (separate repo; candidates cannot modify)
    ├─ workflow: sweeper (schedule) + repository_dispatch
    ├─ step 1: resolve OPEN PR head SHA of WasmAgent/.github via API
    │          (runner verifies PR state itself; candidate cooperation
    │           is not required and cannot be forged)
    ├─ step 2: checkout candidate SHA as DATA ONLY (persist-credentials:
    │          false; candidate content never touches secrets or authority)
    ├─ step 3: run validators from governance-runner's own tree
    │          (its HEAD is the trusted implementation; no pin needed
    │           because candidates cannot write this repo)
    └─ step 4: create check run on the candidate SHA AS THE APP
               POST /repos/WasmAgent/.github/check-runs
               name: governance-root-authority   (checks:write)

  branch protection (.github):
    required context: governance-root-authority, app_id = <governance App>
  ```

  A candidate that rewrites its own workflows still produces check runs
  owned by the GitHub Actions app — not the governance app — so the required
  context cannot be satisfied by `run: true`. A candidate that suppresses
  its own dispatch does not matter: the sweeper runs on schedule and reports
  every open PR head itself. App permissions: `checks:write`,
  `contents:read`; private key stored as a secret in governance-runner only.

- **C. Accept and document the residual risk** (single-maintainer reality:
  the only writer is the owner). Zero cost; the gap remains open for any
  future collaborator or compromised token.

## Decision

Proposed: **B**, in two phases —
1. shadow mode: App + runner live, check created but NOT required (observe);
2. enforcement: add `{context: "governance-root-authority", app_id}` to
   required checks; in-tree pinned-validator steps remain as fast advisory
   feedback.

Option A can later replace or complement B if the org upgrades.

## Consequences

- The judging authority (validators) moves fully out of the candidate tree.
- In-tree workflow tampering degrades UX (lost fast feedback) but can no
  longer produce a passing required check.
- One App + one runner repo become the reusable governance root for other
  WasmAgent repositories.
