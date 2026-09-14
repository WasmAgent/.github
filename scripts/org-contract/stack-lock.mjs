#!/usr/bin/env node
// Shared helpers for the org stack lock and gate ownership.
//
// The exact non-core tuple lives in golden-path/versions.lock.json. Every gate
// must resolve the revision it tests from that lock, checkout the exact SHA,
// and assert HEAD. No stack attestation gate may use an implicit `main`.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const LOCK_PATH = "golden-path/versions.lock.json";
export const HEX40 = /^[0-9a-f]{40}$/;

/**
 * Repos consumed by each gate. `.github` is the gate owner itself. A gate may
 * not report a PASS verdict for a repo that is not pinned in the lock
 * (N2-P1-04 ownership rule).
 */
export const GATED_REPOS = {
  ".github": ["O1"],
  "open-agent-audit": ["O1", "O2", "O4"],
  bscode: ["O1", "O2", "O4"],
  "agent-golden-path": ["O1", "O3"],
  agentbom: ["O1", "O2", "O4"],
  fresharena: ["O1"],
  symkernel: ["O1", "O2"],
  "wasmagent-train-replay": ["O1"],
};

/** Repo -> committed lockfile whose bytes are hashed for the attestation. */
export const LOCKFILE_PATHS = {
  "open-agent-audit": "bun.lock",
  bscode: "bun.lock",
  "agent-golden-path": "bun.lock",
  agentbom: "bun.lock",
  fresharena: "bun.lock",
  symkernel: "schemas/protocol.lock.json",
  "wasmagent-train-replay": "uv.lock",
};

export function loadStackLock(path = LOCK_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function nonCoreShas(lock) {
  return lock.non_core ?? {};
}

/** Non-core repositories that any gate consumes and that must therefore be pinned. */
export function requiredNonCoreRepos() {
  return Object.keys(GATED_REPOS)
    .filter((repo) => repo !== ".github")
    .sort();
}

export function assertFullSha(repo, sha) {
  if (typeof sha !== "string" || !HEX40.test(sha)) {
    throw new Error(`non_core ${repo}: expected a full 40-hex SHA, got ${JSON.stringify(sha)}`);
  }
  return sha;
}

/**
 * Ownership invariant: every gate-consumed repo is pinned to a full SHA, and
 * no extra non_core entry is malformed. Returns a list of problems (empty =
 * ok) so callers can aggregate.
 */
export function ownershipProblems(lock) {
  const problems = [];
  const shas = nonCoreShas(lock);
  for (const repo of requiredNonCoreRepos()) {
    if (!(repo in shas)) {
      problems.push(`gated repo ${repo} is not pinned in versions.lock.json non_core`);
    }
  }
  for (const [repo, sha] of Object.entries(shas)) {
    try {
      assertFullSha(repo, sha);
    } catch (err) {
      problems.push(err.message);
    }
  }
  return problems;
}

/** Gates that consume the given repo. */
export function gatesForRepo(repo) {
  return GATED_REPOS[repo] ?? [];
}

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(path) {
  return sha256Hex(readFileSync(path));
}

function main(argv) {
  const [flag, value] = argv;
  try {
    if (flag === "--sha") {
      const lock = loadStackLock();
      const sha = nonCoreShas(lock)[value];
      if (!sha) throw new Error(`no non_core pin for ${value}`);
      assertFullSha(value, sha);
      process.stdout.write(sha);
      return 0;
    }
    if (flag === "--repos") {
      process.stdout.write(`${requiredNonCoreRepos().join("\n")}\n`);
      return 0;
    }
    if (flag === "--check") {
      const problems = ownershipProblems(loadStackLock());
      if (problems.length) {
        for (const p of problems) console.error(`FAIL ${p}`);
        return 1;
      }
      console.log("stack lock ownership: ok");
      return 0;
    }
    console.error("usage: stack-lock.mjs --sha <repo> | --repos | --check");
    return 2;
  } catch (err) {
    console.error(`stack-lock: ${err.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
