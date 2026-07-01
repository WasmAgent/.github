#!/usr/bin/env python3
"""Validate docs/project-index.json and check coherence with the org profile.

The project index is the machine-readable source of truth for the WasmAgent
project list. This validator enforces:

1. JSON is well-formed and matches the expected schema.
2. Controlled vocabularies (status, visibility, category) are respected.
3. Repository names are unique and each url matches the org + name.
4. Bidirectional coherence with profile/README.md:
   - every index repo flagged ``in_profile`` appears in the profile table;
   - every repo in the profile table is present in the index with
     ``in_profile: true``.

The coherence check is what prevents the profile project table from silently
omitting repositories (the failure mode described in WasmAgent/.github#53).

Exit code is 0 on success, 1 on any validation failure. Uses only the Python
standard library so it runs in any CI image with Python.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import date

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.path.join(REPO_ROOT, "docs", "project-index.json")
PROFILE_PATH = os.path.join(REPO_ROOT, "profile", "README.md")

REQUIRED_TOP = ("schema_version", "org", "last_reviewed", "repos")
REQUIRED_REPO = (
    "name",
    "category",
    "role",
    "status",
    "visibility",
    "in_profile",
    "summary",
    "url",
)
VALID_STATUS = {"shipped", "in_progress", "planned"}
VALID_VISIBILITY = {"public", "internal"}
URL_RE = re.compile(r"^https://github\.com/WasmAgent/(?P<name>[^)/\s]+)$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PROFILE_LINK_RE = re.compile(r"https://github\.com/WasmAgent/([^)/\s]+)")


class ValidationFailed(Exception):
    """Raised when validation encounters an error."""


def fail(msg: str) -> None:
    raise ValidationFailed(msg)


def load_index() -> dict:
    if not os.path.isfile(INDEX_PATH):
        fail(f"missing project index: {INDEX_PATH}")
    try:
        with open(INDEX_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        fail(f"project index is not valid JSON: {exc}")
    if not isinstance(data, dict):
        fail("project index top level must be a JSON object")
    return data


def validate_top_level(data: dict) -> None:
    for key in REQUIRED_TOP:
        if key not in data:
            fail(f"missing top-level field: {key!r}")
    if not isinstance(data["schema_version"], int):
        fail("schema_version must be an integer")
    if data["schema_version"] != 1:
        fail(f"unsupported schema_version {data['schema_version']!r}; expected 1")
    if data.get("org") != "WasmAgent":
        fail(f"unexpected org {data.get('org')!r}; expected 'WasmAgent'")
    last = data.get("last_reviewed")
    if not isinstance(last, str) or not DATE_RE.match(last):
        fail(f"last_reviewed must be YYYY-MM-DD, got {last!r}")
    try:
        date.fromisoformat(last)
    except ValueError:
        fail(f"last_reviewed is not a real calendar date: {last!r}")
    categories = data.get("categories", {})
    if not isinstance(categories, dict):
        fail("categories must be an object mapping category -> description")


def validate_repo(repo: dict, categories: dict, seen: set[str]) -> None:
    if not isinstance(repo, dict):
        fail("each repo entry must be a JSON object")
    for key in REQUIRED_REPO:
        if key not in repo:
            fail(f"repo entry missing required field: {key!r} (in {repo})")
    name = repo["name"]
    if not isinstance(name, str) or not name:
        fail(f"repo name must be a non-empty string (got {name!r})")
    if name in seen:
        fail(f"duplicate repo name in index: {name!r}")
    seen.add(name)
    if repo["category"] not in categories:
        fail(
            f"repo {name!r} has unknown category {repo['category']!r}; "
            f"expected one of {sorted(categories)}"
        )
    if repo["status"] not in VALID_STATUS:
        fail(
            f"repo {name!r} has invalid status {repo['status']!r}; "
            f"expected one of {sorted(VALID_STATUS)}"
        )
    if repo["visibility"] not in VALID_VISIBILITY:
        fail(
            f"repo {name!r} has invalid visibility {repo['visibility']!r}; "
            f"expected one of {sorted(VALID_VISIBILITY)}"
        )
    if not isinstance(repo["in_profile"], bool):
        fail(f"repo {name!r} in_profile must be boolean")
    for text_field in ("role", "summary"):
        if not isinstance(repo[text_field], str) or not repo[text_field].strip():
            fail(f"repo {name!r} {text_field} must be a non-empty string")
    url = repo["url"]
    match = URL_RE.match(url) if isinstance(url, str) else None
    if not match:
        fail(f"repo {name!r} url must be https://github.com/WasmAgent/<name>, got {url!r}")
    if match.group("name") != name:
        fail(
            f"repo {name!r} url slug {match.group('name')!r} does not match repo name"
        )


def profile_table_repos() -> list[str]:
    """Return repo slugs linked from the profile project table."""
    if not os.path.isfile(PROFILE_PATH):
        fail(f"missing profile README: {PROFILE_PATH}")
    with open(PROFILE_PATH, encoding="utf-8") as fh:
        text = fh.read()
    # Isolate the "## Projects" section up to the next H2 heading.
    parts = text.split("## Projects", 1)
    if len(parts) != 2:
        fail("profile README has no '## Projects' section")
    section = parts[1].split("\n## ", 1)[0]
    slugs: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        # Skip the header row and the alignment separator row.
        if "Repository" in stripped or re.match(r"^\|\s*:?-{2,}", stripped):
            continue
        match = PROFILE_LINK_RE.search(stripped)
        if match:
            slugs.append(match.group(1))
    return slugs


def check_coherence(index_repos: list[dict]) -> None:
    in_profile = sorted(r["name"] for r in index_repos if r["in_profile"])
    table = sorted(set(profile_table_repos()))
    if not table:
        fail("profile project table is empty; cannot verify coherence")

    missing_from_table = [n for n in in_profile if n not in table]
    missing_from_index = [n for n in table if n not in in_profile]
    if missing_from_table:
        fail(
            "repos marked in_profile but absent from profile/README.md table: "
            + ", ".join(missing_from_table)
        )
    if missing_from_index:
        fail(
            "repos in profile/README.md table but not in index with in_profile=true: "
            + ", ".join(missing_from_index)
        )


def main() -> int:
    try:
        data = load_index()
        validate_top_level(data)
        repos = data.get("repos")
        if not isinstance(repos, list) or not repos:
            fail("repos must be a non-empty list")
        seen: set[str] = set()
        for repo in repos:
            validate_repo(repo, data.get("categories", {}), seen)
        check_coherence(repos)
    except ValidationFailed as exc:
        print(f"project-index validation FAILED: {exc}", file=sys.stderr)
        return 1
    print(
        f"project-index OK: {len(repos)} repos, "
        f"{sum(1 for r in repos if r['in_profile'])} in profile, "
        f"coherent with profile/README.md"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
