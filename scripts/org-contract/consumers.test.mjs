import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConsumers, loadExcluded } from "./consumers.mjs";
import { gatesForRepo, requiredNonCoreRepos } from "./stack-lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

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

test("--tsv preserves empty fields for clean-checkout ordering", () => {
  const out = execFileSync("node", [join(HERE, "consumers.mjs"), "--tsv"], { encoding: "utf8" });
  for (const line of out.trim().split("\n")) {
    const fields = line.split("|");
    assert.equal(fields.length, 5, `wrong field count in: ${line}`);
  }
  const bscode = out
    .trim()
    .split("\n")
    .map((l) => l.split("|"))
    .find((f) => f[0] === "bscode");
  assert.equal(bscode[1], "", "bscode build must be an explicit empty field, not a shifted value");
  assert.equal(bscode[2], "bun install --frozen-lockfile");
  assert.equal(bscode[3], "bun --filter @bscode/worker test");
});
