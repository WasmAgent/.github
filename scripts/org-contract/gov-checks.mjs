#!/usr/bin/env node
// Trusted inspection of a candidate governance tree (N3-P1-04).
//
// The `.github` reusable compatibility gate must not merely print PASS for the
// governance repository: a PR can weaken the gate implementation and its tests
// together. These checks therefore run the *trusted* (pinned) validators from
// the org checkout against the candidate `.github` revision:
//
//   1. lock ownership validation over the candidate org stack lock
//   2. consumers/matrix validation over the candidate manifests
//   3. reusable-workflow / static-DAG validation over candidate workflows
//   4. presence of the gate entry points the reusable workflow depends on
//
// The candidate's own unit tests are executed separately as additive evidence.
// Returns a list of problems (empty = ok) so callers can aggregate.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { loadConsumers, loadExcluded } from "./consumers.mjs";
import { loadMatrix } from "./compat-matrix.mjs";
import { ownershipProblems, requiredNonCoreRepos } from "./stack-lock.mjs";
import { pinnedActionProblems } from "./check-release-provenance.mjs";

const require = createRequire(import.meta.url);
let parse = null;
try {
  ({ parse } = require("yaml"));
} catch {
  parse = null;
}

const SHA_PINNED_REUSABLE_RE = /^[^@\s]+@[0-9a-f]{40}$/;

// Wave C pre-merge targets that must remain declared in the candidate matrix.
// fresharena and wasmagent-train-replay are O1-only and intentionally absent.
const REQUIRED_PRE_MERGE_TARGETS = [
  "open-agent-audit",
  "agentbom",
  "bscode",
  "symkernel",
  "agent-golden-path",
  ".github",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function workflowFiles(candidateDir) {
  const dir = join(candidateDir, ".github", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => join(dir, f));
}

/** Validate the candidate org stack lock with the trusted ownership invariant. */
export function validateCandidateLock(candidateDir) {
  const problems = [];
  const lockPath = join(candidateDir, "golden-path", "versions.lock.json");
  if (!existsSync(lockPath)) {
    return ["candidate: missing golden-path/versions.lock.json"];
  }
  let lock;
  try {
    lock = readJson(lockPath);
  } catch (err) {
    return [`candidate lock: unparsable (${err instanceof Error ? err.message : String(err)})`];
  }
  for (const p of ownershipProblems(lock)) problems.push(`candidate lock: ${p}`);
  return problems;
}

/** Validate candidate consumers.json + compat-matrix.json with trusted loaders. */
export function validateCandidateManifests(candidateDir) {
  const problems = [];
  const consumersPath = join(candidateDir, "scripts", "org-contract", "consumers.json");
  const matrixPath = join(candidateDir, "scripts", "org-contract", "compat-matrix.json");
  if (!existsSync(consumersPath)) problems.push("candidate: missing consumers.json");
  if (!existsSync(matrixPath)) problems.push("candidate: missing compat-matrix.json");
  if (problems.length) return problems;

  let consumers;
  let matrix;
  let excluded;
  try {
    consumers = loadConsumers(consumersPath);
    excluded = loadExcluded(consumersPath);
    matrix = loadMatrix(matrixPath);
  } catch (err) {
    return [`candidate manifests: unparsable (${err instanceof Error ? err.message : String(err)})`];
  }

  const pinned = new Set(requiredNonCoreRepos());
  const consumerRepos = new Set(consumers.map((c) => c.repo));
  for (const c of consumers) {
    if (!pinned.has(c.repo)) problems.push(`candidate consumers: ${c.repo} is not a pinned non-core repo`);
    if (!c.install || !c.command) problems.push(`candidate consumers: ${c.repo} missing install/command`);
  }
  for (const e of excluded) {
    if (consumerRepos.has(e.repo)) problems.push(`candidate consumers: ${e.repo} is both consumer and excluded`);
    if (!e.reason) problems.push(`candidate consumers: ${e.repo} exclusion has no reason`);
  }

  const allowed = new Set([...pinned, ".github"]);
  for (const [repo, target] of Object.entries(matrix)) {
    if (!allowed.has(repo)) problems.push(`candidate matrix: ${repo} is not a gated repo`);
    if (!target.kind) problems.push(`candidate matrix: ${repo} has no kind`);
    if (target.kind === "consumer" && !consumerRepos.has(repo)) {
      problems.push(`candidate matrix: consumer target ${repo} has no consumers.json entry`);
    }
    if ((target.kind === "schemas" || target.kind === "e2e") && !target.command) {
      problems.push(`candidate matrix: ${repo} (${target.kind}) has no command`);
    }
  }
  // Every Wave C pre-merge target must remain declared so the gate cannot be
  // silently narrowed by the candidate.
  for (const repo of REQUIRED_PRE_MERGE_TARGETS) {
    if (!(repo in matrix)) problems.push(`candidate matrix: missing pre-merge target ${repo}`);
  }
  return problems;
}

/** Static-DAG + gate-entry-point validation over the candidate workflows. */
export function validateCandidateWorkflows(candidateDir) {
  const problems = [];

  const reusable = join(candidateDir, ".github", "workflows", "reusable-compat-check.yml");
  if (!existsSync(reusable)) {
    problems.push("candidate: missing .github/workflows/reusable-compat-check.yml");
  }
  if (!existsSync(join(candidateDir, "scripts", "org-contract", "compat-run.mjs"))) {
    problems.push("candidate: missing scripts/org-contract/compat-run.mjs");
  }

  if (parse === null) {
    problems.push("gov static-DAG: the 'yaml' parser is not installed (set NODE_PATH)");
    return problems;
  }

  for (const file of workflowFiles(candidateDir)) {
    let doc;
    try {
      doc = parse(readFileSync(file, "utf8"));
    } catch (err) {
      problems.push(`candidate workflow ${file}: does not parse as YAML (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    for (const p of pinnedActionProblems(doc)) problems.push(`candidate workflow ${file}: ${p}`);
  }

  if (existsSync(reusable)) {
    try {
      const doc = parse(readFileSync(reusable, "utf8"));
      if (!doc?.on || !("workflow_call" in (doc.on ?? {}))) {
        problems.push("candidate reusable-compat-check.yml: missing workflow_call trigger");
      }
    } catch (err) {
      problems.push(`candidate reusable-compat-check.yml: does not parse (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // The gate's self-checkout must resolve its identity from the reused job,
  // never from the caller-associated `github` context (N3-P1-01).
  if (existsSync(reusable)) {
    const text = readFileSync(reusable, "utf8");
    if (!/ref:\s*\$\{\{\s*job\.workflow_sha\s*\}\}/.test(text)) {
      problems.push("candidate reusable-compat-check.yml: self-checkout must use job.workflow_sha");
    }
    if (/ref:\s*\$\{\{\s*github\.job_workflow_sha\s*\}\}/.test(text)) {
      problems.push("candidate reusable-compat-check.yml: still uses the broken github.job_workflow_sha ref");
    }
  }

  return problems;
}

/** Run every trusted governance-candidate check. */
export function inspectGovernanceCandidate(candidateDir) {
  return [
    ...validateCandidateLock(candidateDir),
    ...validateCandidateManifests(candidateDir),
    ...validateCandidateWorkflows(candidateDir),
  ];
}

export { SHA_PINNED_REUSABLE_RE };
