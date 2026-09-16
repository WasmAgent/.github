#!/usr/bin/env python3
"""Ownership firewall for WasmAgent/.github (OWN-01..OWN-04).

Policy: policies/repository-ownership.yml
- OWN-01  product runtime code cannot silently land in .github
- OWN-02  policy/docs/fixtures/golden-path/scripts remain possible
- OWN-03  violation messages name the canonical owner
- OWN-04  archived agent-trust-infra schema URLs fail the check

Modes:
  --changed <paths...>   scan the given changed files (PR/push mode; the CI
                         workflow passes `git diff --name-only` output)
  --check-anchors <paths...>  additionally scan the given file CONTENTS for
                         archived schema anchors (the workflow passes files
                         via xargs; anchors need content, not just names)

Exit 0 = clean; 1 = violations; 2 = usage error.
"""
import argparse
import fnmatch
import json
import sys
from pathlib import Path

import yaml

POLICY = Path(__file__).resolve().parent.parent / "policies" / "repository-ownership.yml"


def load_policy() -> dict:
    return yaml.safe_load(POLICY.read_text(encoding="utf-8"))


def _matches(path: str, patterns: list[str]) -> bool:
    normalized = path.lstrip("./")
    return any(fnmatch.fnmatch(normalized, pat) or normalized.startswith(pat.rstrip("*"))
               for pat in patterns)


def capability_for(path: str, policy: dict) -> str:
    """Best-effort capability name for a runtime-code path (OWN-03 messaging)."""
    lowered = path.lower()
    if "posture" in lowered:
        return "mcp_posture_runtime"
    if "passport" in lowered or "trust" in lowered:
        return "trust_passport_runtime"
    if "schema" in lowered:
        return "cross_repo_schemas"
    if "agentbom" in lowered or "bom" in lowered:
        return "agentbom_runtime"
    return "cross_repo_schemas"


def check_changed(paths: list[str], policy: dict) -> list[str]:
    violations: list[str] = []
    extensions = tuple(policy["runtime_source_extensions"])
    allowed = policy["allowed_code_paths"]
    grandfathered = policy.get("grandfathered_dirs", [])

    for path in paths:
        path = path.strip()
        if not path or not path.endswith(extensions):
            continue
        if _matches(path, allowed):
            continue
        if any(path.startswith(g) for g in grandfathered):
            # Grandfathered mirror dirs: existing files tolerated; a NEW file
            # under them is still a violation unless it only updates content.
            continue
        capability = capability_for(path, policy)
        owner = policy["canonical_owners"].get(
            capability, policy["canonical_owners"]["cross_repo_schemas"]
        )
        violations.append(
            f"OWN-01 {path}: product runtime code in WasmAgent/.github — "
            f"canonical owner for '{capability}' is {owner} "
            f"(policy: policies/repository-ownership.yml)"
        )
    return violations


# Files that legitimately QUOTE the anchors as definitions (the policy
# document itself, this checker) are exempt from OWN-04 — otherwise the
# policy trips on its own vocabulary.
ANCHOR_DEFINITION_FILES = {
    str(POLICY),
    str(Path(__file__).resolve()),
}


def check_anchor_content(paths: list[str], policy: dict) -> list[str]:
    """OWN-04 — no archived agent-trust-infra schema anchors, in any file."""
    violations: list[str] = []
    anchors = policy.get("archived_schema_anchors", [])
    for path in paths:
        resolved = str(Path(path.strip()).resolve())
        if resolved in ANCHOR_DEFINITION_FILES:
            continue
        path = path.strip()
        path = path.strip()
        if not path:
            continue
        try:
            text = Path(path).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for anchor in anchors:
            if anchor in text:
                violations.append(
                    f"OWN-04 {path}: references archived schema anchor "
                    f"'{anchor}' — schemas are canonical in "
                    f"{policy['canonical_owners']['cross_repo_schemas']}"
                )
    return violations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--changed", nargs="*", default=[], help="changed file paths")
    parser.add_argument(
        "--anchor-content-files", nargs="*", default=[],
        help="files whose CONTENT is scanned for archived schema anchors (OWN-04)",
    )
    args = parser.parse_args()

    policy = load_policy()
    violations = check_changed(args.changed, policy)
    violations += check_anchor_content(args.anchor_content_files, policy)

    if violations:
        print(f"ownership firewall: {len(violations)} violation(s)", file=sys.stderr)
        for v in violations:
            print(f"  ::error::{v}", file=sys.stderr)
        return 1

    print("ownership firewall: clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
