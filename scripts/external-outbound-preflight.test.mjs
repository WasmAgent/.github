/**
 * Hostile regressions for the external outbound preflight gate (ER-01..ER-07).
 *
 * The core evaluator runs hermetically: check results are injected, no
 * registry/network access. The adapters (real npm/pypi/gh calls) are exercised
 * separately by the live APS92 record verification.
 *
 * Run: node --test scripts/external-outbound-preflight.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePreflight, isHumanReviewer } from "./external-outbound-preflight-core.mjs";

const LEDGERS = {
  claimIdsByLedger: new Map([
    ["public-claims", new Set(["WA-C-0001"])],
    ["external-validation", new Set(["EXT-AEP-0001"])],
  ]),
};

function ok(id) {
  return [id, { ok: true }];
}

const BASE_RECORD = {
  schema_version: 1,
  id: "TEST-RECORD-001",
  target: { repository: "Agent-Authority-Conformance/aps-conformance-suite", issue: 92 },
  message_class: "release_enablement",
  artifacts: [],
  primary_sources: [],
  command_replays: [],
  claim_refs: [],
  contradictions: [],
  human_approval: { required: true, approved: false, reviewed_by: null },
};

test("ER-01: registry metadata contradicting the recorded claim => HOLD: PRIMARY_SOURCE_CONFLICT", () => {
  const record = {
    ...BASE_RECORD,
    // A correction record claiming the npm bin mapping was removed:
    message_class: "correction",
    artifacts: [
      {
        ecosystem: "npm",
        package: "@wasmagent/protocol",
        version: "0.1.11",
        expect: { bin: null }, // message claims: no bin on the registry
      },
    ],
    primary_sources: [
      { kind: "release_log", ref: "run-35188712433", statement: "npm warn: bin was invalid and removed" },
      { kind: "registry_metadata", ref: "npm:@wasmagent/protocol@0.1.11", final_state: true },
    ],
    command_replays: [],
  };
  // Live registry check says the bin mapping IS present -> expectation conflict.
  const results = new Map([
    ["__artifacts__", { ok: true, artifacts: ["npm:@wasmagent/protocol@0.1.11: message expects bin=null, registry serves {\"wasmagent-protocol\":\"bin/cli.js\"}"] }],
  ]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "PRIMARY_SOURCE_CONFLICT"));
});

test("ER-02: suspected log signal refuted by clean-install replay => TECHNICALLY_READY", () => {
  const record = {
    ...BASE_RECORD,
    artifacts: [{ ecosystem: "npm", package: "@wasmagent/protocol", version: "0.1.11" }],
    primary_sources: [
      { kind: "release_log", ref: "run-35188712433", statement: "suspected bin removal warning" },
      { kind: "clean_install_replay", ref: "replay-0.1.11", final_state: true },
    ],
    command_replays: [
      { id: "r-install", kind: "npm_clean_install", package: "@wasmagent/protocol", version: "0.1.11" },
      { id: "r-bin", kind: "npm_bin_exists", requires: "r-install", bin_name: "wasmagent-protocol" },
      { id: "r-exec", kind: "npm_exec", requires: "r-install", argv: ["wasmagent-protocol", "aep-conformance", "self-check"], expect_exit: 0 },
    ],
    contradictions: [
      { id: "C1", description: "suspected warning vs registry metadata", resolved_by: "r-bin" },
    ],
  };
  const results = new Map([
    ok("__artifacts__"),
    ok("r-install"),
    ok("r-bin"),
    ok("r-exec"),
    ["source:clean_install_replay:replay-0.1.11", { ok: true }],
  ]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "TECHNICALLY_READY");
  assert.equal(verdict.externalReady, false, "no human approval yet");
});

test("ER-03: source tests pass but published-artifact command replay fails => HOLD: COMMAND_REPLAY_FAILED", () => {
  const record = {
    ...BASE_RECORD,
    artifacts: [{ ecosystem: "npm", package: "@wasmagent/x", version: "1.0.0" }],
    primary_sources: [{ kind: "github_release_run", ref: "run-1", final_state: true }],
    command_replays: [
      { id: "r-install", kind: "npm_clean_install", package: "@wasmagent/x", version: "1.0.0" },
      { id: "r-exec", kind: "npm_exec", requires: "r-install", argv: ["x", "self-check"], expect_exit: 0 },
    ],
  };
  const results = new Map([
    ok("__artifacts__"),
    ok("r-install"),
    ["r-exec", { ok: false, detail: "exit=1, stdout=command not found" }],
    ["source:github_release_run:run-1", { ok: true }],
  ]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "COMMAND_REPLAY_FAILED" && h.detail.includes("r-exec")));
});

test("ER-04: CI green but final artifact absent from registry => HOLD: ARTIFACT_NOT_FOUND", () => {
  const record = {
    ...BASE_RECORD,
    artifacts: [{ ecosystem: "npm", package: "@wasmagent/ghost", version: "9.9.9" }],
    primary_sources: [{ kind: "github_release_run", ref: "run-2", final_state: true }],
    command_replays: [{ id: "r-run", kind: "github_release_run", run_id: "run-2", expect_conclusion: "success" }],
  };
  const results = new Map([
    ["__artifacts__", { ok: false, artifacts: [] }],
    ["artifact:npm:@wasmagent/ghost@9.9.9", { ok: false, detail: "npm registry does not serve @wasmagent/ghost@9.9.9" }],
    ok("r-run"),
    ["source:github_release_run:run-2", { ok: true }],
  ]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "ARTIFACT_NOT_FOUND"));
});

test("ER-05: executable command but claim outside ledger ceiling => HOLD: CLAIM_CEILING_EXCEEDED", () => {
  const record = {
    ...BASE_RECORD,
    artifacts: [{ ecosystem: "npm", package: "@wasmagent/protocol", version: "0.1.11" }],
    primary_sources: [{ kind: "clean_install_replay", ref: "replay", final_state: true }],
    command_replays: [{ id: "r-install", kind: "npm_clean_install", package: "@wasmagent/protocol", version: "0.1.11" }],
    claim_refs: [{ ledger: "external-validation", claim_id: "EXT-DOES-NOT-EXIST" }],
  };
  const results = new Map([ok("__artifacts__"), ok("r-install"), ["source:clean_install_replay:replay", { ok: true }]]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CLAIM_CEILING_EXCEEDED" && h.detail.includes("EXT-DOES-NOT-EXIST")));
});

test("ER-06: all technical checks pass but nobody approved => TECHNICALLY_READY, never EXTERNAL_READY", () => {
  const record = { ...BASE_RECORD };
  const verdict = evaluatePreflight(record, new Map(), LEDGERS);
  assert.equal(verdict.status, "TECHNICALLY_READY");
  assert.equal(verdict.externalReady, false);
  assert.ok(verdict.notes.some((n) => n.includes("human approval")));
});

test("ER-06b: bot reviewer never satisfies the approval requirement", () => {
  for (const bot of ["github-actions[bot]", "dependabot[bot]", "renovate[bot]", "claude-bot"]) {
    const record = {
      ...BASE_RECORD,
      human_approval: { required: true, approved: true, reviewed_by: bot },
    };
    const verdict = evaluatePreflight(record, new Map(), LEDGERS);
    assert.equal(verdict.status, "TECHNICALLY_READY");
    assert.equal(verdict.externalReady, false, `${bot} must not count as a reviewer`);
  }
  const human = {
    ...BASE_RECORD,
    human_approval: { required: true, approved: true, reviewed_by: "telleroutlook" },
  };
  const verdict = evaluatePreflight(human, new Map(), LEDGERS);
  assert.equal(verdict.externalReady, true);
});

test("ER-07: correction backed by a single warning => HOLD: CORRECTION_EVIDENCE_INSUFFICIENT", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [{ kind: "release_log", ref: "run-3", statement: "one warning line" }],
    command_replays: [],
  };
  const verdict = evaluatePreflight(record, new Map(), LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"));
});

test("ER-07b: correction with two sources incl. a passing clean-install replay passes the threshold", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      { kind: "release_log", ref: "run-3" },
      { kind: "clean_install_replay", ref: "replay-x", final_state: true },
    ],
    command_replays: [{ id: "r-install", kind: "npm_clean_install", package: "@wasmagent/p", version: "1.0.0" }],
  };
  const results = new Map([ok("__artifacts__"), ok("r-install"), ["source:clean_install_replay:replay-x", { ok: true }]]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.ok(!verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"), verdict.holds.join("; "));
});

test("unresolved contradiction blocks even a clean record", () => {
  const record = {
    ...BASE_RECORD,
    contradictions: [{ id: "C9", description: "two sources disagree", resolved_by: null }],
  };
  const verdict = evaluatePreflight(record, new Map(), LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "PRIMARY_SOURCE_CONFLICT" && h.detail.includes("C9")));
});

test("non-allowlisted replay kind is rejected", () => {
  const record = {
    ...BASE_RECORD,
    command_replays: [{ id: "r-shell", kind: "arbitrary_shell" }],
  };
  const verdict = evaluatePreflight(record, new Map(), LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "COMMAND_REPLAY_FAILED" && h.detail.includes("not allowlisted")));
});
