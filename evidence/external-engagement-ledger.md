# External Engagement Ledger (org-level)

**Version:** 2026-10-09
**Scope:** one row per repository: what it is solving, who owns it, whether
external threads exist, and the next action. Answers the org completion
criterion "the ledger can answer, per repo: what is being solved, who owns it,
is external engagement active".

Companion registries (do not duplicate them here):

- Evidence records about external parties: [`external-validation.json`](./external-validation.json)
  (machine-readable, EXT-* ids, enforced by EXT-01..07 validators)
- Org-made public claims: [`../claims/public-claims.yml`](../claims/public-claims.yml)
  (claim classes, overreach guard)
- Per-thread followup actions for the IF-07c/AEP cycle:
  `if07c-independent-reproduction/FOLLOWUP-LEDGER-2026-10-09.md` (working area)

## Standing engagement rules (org-level, binding)

**May do proactively**

- Provide AEP experience and boundary statements on spec issues in our own repos.
- Provide AEP versions, fixtures, hashes and limitation statements to independent
  verification projects that ask.
- Provide readers/reproducible results AEP runs itself.
- Contribute generic test tooling that carries no third-party provenance.

**Confirm with the maintainer first**

- Submitting fixtures that embed another author's run time, signature or
  attestation.
- Modifying an external repo's verifier core logic.
- Defining "the final standard" on behalf of an external project.
- Describing exploratory benchmarks as AEP conformance.
- Any external security endorsement in AEP's name.

**Never**

- Reuse another party's evaluation time as an AEP self-run.
- Merge AEP, AgentBOM, proxy and governance handoff into one indistinguishable claim.
- Claim "third-party verified" without independent provenance.
- Grow the AEP claim ceiling because an external issue became active.

## Frozen evidence boundary — AEP / APS (2026-10-09)

This is the frozen reference tuple. Any future claim must be measurable
against it; changing any element requires a new dated section here.

| Element | Frozen value |
|---|---|
| Protocol core | `@wasmagent/core` 3.10.0 (npm latest; contains the #505 dispatch-time re-authorization fix, PR wasmagent-js#507) |
| Companion stack | `@wasmagent/mcp-firewall` 2.3.0, `@wasmagent/mcp-gateway` 0.2.0 |
| Public reproduction pack | `if07c-reproduction` v1.4.2 — 25 executable cases; S1–S4 scheduler boundary set; S4 is the provenance-deny regression guard for the #505 fix |
| Independent external record | aps-conformance-suite PR #94 (merged 2026-09-16T06:38:17Z), recorded as EXT-AEP-0001; LAB-SEMANTIC is Mode B / author-produced (recorded limitation) |
| Re-verification | 2026-10-09: pack v1.4.2 re-run on published npm artifacts — 25/25 green, S4 flips measured-leak → denied by taint policy (label + identity rules, zero executions) |
| Claim ceiling | Unchanged: no adaptive-completeness, no default-on safety, no global cross-process taint tracking, no formal certification |

**Role separation (maintained):** AEP (`wasmagent-protocol`) is the spec
provider; the APS conformance suite (Agent-Authority-Conformance, LF Decentralized
Trust lab) is the independent verifier. Spec-provider and verifier duties stay
separate in docs, issues and release packages. AEP does not submit vectors on
behalf of other authors and does not count their runs as its own.

**Open item flagged at freeze time:** wasmagent-js #525 (test baselines:
kernel-wasmtime 46/47 pre-existing + AgentGroup parallelism timing flake) is
open and tracked; it does not alter any claim above.

## Engagement matrix (per repository)

