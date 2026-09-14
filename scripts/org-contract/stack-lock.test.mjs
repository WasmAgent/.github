import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOCKFILE_PATHS,
  assertFullSha,
  gatesForRepo,
  loadStackLock,
  ownershipProblems,
  requiredNonCoreRepos,
} from "./stack-lock.mjs";

test("lock pins every gate-consumed non-core repo to a full SHA", () => {
  const lock = loadStackLock();
  assert.deepEqual(ownershipProblems(lock), []);
  for (const repo of requiredNonCoreRepos()) {
    assertFullSha(repo, lock.non_core[repo]);
  }
});

test("ownership detects a missing gated repo", () => {
  const lock = loadStackLock();
  const mutated = { ...lock, non_core: { ...lock.non_core } };
  delete mutated.non_core.symkernel;
  const problems = ownershipProblems(mutated);
  assert.ok(problems.some((p) => p.includes("symkernel")), problems.join("; "));
});

test("ownership rejects a short SHA", () => {
  const lock = loadStackLock();
  const mutated = { ...lock, non_core: { ...lock.non_core, bscode: "abc123" } };
  assert.throws(() => assertFullSha("bscode", "abc123"));
  assert.ok(ownershipProblems(mutated).some((p) => p.includes("bscode")));
});

test("every pinned repo declares a committed lockfile", () => {
  for (const repo of requiredNonCoreRepos()) {
    assert.ok(LOCKFILE_PATHS[repo], `no lockfile mapping for ${repo}`);
  }
});

test("O1 consumes every non-core repo; O2/O3/O4 target their consumers", () => {
  for (const repo of requiredNonCoreRepos()) {
    assert.ok(gatesForRepo(repo).includes("O1"), `${repo} not covered by O1`);
  }
  assert.deepEqual(gatesForRepo("symkernel"), ["O1", "O2"]);
  assert.deepEqual(gatesForRepo("agent-golden-path"), ["O1", "O3"]);
  assert.deepEqual(gatesForRepo("open-agent-audit"), ["O1", "O2", "O4"]);
});
