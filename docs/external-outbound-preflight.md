# External outbound technical preflight

Gate for substantive external messages: package/version announcements,
install or run commands handed to external users, CI/conformance/provenance
status claims, independent-verification claims, rerun requests, and factual
corrections to previous external messages.

## Why

The existing ledgers (`claims/public-claims.yml`,
`evidence/external-validation.json`) constrain what we may *claim*. They do
not stop this failure sequence:

```text
see one log line → form a diagnosis → recommend posting a correction externally
```

That sequence occurred on 2026-09-17: an internal audit misread the 0.1.11
npm publish as having dropped the CLI `bin` mapping and recommended an
external erratum. Primary-source verification (release log, registry
metadata, clean-install replay of the published artifact) refuted the
diagnosis; no correction was needed. This gate makes that verification
mandatory and mechanical before anything reaches an external venue.

## Non-negotiables

```text
CI green            != external ready
source test pass    != published artifact verified
release success     != command replay
machine ready       != human approval
```

- The machine computes at most **TECHNICALLY_READY**.
- **EXTERNAL_READY** requires explicit human approval recorded in the record
  (`human_approval.approved = true` with a non-bot `reviewed_by`).
- No bot or workflow may auto-post external comments based only on
  TECHNICALLY_READY — even an approved record is posted manually, by a human.

## State machine

```text
DRAFT -> PRIMARY_SOURCE_VERIFIED -> ARTIFACT_VERIFIED
      -> USER_COMMAND_REPLAY_VERIFIED -> CLAIM_AUDIT_VERIFIED
      -> TECHNICALLY_READY -> HUMAN_APPROVED -> EXTERNAL_READY
```

The validator advances the technical half and stops there. Conflict between
primary sources means **HOLD** — never "pick an interpretation", never
"post the correction, investigate later".

## Correction threshold

An external correction requires **at least two primary sources**, of which
at least one is **final-state evidence** (registry metadata, the actual
published artifact, an exact clean-install command replay, or the final
merged/release state). A single warning line, a commit message, a PR body,
or an inference — human or AI — is never sufficient to trigger an external
correction.

## Mechanics

- Records: `evidence/external-outbound/*.json` (only substantive outbound
  messages need one; ordinary discussion does not).
- Contract: `schemas/external-outbound-preflight.schema.json`.
- Validator: `node scripts/verify-external-outbound-preflight.mjs [<record>]`
  — with no argument it verifies every record. Output is
  `TECHNICALLY_READY` (exit 0) or `HOLD: <CODE>` (exit 1), plus the
  `EXTERNAL_READY` determination.
- Structured, allowlisted checks only (`npm_metadata`, `npm_clean_install`,
  `npm_bin_exists`, `npm_exec`, `pypi_metadata`, `pypi_clean_install`,
  `github_release_run`, `github_pr_state`, `github_issue_comment_exists`,
  `claim_ref`). The record never carries shell for the validator to execute.
- `claim_refs` must resolve inside the existing ledgers; anything pointing
  outside them is `HOLD: CLAIM_CEILING_EXCEEDED`.
- Known contradictions must be recorded and resolved by a named passing
  check (`contradictions[].resolved_by`); unresolved contradictions are
  `HOLD: PRIMARY_SOURCE_CONFLICT`.
- Bot accounts (`github-actions[bot]`, `dependabot[bot]`, `renovate[bot]`,
  `claude-bot`) are never acceptable `reviewed_by` values.
- Hostile regressions live in `scripts/external-outbound-preflight.test.mjs`
  (`ER-01`–`ER-07`).

## Worked example

`evidence/external-outbound/APS92-aep-conformance-kit-0.1.11.json` records
the APS #92 conformance-kit enablement note retrospectively, including the
refuted bin-removal diagnosis as contradiction `C1` resolved by the
clean-install replay checks. Its `human_approval.approved` is honestly
`false` — it was posted before this gate existed.