| Repository | Owning role | External threads | State (2026-10-09) | Next action |
|---|---|---|---|---|
| `wasmagent-protocol` | Protocol reviewer | APS #92 (+ merged PR #94) — archived update posted 2026-10-09; CycloneDX specification #1015 — delta comment posted 2026-10-09; OWASP MCP-top-10 #44 — observe only; agent-governance-vocabulary #177 — observe only; agent-evidence-atlas #49 — invited boundary-fresh vector PR, **pending maintainer confirmation** | Active, boundaries held | Week 2: supply the AEP side of the AgentBOM ↔ CycloneDX mapping; keep #94 as the standalone layered verification record; no new threads |
| `wasmagent-js` | Release maintainer | None external (org-owned). Internal security cycle closed: #503 kept as contract observation (pack S3); #505 fixed via PR #507 (dispatch-time re-authorization), shipped core@3.10.0, acceptance 1–3 all implemented and independently re-verified 2026-10-09 | P0 resolved; risk grading: the 3.9.0 same-batch `$ref` object-sink path was a **real, measured leak** (labeled secret entered a declared `network_send` sink with zero policy events); fixed and regression-guarded at 3.10.0 | Only #525 (test baselines) remains open — hygiene, not security; no external action |
| `agentbom` | Release maintainer | CycloneDX WG discussion channel (v2.1 behavior-capability topic) — participation via existing Slack/Issue only, no new working-group membership | Mapping not yet written | Week 2: write the one-page AgentBOM ↔ CycloneDX mapping (component / capability-tool / observed action / AEP evidence record / verification-provenance), mark which relations are provable vs externally supplied; inventory schema stability, CLI validator, release and cross-language consumption; register the `claude-bot-go` cross-repo dependency signal |
| `agent-golden-path` | Maintainer | Issue #13 (open since 2026-09-17): where external governance evidence fits around AEP signed evidence | Awaiting the boundary write-up | Week 2: answer #13's four boundary questions (portable trust object? what offline verification proves? should external decisions be signed separately? how do decisions bind to downstream actions?); draft the minimal handoff schema (bundle hash, decision-maker identity, scope, target action, time+expiry) without touching the AEP core schema |
| `wasmagent-proxy` | Runtime reviewer | None | Header-leakage milestone not yet audited | Week 3: minimal implementation review of the MCP header-leakage milestone; decide how header risk enters AEP evidence rather than staying a transient HTTP header |
| `trace-pipeline` | Maintainer | None | Parent/child attribution sources not yet written down | Week 3: document sources of parent/child trace, agent identity, action linkage and verifier result; keep trace merge separate from training credit attribution; add negative fixtures (missing parent, duplicate trace id, cross-process replay) |
| `wasmagent-train-replay` | Maintainer | None | P2 — waiting on trace schema stability | Read-only inventory only; no new work until trace-pipeline schema settles |
| `governance-runner` | Maintainer | None | P2 — must align with the Golden Path handoff design | Read-only until the #13 handoff schema draft exists |
| `if07c-reproduction` | Maintainer | Receives independent-verifier interest; v1.4.2 published, boundary-fresh contribution to agent-evidence-atlas #49 **pending maintainer confirmation** | Current and re-verified 2026-10-09 | Pin/flip cases as core releases land; no unsolicited external PRs |
| `symkernel` | Maintainer | None | P2 — basic math capability for AEP/trace; scope frozen | Read-only inventory this cycle; no research expansion |
| `bscode` | Maintainer | None | Org CI/scripts/quality gates only | Maintain only; changes that affect all repos go through this repo |
| `.github` (this repo) | Maintainer + Security reviewer | None | Hosts this ledger, `external-validation.json`, `public-claims.yml` | Keep the three registries in sync on any external action |

## Pending external confirmations

| Item | Waiting on | Trigger to execute |
|---|---|---|
| boundary-fresh seventh vector PR to agent-evidence-atlas (#49) | Maintainer (Teller) sign-off for an external-repo contribution | Explicit approval; the four spec points are already confirmed by the maintainer side of that repo, and the artifact would be built with their signing tooling |
| CycloneDX v2.1 WG participation | No action owed | Attend per WG calendar if/when useful; no obligation created by the #1015 comment |
| APS #92 | Observe | Re-evaluate only if the thread moves |

## Change log

- **2026-10-09** — Ledger created. AEP/APS evidence boundary frozen (core
  3.10.0 / pack v1.4.2 / PR #94 external record). P0 (#503/#505) closed out:
  #503 remains the contract observation; #505 fixed (PR #507) and independently
  re-verified on published artifacts (25/25, S4 denial). CycloneDX #1015 and
  APS #92 increment comments posted the same day with claim ceilings intact.
