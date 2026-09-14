#!/usr/bin/env node
// Org pre-merge compatibility runner — executed by the reusable workflow.
//
// Given a consumer repo name and a checked-out candidate revision, run the
// cross-repo compatibility gate the same way O2a/O2b do, but against the PR
// candidate SHA instead of the pinned main. This makes "local CI PASS,
// cross-repo compatibility FAIL" impossible to merge (N2-P1-06).
//
// Usage: compat-run.mjs --repo <name> --candidate <dir> --org <dir>
// Exit codes: 0 = compatible, 1 = incompatible, 2 = usage.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConsumers } from "./consumers.mjs";
import { loadMatrix } from "./compat-matrix.mjs";
import { loadStackLock, ownershipProblems } from "./stack-lock.mjs";
import { inspectGovernanceCandidate } from "./gov-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ORG_ROOT = resolve(HERE, "..", "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i++;
  }
  return out;
}

function run(command, cwd, env = {}) {
  execFileSync("bash", ["-c", command], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.repo || !args.candidate) {
    console.error("usage: compat-run.mjs --repo <name> --candidate <dir> [--org <dir>]");
    return 2;
  }
  const orgRoot = args.org ? resolve(args.org) : DEFAULT_ORG_ROOT;
  const candidate = resolve(args.candidate);

  const lock = loadStackLock(join(orgRoot, "golden-path", "versions.lock.json"));
  const matrix = loadMatrix(join(orgRoot, "scripts", "org-contract", "compat-matrix.json"));
  const consumers = loadConsumers(join(orgRoot, "scripts", "org-contract", "consumers.json"));

  const target = matrix[args.repo];
  if (!target) {
    console.error(`FAIL ${args.repo}: no compat target declared (fail closed)`);
    return 1;
  }

  console.log(`== org compatibility: ${args.repo} (kind=${target.kind}) @ ${candidate} ==`);

  // 1. Ownership: every gate-consumed repo must be pinned.
  const problems = ownershipProblems(lock);
  if (problems.length) {
    for (const p of problems) console.error(`FAIL ownership: ${p}`);
    return 1;
  }
  console.log("PASS ownership");

  // 2. Canonical fixture integrity against the pinned protocol package.
  const protocolVersion = lock.packages["@wasmagent/protocol"];
  if (protocolVersion) {
    const gateDir = "/tmp/compat-gate";
    mkdirSync(gateDir, { recursive: true });
    if (!existsSync(join(gateDir, "package.json"))) run("npm init -y", gateDir);
    run(`npm install --no-audit --no-fund "@wasmagent/protocol@${protocolVersion}" ajv@8 ajv-formats@3`, gateDir);
    run(`node "${join(orgRoot, "scripts", "org-contract", "validate-fixtures.mjs")}"`, gateDir);
    console.log("PASS canonical fixtures");
  }

  // 3. Repo-specific compatibility.
  if (target.kind === "consumer") {
    const entry = consumers.find((c) => c.repo === args.repo);
    if (!entry) {
      console.error(`FAIL ${args.repo}: matrix says consumer but no consumer entry exists`);
      return 1;
    }
    // Clean-checkout order (N3-P1-02): a cold GitHub checkout has no
    // node_modules, so install frozen first, assert resolved versions, then
    // build, then run the consumer's own tests.
    run(entry.install, candidate);
    for (const pkg of entry.packages ?? []) {
      const installed = readJson(join(candidate, "node_modules", pkg, "package.json")).version;
      const expected = lock.packages[pkg];
      if (installed !== expected) {
        console.error(`FAIL ${args.repo}: ${pkg} resolved ${installed}, lock pins ${expected}`);
        return 1;
      }
      console.log(`PASS ${args.repo}: ${pkg}@${installed}`);
    }
    if (entry.build) run(entry.build, candidate);
    run(entry.command, candidate);
    console.log(`PASS ${args.repo}: consumer entry point`);
  } else if (target.kind === "schemas") {
    run(target.command, candidate);
    console.log(`PASS ${args.repo}: schema drift command`);
  } else if (target.kind === "e2e") {
    if (target.install) run(target.install, candidate);
    run(target.command, candidate);
    console.log(`PASS ${args.repo}: exact-stack E2E`);
  } else if (target.kind === "gov") {
    // Inspect the candidate governance tree with the *trusted* validators
    // instead of trusting the candidate's own tests (N3-P1-04).
    const problems = inspectGovernanceCandidate(candidate);
    if (problems.length) {
      for (const p of problems) console.error(`FAIL ${args.repo}: ${p}`);
      return 1;
    }
    console.log(`PASS ${args.repo}: candidate governance tree inspected`);
  } else {
    console.error(`FAIL ${args.repo}: unknown compat kind ${target.kind}`);
    return 1;
  }

  console.log(`\nOrg compatibility PASS for ${args.repo} @ candidate`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
