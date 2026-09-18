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

- The machine computes at most **TECHNICALLY_READY**. It never outputs
  `EXTERNAL_READY` — at most it reports `HUMAN_APPROVAL_RECORDED` when the
  record carries an approval from an acceptable non-bot `reviewed_by`. A JSON
  field can never by itself prove that a human approved anything.
- The final **EXTERNAL_READY** designation is a human action outside this
  validator.
- No bot or workflow may auto-post external comments based only on
  TECHNICALLY_READY — even an approval-recorded post is posted manually, by
  a human.

## Trusted relevance

The required summary check does not trust relevance from the candidate tree:
the summary job recomputes it by loading the detector from **origin/main**
(`scripts/external-outbound/relevance.mjs`) and applying it to the objective
`git diff --name-only origin/main...HEAD` file list. Editing the detector or
its path list therefore requires merging a change that is itself evaluated
by the detector already on main. The candidate-side `changes` job only
decides whether the expensive inner job runs; the pinned evaluator consumes
the recomputed relevance, so a candidate `relevant=false` cannot skip a
gate the default branch says must run.

## Pin freshness rule

Whenever a security-semantics change lands in a validator that runtime
authorities execute from a PINNED revision, the SAME change sequence must
include a deliberate pin bump to the merged revision. A security rule that
exists on main but not in the pinned authority is not enforced — that gap
was real (the allowlist hard-disable sat on main while the required check
pinned a revision without it, and the stale revision demonstrably allowed a
self-declared certification bypass). The required claims workflow carries a
**stale-pin regression**: a hostile fixture (self-declared
formal_certification + allowlist entry) must FAIL under the pinned
validator; a stale pin turns this step red.

## Draft-command <-> replay binding

`outbound_commands[]` declares every executable command the draft shows to
users. The binding is three-way and mechanical:

```text
fenced line in outbound_message.content
  == outbound_commands[].text (comment-stripped, whitespace-collapsed)
  == the argv / install template of a DISTINCT, PASSING replay
```

An undeclared fenced line, a declaration bound to a failing replay, or a
declaration whose text does not correspond to what the replay executes are
all `HOLD: COMMAND_REPLAY_FAILED` (ER-07j/07k). A leading `npx` prefix in the
draft is equivalent to invoking the bin directly; unversioned install text
(`npm install pkg`) matches a `latest`-selector replay, which installs what
a user gets today and must land on the declared version.

## Ledger dependency

The validator reads `claims/public-claims.yml`,
`claims/claim-overreach-allowlist.json`, `evidence/external-validation.json`,
`media/posts.yml` and `releases/public-release-ledger.yml` as claim-bearing
surfaces (the firewall scans `claims/`, `docs/`, `profile/`, `evidence/`,
`media/`, `releases/`, `README.md` and `ORG-FOCUS-2026Q3.md`), and
`evidence/external-validation.json` as its claim authority, and the
public-claims firewall scans `claims/`, `docs/`, `profile/`, `evidence/`,
`README.md` and `ORG-FOCUS-2026Q3.md`. All of these surfaces are inside the
gate's relevance scope (both detectors), the ledger validators run inside
the gate's inner job, and — independently of this gate —
`Validate claims + overreach guard` is a branch-protection required context
on its own: the claim firewall is its own security property and must not
depend on the outbound gate for enforcement. Allowlist entries are
exceptions to the certification-wording ban and are **HARD-DISABLED**:
`formal_certification` records in the ledger are candidate DATA and cannot
prove their own authenticity, so any allowlist entry fails the firewall
regardless of how complete it looks. Enabling the first real certification
requires manual primary-source verification, a new trusted validator rule,
and a trusted pin bump. PyPI-side replay commands are additionally
constrained to the console scripts the target distribution itself declares
in its dist-info entry points (`python`, `pip` and other venv interpreters
are unreachable from candidate DATA).

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

Every record must carry `outbound_message.content` — the EXACT draft it
authorizes (optionally pinned by `sha256`). The validator scans that draft
against the `prohibited_claims` of every referenced evidence record; hitting
one is `HOLD: CLAIM_CEILING_EXCEEDED`. Artifact source refs MUST carry the
ecosystem prefix (`npm:` / `pypi:`) — a bare `pkg@ver` is not verifiable and
cannot be used to re-canonicalize an already-counted source. Replay ids must
be unique. An external correction requires **at least two MACHINE-VERIFIED
primary sources** — each carrying `verified_by` pointing at a DISTINCT, PASSING
structured check that **semantically verifies that exact source** (same
artifact ecosystem+name+version, same repository+release run, same
repository+PR — a passing check for a different artifact never counts), and
the two sources must also be **logically distinct claims**: duplicating one
source with a second check does not count (different evidence modalities of
the same artifact — e.g. registry metadata + clean-install replay — do) —
of which at least one is **final-state evidence**. Final-state status is DERIVED from the source kind
(registry metadata, published artifact, clean-install replay, final
release/PR state) plus a passing bound check; a `final_state: true` flag in
the record has no power. `human_inference` and `release_log` sources are
recorded honestly but are never machine-verifiable and never count toward
the threshold. A single warning line, a commit message, a PR body, or an
inference — human or AI — is never sufficient to trigger an external
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
- Replay execution isolation: the workflow splits **authority validation**
  (claim ledgers, pristine workspace, runs FIRST) from the **replay job**
  (installs and executes record-named packages), the replay job is chained
  after the authority job and never re-reads the ledgers afterwards, the
  validator snapshots the ledger files before replay and **fails closed if
  an executed bin mutates them** (no TOCTOU into the audited authority),
  install/run child processes get a secrets-scrubbed environment (no
  `*TOKEN` / `*SECRET` / `*PASSWORD` / `*KEY`), npm clean-installs run
  `--ignore-scripts` unless a package is on the reviewed
  `INSTALL_SCRIPTS_ALLOWLIST` (empty by default; a data record can never
  open it), every executed `npm_exec` command must call a bin the target
  package actually declares on the registry (`argv[0]` allowlist), PyPI
  clean-installs are wheel-only (`--only-binary=:all: --no-deps` — an
  sdist-only version HOLDs for manual review instead of executing its build
  backend), and all workflow checkouts run with `persist-credentials: false`.
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
