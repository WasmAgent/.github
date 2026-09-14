#!/usr/bin/env bash
# Clone a WasmAgent repository at the exact SHA pinned in the org stack lock
# and assert HEAD == pin. Used by every Org Gate so no gate tests a moving
# default branch (N2-P1-03).
#
# Usage: checkout-pinned.sh <repo> <dest>
# Env:   GITHUB_TOKEN (optional; enables authenticated clones)
set -euo pipefail

repo="${1:?usage: checkout-pinned.sh <repo> <dest>}"
dest="${2:?usage: checkout-pinned.sh <repo> <dest>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sha="$(node "$here/stack-lock.mjs" --sha "$repo")"
if [ -z "$sha" ]; then
  echo "FAIL ${repo}: no pinned SHA in versions.lock.json" >&2
  exit 1
fi

if [ -n "${GITHUB_TOKEN:-}" ]; then
  url="https://x-access-token:${GITHUB_TOKEN}@github.com/WasmAgent/${repo}.git"
else
  url="https://github.com/WasmAgent/${repo}.git"
fi

rm -rf "$dest"
git clone --quiet "$url" "$dest"
git -C "$dest" checkout --quiet "$sha"

actual="$(git -C "$dest" rev-parse HEAD)"
if [ "$actual" != "$sha" ]; then
  echo "FAIL ${repo}: HEAD ${actual} != pinned ${sha}" >&2
  exit 1
fi
echo "OK ${repo} @ ${sha}"
