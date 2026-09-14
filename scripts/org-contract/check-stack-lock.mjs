#!/usr/bin/env node
// Org stack lock consistency check.
// 1. versions.lock.json core SHAs must equal the certified Gate C tuple.
// 2. Every pinned package version must resolve on the public registry.
// 3. If non_core entries exist, they must be full 40-hex SHAs.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const CERTIFIED = {
  "wasmagent-protocol": "35320c567ba02ae30ba441f488952954dd66a4cc",
  "wasmagent-js": "bb71077cbd13051c05e17195d11d16efd0d1c572",
  "wasmagent-proxy": "4b4bde3b2e06eb62b7910cb3f379d75288cc4db1",
  "trace-pipeline": "5820bf811302a1e202b762792cac6ef44e833ad6",
};
const HEX40 = /^[0-9a-f]{40}$/;

const lock = JSON.parse(readFileSync("golden-path/versions.lock.json", "utf8"));
let fail = 0;
const errors = [];

if (lock.format !== "wasmagent-org-stack-lock/v1") errors.push(`unexpected format ${lock.format}`);
if (lock.aep_certified_target !== "aep-certified-2026-09-13-03") errors.push(`unexpected certified target ${lock.aep_certified_target}`);

for (const [repo, sha] of Object.entries(lock.core ?? {})) {
  if (CERTIFIED[repo] !== sha) errors.push(`core ${repo}: ${sha} does not match certified tuple ${CERTIFIED[repo]}`);
}

for (const [pkg, version] of Object.entries(lock.packages ?? {})) {
  try {
    const resolved = execSync(`npm view ${pkg}@${version} version`, { encoding: "utf8" }).trim();
    if (resolved !== version) errors.push(`package ${pkg}: registry resolved ${resolved}, lock says ${version}`);
  } catch (e) {
    errors.push(`package ${pkg}@${version} does not resolve on registry`);
  }
}

for (const [repo, sha] of Object.entries(lock.non_core ?? {})) {
  if (!HEX40.test(sha)) errors.push(`non_core ${repo}: not a full 40-hex SHA`);
}

if (errors.length) {
  console.error(`org stack lock: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  FAIL ${e}`);
  process.exit(1);
}
console.log("org stack lock: consistent");
