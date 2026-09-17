# External Validation

Generated framing for records in [`evidence/external-validation.json`](../evidence/external-validation.json)
(enforced by `scripts/validate-external-evidence.py`, EXT-01..07). The table
states the **claim ceiling** of each record — anything beyond it
(certification, endorsement, standardization) is unsupported wording and is
blocked from this repository by `scripts/validate-public-claims.py`.

| External venue | Evidence type | Target | Observed result | Scope | Limitations | State | Primary link |
|---|---|---|---|---|---|---|---|
| Agent-Authority-Conformance (LF Decentralized Trust lab) | Independent layered run | AEP `aep-certified-2026-09-13-03` component tuple | 28/28 semantic corpus targets matched; 9 DSSE fixtures exercised; JS/Rust agreement and cross-language positives reproduced | Exercised layers only | Not a certification; LAB-SEMANTIC layer is Mode B (author-produced); no Python native verifier exists | merged (2026-09-16) | [PR #94](https://github.com/Agent-Authority-Conformance/aps-conformance-suite/pull/94) |
| OWASP (www-project-mcp-top-10) | Upstream contribution | MCP08 / related controls | Open issue and open PR discussing control language with WasmAgent artifacts referenced as prior art | Public discussion only | Not testing, certification, or endorsement by OWASP | open | [Issue #44](https://github.com/OWASP/www-project-mcp-top-10/issues/44) |

PR #94 was merged on 2026-09-16 (final PR head `669edfa35b1bca5009a2ea0560bf96c37709a084`,
main rebase result `5717bfdd2b3a367d78f903cf6004a9ae0add5c72`). The semantic
28/28 layer in that run is lab-authored (Mode B), so it does not establish an
independent semantic verifier; the current certified target
`aep-certified-2026-09-16-01` was not tested by this run.

## Claim classes

`internal_supported` (default) → `externally_observed` →
`independently_reproduced` → `formally_certified`. Each step up requires
machine-checkable evidence in the ledger (`external_evidence_refs`), and
`formally_certified` additionally requires certifying body, certificate id,
certificate URL, scope and validity — none of which exist today.

**R-G rule of thumb:** organization affiliation (Linux Foundation lab, OWASP
project) describes *where evidence lives*, never *what our artifacts are
certified by*.
