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
import { execBinAllowlisted, sanitizeEnv, INSTALL_SCRIPTS_ALLOWLIST } from "./verify-external-outbound-preflight.mjs";

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
      { kind: "registry_metadata", ref: "npm:@wasmagent/protocol@0.1.11", final_state: true, verified_by: "r-meta" },
    ],
    command_replays: [{ id: "r-meta", kind: "npm_metadata", package: "@wasmagent/protocol", version: "0.1.11" }],
  };
  // Live registry check says the bin mapping IS present -> expectation conflict.
  const results = new Map([
    ["__artifacts__", { ok: true, artifacts: ["npm:@wasmagent/protocol@0.1.11: message expects bin=null, registry serves {\"wasmagent-protocol\":\"bin/cli.js\"}"] }],
    ok("r-meta"),
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
      { kind: "clean_install_replay", ref: "replay-0.1.11", final_state: true, verified_by: "r-bin" },
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
  ]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "TECHNICALLY_READY");
  assert.equal(verdict.humanApprovalRecorded, false, "no human approval yet");
  assert.ok(verdict.notes.every((n) => !n.includes("EXTERNAL_READY: yes")), "the machine never emits EXTERNAL_READY: yes");
});

test("ER-03: source tests pass but published-artifact command replay fails => HOLD: COMMAND_REPLAY_FAILED", () => {
  const record = {
    ...BASE_RECORD,
    artifacts: [{ ecosystem: "npm", package: "@wasmagent/x", version: "1.0.0" }],
    primary_sources: [{ kind: "github_release_run", ref: "run-1", final_state: true, verified_by: "r-run" }],
    command_replays: [
      { id: "r-run", kind: "github_release_run", repository: "WasmAgent/wasmagent-js", run_id: "run-1", expect_conclusion: "success" },
      { id: "r-install", kind: "npm_clean_install", package: "@wasmagent/x", version: "1.0.0" },
      { id: "r-exec", kind: "npm_exec", requires: "r-install", argv: ["x", "self-check"], expect_exit: 0 },
    ],
  };
  const results = new Map([
    ok("__artifacts__"),
    ok("r-run"),
    ok("r-install"),
    ["r-exec", { ok: false, detail: "exit=1, stdout=command not found" }],
  ]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "COMMAND_REPLAY_FAILED" && h.detail.includes("r-exec")));
});

test("ER-04: CI green but final artifact absent from registry => HOLD: ARTIFACT_NOT_FOUND", () => {
  const record = {
    ...BASE_RECORD,
    artifacts: [{ ecosystem: "npm", package: "@wasmagent/ghost", version: "9.9.9" }],
    primary_sources: [{ kind: "github_release_run", ref: "run-2", final_state: true, verified_by: "r-run" }],
    command_replays: [{ id: "r-run", kind: "github_release_run", run_id: "run-2", expect_conclusion: "success" }],
  };
  const results = new Map([
    ["__artifacts__", { ok: false, artifacts: [] }],
    ["artifact:npm:@wasmagent/ghost@9.9.9", { ok: false, detail: "npm registry does not serve @wasmagent/ghost@9.9.9" }],
    ok("r-run"),
  ]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "ARTIFACT_NOT_FOUND"));
});

