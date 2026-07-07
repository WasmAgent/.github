# .github

Org profile, public ledgers, and shared org docs for
[WasmAgent](https://github.com/WasmAgent). Visitors land at
[github.com/WasmAgent](https://github.com/WasmAgent), which renders
[`profile/README.md`](profile/README.md).

Public ledgers and shared docs live here so they are linkable from the org
profile and owned by the organization rather than any single product repo.
Generators and ops tooling live in
[`wasmagent-ops`](https://github.com/WasmAgent/wasmagent-ops).

## Contents

- [`profile/README.md`](profile/README.md) — organization profile
- [`docs/`](docs/) — roadmap, architecture, evaluation summary, RFC registry
- [`docs/project-index.json`](docs/project-index.json) — machine-readable project index (source of truth for the project list)
- [`claims/`](claims/), [`releases/`](releases/), [`media/`](media/) — public ledgers
- [`assets/`](assets/) — logo and product matrix

## Canonical paths

The assets and ledgers above are the org-wide source of truth. Product
repositories (`wasmagent`, `wasmagent-js`, and the rest) should link to these
centralized paths instead of keeping local copies, so media and ledger
references are never orphaned when content moves between repos. Prefer the
`.svg` product matrix hosted here over repo-local raster copies (e.g.
`product-matrix.webp`).

- Product matrix image (raw URL for embedding):
  `https://raw.githubusercontent.com/WasmAgent/.github/main/assets/product-matrix.svg`
- Project index (machine-readable repo, role, and status registry):
  `https://github.com/WasmAgent/.github/blob/main/docs/project-index.json`
- Claims registry:
  `https://github.com/WasmAgent/.github/blob/main/claims/public-claims.yml`
- Release ledger:
  `https://github.com/WasmAgent/.github/blob/main/releases/public-release-ledger.yml`
- Media & posts:
  `https://github.com/WasmAgent/.github/blob/main/media/posts.yml`
