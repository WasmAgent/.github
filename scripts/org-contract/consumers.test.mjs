import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConsumers, loadExcluded } from "./consumers.mjs";
import { gatesForRepo, requiredNonCoreRepos } from "./stack-lock.mjs";

test("every consumer is a pinned repo covered by O2", () => {
  const pinned = new Set(requiredNonCoreRepos());
  for (const c of loadConsumers()) {
    assert.ok(pinned.has(c.repo), `${c.repo} is a consumer but not pinned`);
    assert.ok(gatesForRepo(c.repo).includes("O2"), `${c.repo} is a consumer but not covered by O2`);
    assert.ok(c.install && c.command, `${c.repo} missing install/command`);
  }
});

test("consumers and exclusions do not overlap", () => {
  const consumers = new Set(loadConsumers().map((c) => c.repo));
  for (const e of loadExcluded()) {
    assert.ok(!consumers.has(e.repo), `${e.repo} is both a consumer and excluded`);
    assert.ok(e.reason, `${e.repo} exclusion has no reason`);
  }
});

test("train-replay is explicitly excluded as a non-AEP consumer", () => {
  const excluded = loadExcluded().map((e) => e.repo);
  assert.ok(excluded.includes("wasmagent-train-replay"));
});
