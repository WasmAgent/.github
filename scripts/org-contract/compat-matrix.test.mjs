import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMatrix } from "./compat-matrix.mjs";
import { loadConsumers } from "./consumers.mjs";
import { requiredNonCoreRepos } from "./stack-lock.mjs";

// Wave C pre-merge targets (plan §10). fresharena and wasmagent-train-replay
// are O1-only and intentionally not cross-repo pre-merge targets.
const REQUIRED_PRE_MERGE = [
  "open-agent-audit",
  "agentbom",
  "bscode",
  "symkernel",
  "agent-golden-path",
  ".github",
];

test("every Wave C pre-merge target is declared", () => {
  const matrix = loadMatrix();
  for (const repo of REQUIRED_PRE_MERGE) {
    assert.ok(matrix[repo], `no compat target for pre-merge repo ${repo}`);
    assert.ok(matrix[repo].kind, `${repo} target has no kind`);
  }
});

test("compat targets are pinned repos plus the governance repo", () => {
  const matrix = loadMatrix();
  const allowed = new Set([...requiredNonCoreRepos(), ".github"]);
  for (const repo of Object.keys(matrix)) {
    assert.ok(allowed.has(repo), `compat target ${repo} is not a gated repo`);
  }
});

test("consumer compat targets have matching consumer entries", () => {
  const matrix = loadMatrix();
  const consumerRepos = new Set(loadConsumers().map((c) => c.repo));
  for (const [repo, target] of Object.entries(matrix)) {
    if (target.kind === "consumer") {
      assert.ok(consumerRepos.has(repo), `consumer target ${repo} has no consumers.json entry`);
    }
  }
});

test("schemas/e2e targets declare a command", () => {
  const matrix = loadMatrix();
  for (const [repo, target] of Object.entries(matrix)) {
    if (target.kind === "schemas" || target.kind === "e2e") {
      assert.ok(target.command, `${repo} (${target.kind}) has no command`);
    }
  }
});
