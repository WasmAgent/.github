# ADR — Governance root authority: dedicated GitHub App runner

Status: accepted (Route B implemented — App-bound required check enforced on .github/main)
Date: 2026-09-19

## Context

The `.github` repository enforces claim/evidence governance through pinned
trusted validators (`scripts/validate-public-claims.py`,
`scripts/validate-external-evidence.py`) checked out at an immutable main
revision (`.validator` pins in `public-claims-ci.yml` and
`external-outbound-preflight.yml`), plus three generations of stale-pin
discriminator fixtures. Branch protection on `main` requires seven status
contexts — the six in-tree checks pinned to the GitHub Actions app (15368)
plus the App-bound governance root check (`enforce_admins=true`,
`strict=true`).

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
`contents:read`, `pull_requests:read`;
  `contents:read`; private key stored as a secret in governance-runner only.

- **C. Accept and document the residual risk** (single-maintainer reality:
  the only writer is the owner). Zero cost; the gap remains open for any
  future collaborator or compromised token.

## Decision

Decision: **B** — accepted and implemented, in two phases —
1. shadow mode: App + runner live, check created but NOT required (observe);
2. enforcement: add `{context: "governance-root-authority", app_id}` to
   required checks; in-tree pinned-validator steps remain as fast advisory
   feedback.

Option A can later replace or complement B if the org upgrades.

## Trust assumptions

The governance trust root is:

```text
WasmAgent organization owners
+ governance-runner admins (2026-09-19: telleroutlook, tellerlin, HainingYin)
+ the Governance App private key (single secret, in governance-runner)
```

These principals can modify the judge (validators, manifest, App wiring) and
are therefore part of the trust boundary by definition — this is recorded as
a trust assumption, not a vulnerability. Repository-level admin on
governance-runner for principals who are org owners cannot be reduced below
org-owner power; any reduction is an org-membership decision.

## Consequences

- 2026-09-19: Route B implemented — governance-runner scaffolded with validators vendored from f95d572bff1cfd514d7525fd382b40a520e4b668; App "WasmAgent Governance Root" (ID 4997462) installed on .github; shadow verified (positive PASS, negative HOLD); `governance-root-authority` required on .github/main bound to app_id 4997462, original six checks pinned to the GitHub Actions app (15368). The impersonation probe (same-named green check from the Actions app) does not satisfy the requirement.
- 2026-09-19: Root semantic coverage (P0b) increment — governance-runner now pins the candidate's entire judge-code surface (`.github/workflows/**` + `scripts/**`, 44 files @ 6edea17d60aa) in `authority-manifest.json`; tampered, deleted, or unmanifested judge code makes the root check HOLD. Judge-code changes follow the two-phase runbook: manifest PR lands in governance-runner first, then the candidate change.
- 2026-09-19: Authority epoch (P0d) — the required check context carries
  the full governance-RUNNER authority SHA (the actual judge), e.g.
  `governance-root-authority/87a88229…` (app_id 4997462): a runner change
  (validators, sweeper, manifest, workflow) changes the emitted context,
  and after the protection flip a green verdict from an older authority
  structurally cannot satisfy the current required context. The flip is
  the single manual step per upgrade (automatic transition would need an
  App with branch-protection Administration — deliberately not granted).
- 2026-09-19: Authority-update provenance (P0c) — the checked-in
  `authority-manifest.json` is itself a validated authority artifact: the
  sweeper validates its contract at startup (schema v2, required prefixes/
  exact_files, exact ⊆ files, paths within the surface, sha256 format,
  40-hex source_commit), then enforces the production SOURCE BINDING: it
  rebuilds the manifest from `source_commit`'s immutable git tree (the
  workflow clones the canonical .github object database) and requires an
  exact match — unverifiable or mismatched binding fails closed with
  visible HOLDs and can never be skipped; the runner self-test exercises
  the REAL checked-in manifest (16 assertions over 15 obligations); and
  the builder hashes the immutable GIT TREE of the reviewed commit
  (`git ls-tree`/`git show`) instead of a working tree, making the
  wrong-checkout manifest-poisoning near-miss a machine-impossible error
  class.
- 2026-09-19: Judge semantic-config closure (P0b2) — manifest v2 (schema_version 2) extends the authority surface to judge POLICY/CONFIG: `policies/**`, `schemas/**`, `golden-path/versions.lock.json`, `claims/claim-overreach-allowlist.json` (50 files @ da2f5e1649db). Real before/after on one head (PR-head of the P0b2 counterexample): under manifest v1 the root check PASSED a weakened `repository-ownership.yml` (and the candidate-owned ownership guard was green); under v2 the same head HOLDs naming the policy hash. Ledger: judge-code integrity (P0b1) and judge semantic-config closure (P0b2) both CLOSED; ordinary governed data (docs/, evidence/, profile/ and most of claims/) remains free to change — except explicitly manifested authority inputs such as claims/claim-overreach-allowlist.json.

- The judging authority (validators) moves fully out of the candidate tree.
- In-tree workflow tampering degrades UX (lost fast feedback) but can no
  longer produce a passing required check.
- One App + one runner repo become the reusable governance root for other
  WasmAgent repositories.
