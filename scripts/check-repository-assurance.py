#!/usr/bin/env python3
"""Org Gate O1 — repository assurance scanner.

Scans WasmAgent repositories against policies/repository-assurance.yml:

  ORG-SC-01  mutable action refs (uses: owner/action@v4)        -> FAIL
  ORG-SC-02  @latest tool installs in required CI               -> FAIL
  ORG-SC-03  allowlisted canary payload resolution              -> PASS (narrow)
  ORG-SC-04  missing workflow permissions                       -> FAIL
  plus:      missing lockfile, unfrozen npm install

Frozen-core repos are scanned ADVISORY by default (the core four are the
certified baseline; failures there do not gate this workflow). Pass
--include-frozen to treat them as gating.

Usage:
  check-repository-assurance.py --root DIR     # scan checkouts under DIR
  check-repository-assurance.py --remote ORG   # scan via GitHub API

Exit codes: 0 = all PASS, 1 = at least one FAIL, 2 = usage/config error.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

HEX40 = re.compile(r"^[0-9a-f]{40}$")
USES_RE = re.compile(r"^\s*(?:-\s+)?uses:\s*(\S+)\s*(#.*)?$", re.MULTILINE)
PERM_RE = re.compile(r"^\s*permissions\s*:", re.MULTILINE)


def policy_list(text: str, key: str) -> list[str]:
    m = re.search(rf"^\s*{re.escape(key)}:\s*\n((?:\s+-\s+\S+\n)+)", text, re.MULTILINE)
    if not m:
        return []
    return re.findall(r"-\s+(\S+)", m.group(1))


def policy_section(text: str, key: str) -> str:
    m = re.search(rf"^\s*{re.escape(key)}:\s*\n(.*?)(?=^\s*\w+:|\Z)", text, re.MULTILINE | re.DOTALL)
    return m.group(1) if m else ""


def load_policy(path: Path) -> dict:
    text = path.read_text()
    classes = {cls: policy_list(text, cls) for cls in ("frozen_core", "governance_production", "research_preview")}
    allow: dict[str, dict] = {}
    for repo, wf_text in re.findall(
        r"^\s{2}(\S+):\s*\n\s+reason:.*?\n\s+workflows:\s*\n((?:\s+-\s+\S+\n)+)",
        text,
        re.MULTILINE,
    ):
        allow[repo] = {"workflows": re.findall(r"-\s+(\S+)", wf_text)}
    lockfiles = dict(re.findall(r"^\s{2}(\S+):\s*(\S+)\s*$", policy_section(text, "required_lockfiles"), re.MULTILINE))
    forbidden = re.findall(r'-\s+"([^"]+)"', policy_section(text, "forbidden_patterns"))
    return {"classes": classes, "allow": allow, "lockfiles": lockfiles, "forbidden": forbidden}


def strip_comments(text: str) -> str:
    """Remove YAML/shell comments so policy language like '@latest' in an
    explanatory comment is not mistaken for usage."""
    return "\n".join(re.sub(r"(^|\s)#.*$", "", line) for line in text.splitlines())


class Scanner:
    def __init__(self, policy: dict, advisory_repos: set[str] | None = None):
        self.policy = policy
        self.advisory = advisory_repos or set()
        self.results: list[tuple[str, str, str, bool]] = []  # repo, check, verdict, advisory

    def record(self, repo: str, check: str, ok: bool, detail: str = ""):
        advisory = repo in self.advisory
        verdict = ("PASS" if ok else ("ADVISORY-FAIL" if advisory else "FAIL")) + (f" {detail}" if detail else "")
        self.results.append((repo, check, verdict, advisory))

    def scan_repo(self, repo: str, workflows: dict[str, str], files: set[str], file_contents: dict[str, str] | None = None):
        file_contents = file_contents or {}
        allowed_workflows = set(self.policy["allow"].get(repo, {}).get("workflows", []))

        pin_details: list[str] = []
        perm_details: list[str] = []
        latest_details: list[str] = []
        install_details: list[str] = []

        for name, raw in workflows.items():
            content = strip_comments(raw)
            for m in USES_RE.finditer(content):
                ref = m.group(1)
                if ref.startswith(("./", "docker://")):
                    continue
                sha = ref.split("@")[1] if "@" in ref else ""
                if not HEX40.match(sha):
                    pin_details.append(f"{name}: mutable action ref {ref}")
            if not PERM_RE.search(content):
                perm_details.append(name)
            for pattern in self.policy["forbidden"]:
                if pattern not in content:
                    continue
                if name in allowed_workflows:
                    continue  # ORG-SC-03: allowlisted canary payload
                latest_details.append(f"{name}: forbidden pattern {pattern!r}")
            if re.search(r"run:.*npm install(?!\s+--)", content, re.DOTALL):
                install_details.append(f"{name}: unfrozen 'npm install'")

        self.record(repo, "ORG-SC-01 immutable action refs", not pin_details, "; ".join(pin_details))
        self.record(repo, "ORG-SC-04 permissions declared", not perm_details, ", ".join(perm_details))
        self.record(repo, "ORG-SC-02 no @latest in required CI", not latest_details, "; ".join(latest_details))
        self.record(repo, "frozen install (no bare npm install)", not install_details, "; ".join(install_details))

        # Lockfile presence — only for ecosystems the repo actually uses.
        missing = []
        if "package.json" in files and not any(f in files for f in ("bun.lock", "bun.lockb", "package-lock.json")):
            missing.append("bun.lock/package-lock.json")
        if "pyproject.toml" in files and "uv.lock" not in files and not any(
            f.startswith("requirements") for f in files
        ):
            missing.append("uv.lock")
        if "go.mod" in files and "go.sum" not in files:
            # go.sum is only required when the module actually declares dependencies
            go_mod = file_contents.get("go.mod", "")
            if re.search(r"^\s*require\s", go_mod, re.MULTILINE) or re.search(r"^\s*require\s*\(", go_mod, re.MULTILINE):
                missing.append("go.sum")
        self.record(repo, "lockfile present", not missing, ", ".join(missing))

    def report(self) -> int:
        for repo, check, verdict, advisory in self.results:
            tag = verdict.split()[0]
            detail = verdict.split(" ", 1)[1] if " " in verdict else ""
            suffix = " (advisory)" if advisory and tag != "PASS" else ""
            print(f"[{tag:13}] {repo:24} {check}  {detail}{suffix}")
        gating_fails = sum(1 for r in self.results if r[2].startswith("FAIL"))
        advisory_fails = sum(1 for r in self.results if r[2].startswith("ADVISORY"))
        print(f"\n{len(self.results)} checks, {gating_fails} FAIL, {advisory_fails} advisory FAIL")
        return 1 if gating_fails else 0


def scan_local(root: Path, policy: dict, advisory: set[str], only_repo: str | None = None) -> Scanner:
    s = Scanner(policy, advisory)
    for cls, repos in policy["classes"].items():
        for repo in repos:
            if only_repo is not None and repo != only_repo:
                continue
            d = root / repo
            if not d.is_dir():
                s.record(repo, f"checkout present ({cls})", False, "missing under --root")
                continue
            wf = {}
            wdir = d / ".github" / "workflows"
            if wdir.is_dir():
                for f in sorted(wdir.glob("*.y*ml")):
                    wf[f.name] = f.read_text(errors="replace")
            files = {str(p.relative_to(d)) for p in d.rglob("*") if p.is_file() and "node_modules" not in p.parts}
            file_contents = {}
            for key in ("go.mod",):
                if key in files and (d / key).is_file():
                    file_contents[key] = (d / key).read_text(errors="replace")
            s.scan_repo(repo, wf, files, file_contents)
    return s


def scan_remote(org: str, policy: dict, token: str, advisory: set[str]) -> Scanner:
    s = Scanner(policy, advisory)
    hdr = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "User-Agent": "org-assurance-scanner"}

    def get(url: str):
        req = urllib.request.Request(url, headers=hdr)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)

    for cls, repos in policy["classes"].items():
        for repo in repos:
            try:
                tree = get(f"https://api.github.com/repos/{org}/{repo}/git/trees/HEAD?recursive=1")
                files = {t["path"] for t in tree.get("tree", []) if t["type"] == "blob"}
            except Exception as e:
                s.record(repo, f"api reachable ({cls})", False, str(e))
                continue
            wf = {}
            for path in sorted(files):
                if path.startswith(".github/workflows/") and path.endswith((".yml", ".yaml")):
                    blob = get(f"https://api.github.com/repos/{org}/{repo}/contents/{path}")
                    wf[Path(path).name] = base64.b64decode(blob["content"]).decode(errors="replace")
            file_contents = {}
            if "go.mod" in files:
                blob = get(f"https://api.github.com/repos/{org}/{repo}/contents/go.mod")
                file_contents["go.mod"] = base64.b64decode(blob["content"]).decode(errors="replace")
            s.scan_repo(repo, wf, files, file_contents)
    return s


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--policy", default=str(Path(__file__).resolve().parent.parent / "policies" / "repository-assurance.yml"))
    ap.add_argument("--root", help="directory containing checked-out repos")
    ap.add_argument("--remote", help="GitHub org to scan via API")
    ap.add_argument("--include-frozen", action="store_true", help="treat frozen-core failures as gating")
    ap.add_argument("--only-repo", help="scan only this repository (must appear in the policy)")
    args = ap.parse_args()

    policy = load_policy(Path(args.policy))
    advisory = set() if args.include_frozen else set(policy["classes"]["frozen_core"])

    if args.root:
        s = scan_local(Path(args.root), policy, advisory, args.only_repo)
    elif args.remote:
        token = os.environ.get("GITHUB_TOKEN", "")
        if not token:
            print("error: --remote requires GITHUB_TOKEN", file=sys.stderr)
            return 2
        s = scan_remote(args.remote, policy, token, advisory)
    else:
        ap.error("one of --root or --remote is required")
        return 2
    return s.report()


if __name__ == "__main__":
    sys.exit(main())
