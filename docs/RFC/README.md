# RFC Registry

Org-level design decisions that span multiple repositories or belong to no
single sub-project live here.  Each RFC is a Markdown file; the authoritative
status is tracked in the file header, not in a GitHub issue.

## How to propose an RFC

1. Open a discussion issue in this repository (`WasmAgent/.github`) with the
   label `rfc`.
2. Submit a PR that adds `docs/RFC/RFC-NNNN-<slug>.md` using the template
   below.  The PR is the review vehicle; merge = Accepted.
3. Cross-link the issue in the RFC header and add a pointer in this index.

## Status legend

| Status | Meaning |
|--------|---------|
| Draft | Work in progress, not yet open for broad review |
| Under Review | PR open, feedback welcome |
| Accepted | Merged; implementation may or may not be complete |
| Rejected | Declined; reason recorded in the file |
| Superseded | Replaced by a later RFC; link recorded in the file |

## Template

```markdown
# RFC-NNNN: Title

| Field | Value |
|-------|-------|
| Status | Draft |
| Author | @handle |
| Created | YYYY-MM-DD |
| Discussion | link-to-issue |
| Affects | repo-a, repo-b |

## Summary
## Motivation
## Design
## Open questions
```

## Index

| RFC | Title | Status |
|-----|-------|--------|
| [RFC-0001](RFC-0001-erp-agent.md) | erp-agent — bscode sibling for ERP/business-API agents | Draft |
| [RFC-0002](RFC-0002-cfep.md) | Causal Fabric Evidence Protocol (CFEP) — cross-island causal evidence above hardware telemetry | Draft |
