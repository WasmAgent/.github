#!/usr/bin/env python3
"""Patrol cross-repo-blocker dedupe — reference lifecycle implementation
(PATROL-01..PATROL-04).

The patrol sweep auto-files "coordination:" issues when jobs in other repos
are blocked waiting for changes here. Two failure modes were observed
(issues #148/#149/#160/#161/#162 all tracking completed wasmagent-js#348):

  1. repeated scans re-file the SAME signal as new issues (no dedupe key)
  2. completed source work keeps generating signals (no stale-signal rule)

This module is the canonical dedupe key + lifecycle decision logic the sweep
must call BEFORE opening an issue. Pure functions; `--self-test` runs the
PATROL-01..04 acceptance cases.

Stable dedupe key (order-independent, whitespace-normalized):
  sha256(source_repo, source_issue_number, target_repo,
         sorted(expected_file_set), signal_type)

Lifecycle decision rules:
  PATROL-01  an OPEN record with the same key exists       -> UPDATE, not create
  PATROL-02  the source issue is closed                    -> CLOSE the
             coordination issue (stale signal)
  PATROL-03  a CLOSED record with the same key exists and the source issue is
             still closed                                  -> SUPPRESS (stale
             signals cannot resurrect completed work); a genuinely NEW signal
             must carry a different key (e.g. different expected_file_set)
  PATROL-04  covered by --self-test in CI
"""
import argparse
import hashlib
import json


def dedupe_key(signal: dict) -> str:
    """Stable key: sorted file set + normalized scalar fields (PATROL-01)."""
    payload = "|".join(
        [
            str(signal.get("source_repo", "")).strip().lower(),
            str(signal.get("source_issue_number", "")).strip(),
            str(signal.get("target_repo", "")).strip().lower(),
            ",".join(sorted({f.strip() for f in signal.get("expected_file_set", []) if str(f).strip()})),
            str(signal.get("signal_type", "")).strip().lower(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def decide(signal: dict, prior: dict | None) -> dict:
    """Decide the patrol action for `signal` given the prior record (or None).

    prior: {"key": str, "status": "open"|"closed"} or None
    Returns {"action": "create"|"update"|"suppress"|"close",
             "key": str, "reason": str}.
    """
    key = dedupe_key(signal)
    source_closed = str(signal.get("source_issue_state", "open")).lower() == "closed"
    blocker_gone = bool(signal.get("blocker_disappeared", False))

    if prior is None:
        if source_closed or blocker_gone:
            return {
                "action": "suppress",
                "key": key,
                "reason": "no prior record and the signal is already resolved (PATROL-03)",
            }
        return {"action": "create", "key": key, "reason": "first observation of this signal"}

    prior_open = prior.get("status") == "open"

    # PATROL-02 — source closure closes the coordination issue.
    if source_closed or blocker_gone:
        if prior_open:
            return {
                "action": "close",
                "key": key,
                "reason": "source issue closed / blocker disappeared (PATROL-02)",
            }
        return {"action": "suppress", "key": key, "reason": "already closed (PATROL-03)"}

    # Source still open.
    if prior_open:
        # PATROL-01 — same open signal: update the existing issue, do not
        # duplicate.
        return {"action": "update", "key": key, "reason": "open record exists (PATROL-01)"}

    # PATROL-03 — a closed record for a still-open source: the coordination
    # issue was resolved once already; a bare re-observation must not
    # resurrect it. A genuinely new blocker state has a different key.
    return {
        "action": "suppress",
        "key": key,
        "reason": "closed prior record for the same key; new evidence required to reopen (PATROL-03)",
    }


# ── PATROL-01..04 self-tests ─────────────────────────────────────────────────

def _signal(**overrides) -> dict:
    base = {
        "source_repo": "WasmAgent/wasmagent-js",
        "source_issue_number": 348,
        "target_repo": "WasmAgent/.github",
        "expected_file_set": [".github/workflows/quickstart-check.yml"],
        "signal_type": "verify_first",
        "source_issue_state": "open",
    }
    base.update(overrides)
    return base


def _self_test() -> int:
    failures = []

    def expect(name: str, got: dict, action: str) -> None:
        if got["action"] != action:
            failures.append(f"{name}: expected {action}, got {got['action']} ({got['reason']})")

    # PATROL-04 — tests live in CI, exercised here.
    prior_open = {"key": dedupe_key(_signal()), "status": "open"}
    prior_closed = {"key": dedupe_key(_signal()), "status": "closed"}

    # PATROL-01 — repeated scans create ONE coordination issue.
    expect("PATROL-01 repeated scan", decide(_signal(), prior_open), "update")
    expect("PATROL-01 first sighting", decide(_signal(), None), "create")

    # PATROL-02 — source closure closes the coordination issue.
    expect(
        "PATROL-02 source closed",
        decide(_signal(source_issue_state="closed"), prior_open),
        "close",
    )
    expect(
        "PATROL-02 blocker disappeared",
        decide(_signal(blocker_disappeared=True), prior_open),
        "close",
    )

    # PATROL-03 — stale signals cannot resurrect completed work.
    expect(
        "PATROL-03 closed record + closed source",
        decide(_signal(source_issue_state="closed"), prior_closed),
        "suppress",
    )
    expect(
        "PATROL-03 closed record + still-open source",
        decide(_signal(), prior_closed),
        "suppress",
    )

    # Dedupe key is order-independent for the file set and stable otherwise.
    k1 = dedupe_key(_signal(expected_file_set=["a.yml", "b.yml"]))
    k2 = dedupe_key(_signal(expected_file_set=["b.yml", "a.yml"]))
    if k1 != k2:
        failures.append("dedupe key must be file-set order independent")

    # A genuinely different signal (different expected file set) is a new key.
    if dedupe_key(_signal(expected_file_set=["other-file.yml"])) == dedupe_key(_signal()):
        failures.append("different expected_file_set must produce a different key")

    if failures:
        for f in failures:
            print(f"FAIL {f}")
        print(f"INVALID: {len(failures)} patrol-dedupe check(s) failed")
        return 1
    print("VALID: patrol dedupe lifecycle PATROL-01..04 hold")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="run PATROL-01..04 checks")
    parser.add_argument("--signal", help="signal JSON (for computing a dedupe key / decision)")
    parser.add_argument("--prior", help="prior record JSON (optional)")
    args = parser.parse_args()

    if args.self_test or (not args.signal and not args.prior):
        raise SystemExit(_self_test())
    signal = json.loads(args.signal)
    prior = json.loads(args.prior) if args.prior else None
    print(json.dumps(decide(signal, prior), indent=2))
