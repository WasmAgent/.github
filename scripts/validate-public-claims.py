#!/usr/bin/env python3
"""Validate claims/public-claims.yml and guard against claim overreach.

1.  Claims schema: schema_version 1, unique ids, known claim_class/status.
2.  Class/ref coherence: externally_observed, independently_reproduced and
    formally_certified require `external_evidence_refs` pointing at existing
    records in evidence/external-validation.json whose evidence_type matches
    the class; internal_supported forbids external refs.
    - externally_observed     <- any external evidence record
    - independently_reproduced <- evidence_type independent_layered_run /
                                  independent_native_run
    - formally_certified      <- evidence_type formal_certification
3.  Overreach wording guard: forbidden endorsement/certification phrases are
    rejected in claims/, docs/, profile/, evidence/ and README/ORG files of
    this repository unless allowlisted in claims/claim-overreach-allowlist.json
    (each allowlist entry must carry approved_evidence — an empty
    justification is itself a failure).

Exit 0 on success, 1 on any failure. Requires PyYAML (installed in CI).
"""

from __future__ import annotations

import json
import os
import sys

import yaml

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLAIMS_PATH = os.path.join(REPO_ROOT, "claims", "public-claims.yml")
EVIDENCE_PATH = os.path.join(REPO_ROOT, "evidence", "external-validation.json")
ALLOWLIST_PATH = os.path.join(REPO_ROOT, "claims", "claim-overreach-allowlist.json")
SCAN_DIRS = ("claims", "docs", "profile", "evidence")
SCAN_FILES = ("README.md", "ORG-FOCUS-2026Q3.md")
SCAN_SUFFIXES = (".md", ".yml", ".yaml", ".json")

CLASSES = {"internal_supported", "externally_observed", "independently_reproduced", "formally_certified"}
EXTERNAL_CLASSES = {"externally_observed", "independently_reproduced", "formally_certified"}
CLASS_TO_EVIDENCE = {
    "externally_observed": None,  # any external record
    "independently_reproduced": {"independent_layered_run", "independent_native_run"},
    "formally_certified": {"formal_certification"},
}

FORBIDDEN_PATTERNS = [
    r"certified\s+by\s+(the\s+)?linux\s+foundation",
    r"linux\s+foundation[-\s]certified",
    r"owasp[-\s]certified",
    r"owasp[-\s]endorsed",
    r"industry[-\s]standard\s+(certified|compliant|validated|endorsed)",
]


def load_json(path: str):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def iter_repo_files():
    for directory in SCAN_DIRS:
        base = os.path.join(REPO_ROOT, directory)
        if not os.path.isdir(base):
            continue
        for root, _dirs, files in os.walk(base):
            for name in files:
                if name.endswith(SCAN_SUFFIXES):
                    yield os.path.join(root, name)
    for name in SCAN_FILES:
        path = os.path.join(REPO_ROOT, name)
        if os.path.isfile(path):
            yield path


def main() -> int:
    failures: list[str] = []
    try:
        registry = yaml.safe_load(open(CLAIMS_PATH, encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 - report and fail closed
        print(f"claims: cannot parse {CLAIMS_PATH}: {error}")
        return 1

    if registry.get("schema_version") != 1:
        failures.append("claims: schema_version must be 1")
    claims = registry.get("claims") or []
    if not claims:
        failures.append("claims: claims array must not be empty")

    evidence_ids: dict[str, dict] = {}
    if os.path.isfile(EVIDENCE_PATH):
        for record in load_json(EVIDENCE_PATH).get("records", []):
            evidence_ids[record.get("id")] = record

    seen: set[str] = set()
    for claim in claims:
        cid = str(claim.get("id", "<unknown>"))
        if cid in seen:
            failures.append(f"{cid}: duplicate claim id")
        seen.add(cid)

        claim_class = claim.get("claim_class", "internal_supported")
        if claim_class not in CLASSES:
            failures.append(f"{cid}: unknown claim_class '{claim_class}'")
        refs = claim.get("external_evidence_refs") or []

        if claim_class == "internal_supported" and refs:
            failures.append(f"{cid}: internal_supported must not carry external_evidence_refs")
        if claim_class in EXTERNAL_CLASSES and not refs:
            failures.append(f"{cid}: claim_class '{claim_class}' requires external_evidence_refs")

        for ref in refs:
            record = evidence_ids.get(ref)
            if record is None:
                failures.append(f"{cid}: external_evidence_refs entry '{ref}' not found in the ledger")
                continue
            allowed = CLASS_TO_EVIDENCE.get(claim_class)
            if allowed is not None and record.get("evidence_type") not in allowed:
                failures.append(
                    f"{cid}: evidence '{ref}' has evidence_type "
                    f"'{record.get('evidence_type')}' which cannot support claim_class '{claim_class}'"
                )
            if record.get("state") not in ("merged", None) and claim_class in EXTERNAL_CLASSES:
                # unlanded evidence may support externally_observed framing only
                failures.append(
                    f"{cid}: evidence '{ref}' is state '{record.get('state')}' — unlanded "
                    "evidence cannot support externally_observed/independently_reproduced/"
                    "formally_certified claims"
                )

    # --- overreach wording guard ---
    allowlist_entries = load_json(ALLOWLIST_PATH).get("allowlist", []) if os.path.isfile(ALLOWLIST_PATH) else []
    for entry in allowlist_entries:
        if not entry.get("approved_evidence"):
            failures.append(
                f"allowlist: entry for '{entry.get('phrase')}' in {entry.get('file')} "
                "lacks approved_evidence — an allowlist entry without certification-grade "
                "evidence is itself overreach"
            )

    allowed_hits = {(e.get("file"), e.get("phrase", "").lower()) for e in allowlist_entries}
    import re

    patterns = [re.compile(pattern, re.IGNORECASE) for pattern in FORBIDDEN_PATTERNS]
    for path in iter_repo_files():
        rel = os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")
        try:
            text = open(path, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError):
            continue
        for pattern in patterns:
            for match in pattern.finditer(text):
                phrase = match.group(0).lower()
                if (rel, phrase) in allowed_hits or any(
                    file_part == rel and phrase_part in phrase for file_part, phrase_part in allowed_hits
                ):
                    print(f"ALLOWED (allowlisted): {rel}: '{match.group(0)}'")
                    continue
                failures.append(
                    f"{rel}: overreach phrase '{match.group(0)}' — certification/endorsement "
                    "wording requires an allowlist entry with approved_evidence"
                )

    if failures:
        for failure in failures:
            print(f"FAIL {failure}")
        print(f"\npublic-claims validation: {len(failures)} failure(s)")
        return 1

    print(f"public-claims validation: OK ({len(claims)} claim(s), {len(evidence_ids)} evidence record(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
