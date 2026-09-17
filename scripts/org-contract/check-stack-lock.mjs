#!/usr/bin/env node
// Org stack lock consistency check.
// 1. versions.lock.json core SHAs must equal the certified Gate C tuple.
// 2. Every pinned package version must resolve on the public registry.
// 3. Ownership (N2-P1-03/04): every repo consumed by any gate must be pinned
//    to a full 40-hex SHA. No gate may test a moving default branch.

import { execSync } from "node:child_process";
import { loadStackLock, ownershipProblems, requiredNonCoreRepos } from "./stack-lock.mjs";

const CERTIFIED = {
  "wasmagent-protocol": "16f9db2b80e57a31de17d6ac25378b0ea06c22ec",
  "wasmagent-js": "93b25ba466e08d32be836e4a5e1c3c4323afd103",
  "wasmagent-proxy": "4b4bde3b2e06eb62b7910cb3f379d75288cc4db1",
  "trace-pipeline": "8e7a9932bee8c5e4e9e4b58df2f1b09f61abd4d5",
};

const lock = loadStackLock();
const errors = [];

if (lock.format !== "wasmagent-org-stack-lock/v1") errors.push(`unexpected format ${lock.format}`);
if (lock.aep_certified_target !== "aep-certified-2026-09-16-01") {
  errors.push(`unexpected certified target ${lock.aep_certified_target}`);
}

for (const [repo, sha] of Object.entries(lock.core ?? {})) {
  if (CERTIFIED[repo] !== sha) {
    errors.push(`core ${repo}: ${sha} does not match certified tuple ${CERTIFIED[repo]}`);
  }
}

for (const [pkg, version] of Object.entries(lock.packages ?? {})) {
  try {
    const resolved = execSync(`npm view ${pkg}@${version} version`, { encoding: "utf8" }).trim();
    if (resolved !== version) errors.push(`package ${pkg}: registry resolved ${resolved}, lock says ${version}`);
  } catch {
    errors.push(`package ${pkg}@${version} does not resolve on registry`);
  }
}

// Ownership — every gated non-core repo must be pinned.
errors.push(...ownershipProblems(lock));
for (const repo of requiredNonCoreRepos()) {
  if (!(repo in (lock.non_core ?? {}))) errors.push(`missing required non_core pin: ${repo}`);
}

if (errors.length) {
  console.error(`org stack lock: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  FAIL ${e}`);
  process.exit(1);
}
console.log(`org stack lock: consistent (${requiredNonCoreRepos().length} non-core pins)`);