test("ER-05: executable command but claim outside ledger ceiling => HOLD: CLAIM_CEILING_EXCEEDED", () => {
  const record = {
    ...BASE_RECORD,
    artifacts: [{ ecosystem: "npm", package: "@wasmagent/protocol", version: "0.1.11" }],
    primary_sources: [{ kind: "clean_install_replay", ref: "replay", final_state: true, verified_by: "r-install" }],
    command_replays: [{ id: "r-install", kind: "npm_clean_install", package: "@wasmagent/protocol", version: "0.1.11" }],
    claim_refs: [{ ledger: "external-validation", claim_id: "EXT-DOES-NOT-EXIST" }],
  };
  const results = new Map([ok("__artifacts__"), ok("r-install")]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CLAIM_CEILING_EXCEEDED" && h.detail.includes("EXT-DOES-NOT-EXIST")));
});

test("ER-06: all technical checks pass but nobody approved => TECHNICALLY_READY, approval simply absent", () => {
  const verdict = evaluatePreflight({ ...BASE_RECORD }, new Map(), LEDGERS);
  assert.equal(verdict.status, "TECHNICALLY_READY");
  assert.equal(verdict.humanApprovalRecorded, false);
  assert.ok(verdict.notes.some((n) => n.includes("HUMAN_APPROVAL: none recorded")));
  assert.ok(verdict.notes.every((n) => !n.includes("EXTERNAL_READY")), "the machine never emits EXTERNAL_READY");
});

test("ER-06b: a bot reviewer cannot even get HUMAN_APPROVAL_RECORDED", () => {
  for (const bot of ["github-actions[bot]", "dependabot[bot]", "renovate[bot]", "claude-bot"]) {
    const record = {
      ...BASE_RECORD,
      human_approval: { required: true, approved: true, reviewed_by: bot },
    };
    const verdict = evaluatePreflight(record, new Map(), LEDGERS);
    assert.equal(verdict.status, "TECHNICALLY_READY");
    assert.equal(verdict.humanApprovalRecorded, false, `${bot} must never count as a reviewer`);
    assert.ok(verdict.notes.some((n) => n.includes("rejected")));
  }
});

test("ER-06c: a recorded human approval is only ever REPORTED, never authorized by the machine", () => {
  const record = {
    ...BASE_RECORD,
    human_approval: { required: true, approved: true, reviewed_by: "telleroutlook" },
  };
  const verdict = evaluatePreflight(record, new Map(), LEDGERS);
  assert.equal(verdict.status, "TECHNICALLY_READY");
  assert.equal(verdict.humanApprovalRecorded, true);
  assert.ok(verdict.notes.some((n) => n.includes("HUMAN_APPROVAL_RECORDED")));
  assert.ok(verdict.notes.some((n) => n.includes("human action outside this validator")));
  assert.ok(verdict.notes.every((n) => !n.includes("EXTERNAL_READY: yes")));
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

test("ER-07b: clean-install replay + unverified inference does NOT satisfy the correction threshold", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      { kind: "human_inference", ref: "ai-analysis", statement: "looks broken", final_state: true },
      { kind: "clean_install_replay", ref: "replay-x", final_state: true, verified_by: "r-install" },
    ],
    command_replays: [{ id: "r-install", kind: "npm_clean_install", package: "@wasmagent/p", version: "1.0.0" }],
  };
  const results = new Map([ok("__artifacts__"), ok("r-install")]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"));
});

test("ER-07c: correction with two DISTINCT machine-verified sources incl. one final-state passes the threshold", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      { kind: "registry_metadata", ref: "npm:@wasmagent/p@1.0.0", final_state: true, verified_by: "r-meta" },
      { kind: "clean_install_replay", ref: "replay-x", final_state: true, verified_by: "r-install" },
    ],
    command_replays: [
      { id: "r-meta", kind: "npm_metadata", package: "@wasmagent/p", version: "1.0.0" },
      { id: "r-install", kind: "npm_clean_install", package: "@wasmagent/p", version: "1.0.0" },
    ],
  };
  const results = new Map([ok("__artifacts__"), ok("r-meta"), ok("r-install")]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.ok(!verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"), verdict.holds.join("; "));
});

test("ER-07d: two sources verified_by the SAME check count once — threshold still fails", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      { kind: "registry_metadata", ref: "s1", final_state: true, verified_by: "r-meta" },
      { kind: "published_artifact", ref: "s2", final_state: true, verified_by: "r-meta" },
    ],
    command_replays: [{ id: "r-meta", kind: "npm_metadata", package: "@wasmagent/p", version: "1.0.0" }],
  };
  const results = new Map([ok("__artifacts__"), ok("r-meta")]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"));
});

test("ER-07e: verified_by pointing at a failed check does not count", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      { kind: "registry_metadata", ref: "s1", final_state: true, verified_by: "r-meta" },
      { kind: "published_artifact", ref: "s2", final_state: true, verified_by: "r-fail" },
    ],
    command_replays: [
      { id: "r-meta", kind: "npm_metadata", package: "@wasmagent/p", version: "1.0.0" },
      { id: "r-fail", kind: "npm_clean_install", package: "@wasmagent/p", version: "1.0.0" },
    ],
  };
  const results = new Map([ok("__artifacts__"), ok("r-meta"), ["r-fail", { ok: false, detail: "install failed" }]]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"));
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

// --- replay execution isolation (P1-4) --------------------------------------

test("sanitizeEnv strips every credential-looking variable", () => {
  const scrubbed = sanitizeEnv({
    PATH: "/usr/bin",
    HOME: "/home/u",
    GH_TOKEN: "gh-secret",
    GITHUB_TOKEN: "github-secret",
    NPM_TOKEN: "npm-secret",
    NODE_AUTH_TOKEN: "registry-secret",
    PYPI_API_TOKEN: "pypi-secret",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
    MY_DB_PASSWORD: "hunter2",
    ordinary: "kept",
  });
  expectKeys(scrubbed, ["ordinary", "PATH", "HOME"]);
  expectAbsent(scrubbed, ["GH_TOKEN", "GITHUB_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN", "PYPI_API_TOKEN", "AWS_SECRET_ACCESS_KEY", "MY_DB_PASSWORD"]);
});

function expectKeys(obj, keys) {
  for (const k of keys) assert.ok(k in obj, `${k} should be kept`);
}

function expectAbsent(obj, keys) {
  for (const k of keys) assert.ok(!(k in obj), `${k} should be stripped`);
}

test("npm clean installs run with --ignore-scripts unless the package is allowlisted", () => {
  // The allowlist starts empty: a data record can never open the door.
  assert.equal(INSTALL_SCRIPTS_ALLOWLIST.size, 0);
});

test("npm_exec argv[0] must be a bin declared by the target package", () => {
  const binKeys = ["wasmagent-protocol"];
  assert.equal(execBinAllowlisted(["wasmagent-protocol", "aep-conformance", "path"], binKeys), true);
  assert.equal(execBinAllowlisted(["curl", "https://evil.example"], binKeys), false);
  assert.equal(execBinAllowlisted(["node", "-e", "require('child_process')"], binKeys), false);
  assert.equal(execBinAllowlisted([], binKeys), false);
  assert.equal(execBinAllowlisted([""], binKeys), false);
});
