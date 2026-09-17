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
import { evaluatePreflight, isHumanReviewer, parseArtifactRef, sourceMatchesCheck } from "./external-outbound-preflight-core.mjs";
import {
  execBinAllowlisted,
  sanitizeEnv,
  INSTALL_SCRIPTS_ALLOWLIST,
  structuralProblems,
} from "./verify-external-outbound-preflight.mjs";
import { computeRelevance, OUTBOUND_PATH_PATTERNS } from "./external-outbound/relevance.mjs";

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
      { kind: "registry_metadata", ref: "npm:@wasmagent/protocol@0.1.11", verified_by: "r-meta" },
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
      { kind: "clean_install_replay", ref: "npm:@wasmagent/protocol@0.1.11", verified_by: "r-bin" },
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
    primary_sources: [{ kind: "github_release_run", repository: "WasmAgent/wasmagent-js", run_id: "run-1", verified_by: "r-run" }],
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
    primary_sources: [{ kind: "github_release_run", repository: "WasmAgent/wasmagent-js", run_id: "run-2", verified_by: "r-run" }],
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
    primary_sources: [{ kind: "clean_install_replay", ref: "npm:@wasmagent/protocol@0.1.11", verified_by: "r-install" }],
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
      { kind: "human_inference", ref: "ai-analysis", statement: "looks broken" },
      { kind: "clean_install_replay", ref: "npm:@wasmagent/p@1.0.0", verified_by: "r-install" },
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
      { kind: "registry_metadata", ref: "npm:@wasmagent/p@1.0.0", verified_by: "r-meta" },
      { kind: "clean_install_replay", ref: "npm:@wasmagent/p@1.0.0", verified_by: "r-install" },
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
      { kind: "registry_metadata", ref: "npm:@wasmagent/p@1.0.0", verified_by: "r-meta" },
      { kind: "published_artifact", ref: "npm:@wasmagent/p@1.0.0", verified_by: "r-meta" },
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
      { kind: "registry_metadata", ref: "npm:@wasmagent/p@1.0.0", verified_by: "r-meta" },
      { kind: "published_artifact", ref: "npm:@wasmagent/p@1.0.0", verified_by: "r-fail" },
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

test("ER-07f: passing checks that verify a DIFFERENT artifact do not bind semantically => HOLD", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      // Source claims facts about package-A, but the check verifies package-B.
      { kind: "registry_metadata", ref: "npm:@wasmagent/package-a@1.0.0", verified_by: "check-b" },
      { kind: "published_artifact", ref: "npm:@wasmagent/package-a@1.0.0", verified_by: "check-c" },
    ],
    command_replays: [
      { id: "check-b", kind: "npm_metadata", package: "@wasmagent/package-b", version: "2.0.0" },
      { id: "check-c", kind: "npm_clean_install", package: "@wasmagent/package-b", version: "2.0.0" },
    ],
  };
  const results = new Map([ok("__artifacts__"), ok("check-b"), ok("check-c")]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"));
});

test("ER-07g: final_state self-declaration has no power — unverifiable kind stays unverified", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      { kind: "human_inference", ref: "anything", final_state: true, verified_by: "r-meta" },
      { kind: "release_log", ref: "log-9", final_state: true, verified_by: "r-meta2" },
    ],
    command_replays: [
      { id: "r-meta", kind: "npm_metadata", package: "@wasmagent/p", version: "1.0.0" },
      { id: "r-meta2", kind: "npm_metadata", package: "@wasmagent/p", version: "1.0.0" },
    ],
  };
  const results = new Map([ok("__artifacts__"), ok("r-meta"), ok("r-meta2")]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"));
});

test("ER-07h: the same logical source duplicated with two checks counts once => HOLD", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      // SAME logical source (kind + artifact identity), two different checks:
      { kind: "registry_metadata", ref: "npm:@wasmagent/a@1.0.0", verified_by: "meta-1" },
      { kind: "registry_metadata", ref: "npm:@wasmagent/a@1.0.0", verified_by: "meta-2" },
    ],
    command_replays: [
      { id: "meta-1", kind: "npm_metadata", package: "@wasmagent/a", version: "1.0.0" },
      { id: "meta-2", kind: "npm_metadata", package: "@wasmagent/a", version: "1.0.0" },
    ],
  };
  const results = new Map([ok("__artifacts__"), ok("meta-1"), ok("meta-2")]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"));
});

test("ER-07i: different modalities of the same artifact remain two sources (metadata + replay)", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      { kind: "registry_metadata", ref: "npm:@wasmagent/a@1.0.0", verified_by: "meta-1" },
      { kind: "clean_install_replay", ref: "npm:@wasmagent/a@1.0.0", verified_by: "install-1" },
    ],
    command_replays: [
      { id: "meta-1", kind: "npm_metadata", package: "@wasmagent/a", version: "1.0.0" },
      { id: "install-1", kind: "npm_clean_install", package: "@wasmagent/a", version: "1.0.0" },
    ],
  };
  const results = new Map([ok("__artifacts__"), ok("meta-1"), ok("install-1")]);
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

// --- claim ceiling binding (P0) ----------------------------------------------

const LEDGERS_WITH_CEILING = {
  claimIdsByLedger: new Map([["external-validation", new Set(["EXT-AEP-0001"])]]),
  prohibitedByExtId: new Map([
    ["EXT-AEP-0001", ["certified_by_linux_foundation", "formally_certified", "independent_semantic_verifier"]],
  ]),
};

test("ER-05b: outbound draft hitting a prohibited claim => HOLD: CLAIM_CEILING_EXCEEDED", () => {
  const record = {
    ...BASE_RECORD,
    claim_refs: [{ ledger: "external-validation", claim_id: "EXT-AEP-0001" }],
    outbound_message: { content: "Good news: this package is formally certified by the lab." },
  };
  const verdict = evaluatePreflight(record, new Map(), LEDGERS_WITH_CEILING);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CLAIM_CEILING_EXCEEDED" && h.detail.includes("formally_certified")));
});

test("ER-05c: negated or differently-worded phrasing does not trip the ceiling scan", () => {
  const record = {
    ...BASE_RECORD,
    claim_refs: [{ ledger: "external-validation", claim_id: "EXT-AEP-0001" }],
    outbound_message: {
      content:
        "Self-check is explicitly *not* independent semantic verification, and no independent semantic implementation is implied; this is not a formal certification.",
    },
  };
  const verdict = evaluatePreflight(record, new Map(), LEDGERS_WITH_CEILING);
  assert.equal(verdict.status, "TECHNICALLY_READY");
});

test("duplicate replay ids fail structural validation", () => {
  const record = {
    ...BASE_RECORD,
    command_replays: [
      { id: "r", kind: "npm_metadata", package: "@wasmagent/a", version: "1.0.0" },
      { id: "r", kind: "npm_clean_install", package: "@wasmagent/b", version: "2.0.0" },
    ],
  };
  const problems = structuralProblems(record);
  assert.ok(problems.some((p) => p.includes("duplicate replay id")), problems.join("; "));
});

test("missing outbound_message fails structural validation", () => {
  const problems = structuralProblems({ ...BASE_RECORD });
  assert.ok(problems.some((p) => p.includes("outbound_message")), problems.join("; "));
});

test("canonicalization bypass: bare-ref duplicate of a prefixed source adds no evidence", () => {
  const record = {
    ...BASE_RECORD,
    message_class: "correction",
    primary_sources: [
      { kind: "registry_metadata", ref: "npm:@wasmagent/a@1.0.0", verified_by: "meta-1" },
      // bare form of the SAME fact — unparseable now, so never verified:
      { kind: "registry_metadata", ref: "@wasmagent/a@1.0.0", verified_by: "meta-2" },
    ],
    command_replays: [
      { id: "meta-1", kind: "npm_metadata", package: "@wasmagent/a", version: "1.0.0" },
      { id: "meta-2", kind: "npm_metadata", package: "@wasmagent/a", version: "1.0.0" },
    ],
  };
  const results = new Map([ok("__artifacts__"), ok("meta-1"), ok("meta-2")]);
  const verdict = evaluatePreflight(record, results, LEDGERS);
  assert.equal(verdict.status, "HOLD");
  assert.ok(verdict.holds.some((h) => h.code === "CORRECTION_EVIDENCE_INSUFFICIENT"));
});

// --- source <-> check semantic binding --------------------------------------

test("parseArtifactRef requires the ecosystem prefix (no bare canonicalization bypass)", () => {
  assert.deepEqual(parseArtifactRef("npm:@wasmagent/protocol@0.1.11"), {
    ecosystem: "npm",
    package: "@wasmagent/protocol",
    version: "0.1.11",
  });
  assert.deepEqual(parseArtifactRef("pypi:wasmagent-protocol@0.1.11"), {
    ecosystem: "pypi",
    package: "wasmagent-protocol",
    version: "0.1.11",
  });
  // A bare identity is NOT parseable — it can never be verified and never
  // counts as a distinct canonicalization of a prefixed source.
  assert.equal(parseArtifactRef("pkg@1.2.3"), null);
  assert.equal(parseArtifactRef("not-an-identity"), null);
  assert.equal(parseArtifactRef(undefined), null);
});

test("sourceMatchesCheck enforces kind and identity binding", () => {
  const envSpecs = new Map([["r-install", { package: "@wasmagent/protocol", version: "0.1.11" }]]);
  // bin_exists check binds to the artifact installed by its `requires` env.
  assert.equal(
    sourceMatchesCheck(
      { kind: "clean_install_replay", ref: "npm:@wasmagent/protocol@0.1.11" },
      { kind: "npm_bin_exists", requires: "r-install", bin_name: "wasmagent-protocol" },
      envSpecs,
    ),
    true,
  );
  // Same check cannot verify a different artifact.
  assert.equal(
    sourceMatchesCheck(
      { kind: "clean_install_replay", ref: "npm:@wasmagent/other@9.9.9" },
      { kind: "npm_bin_exists", requires: "r-install", bin_name: "wasmagent-protocol" },
      envSpecs,
    ),
    false,
  );
  // A metadata check cannot verify a clean-install-replay claim.
  assert.equal(
    sourceMatchesCheck(
      { kind: "clean_install_replay", ref: "npm:@wasmagent/protocol@0.1.11" },
      { kind: "npm_metadata", package: "@wasmagent/protocol", version: "0.1.11" },
      envSpecs,
    ),
    false,
  );
  // Structured GitHub identity: repository + run id, exact match.
  assert.equal(
    sourceMatchesCheck(
      { kind: "github_release_run", repository: "WasmAgent/wasmagent-protocol", run_id: "35188712433" },
      { kind: "github_release_run", repository: "WasmAgent/wasmagent-protocol", run_id: "35188712433" },
      envSpecs,
    ),
    true,
  );
  // A different repository with the same run/PR number is NOT the same source.
  assert.equal(
    sourceMatchesCheck(
      { kind: "github_release_run", repository: "WasmAgent/wasmagent-protocol", run_id: "42" },
      { kind: "github_release_run", repository: "WasmAgent/wasmagent-js", run_id: "42" },
      envSpecs,
    ),
    false,
  );
  assert.equal(
    sourceMatchesCheck(
      { kind: "github_pr_state", repository: "WasmAgent/wasmagent-js", pr_number: 94 },
      { kind: "github_pr_state", repository: "WasmAgent/wasmagent-protocol", pr_number: 94 },
      envSpecs,
    ),
    false,
  );
  // Comment identity is an exact repository+comment_id match, not substring.
  assert.equal(
    sourceMatchesCheck(
      { kind: "github_issue_comment", repository: "WasmAgent/wasmagent-js", comment_id: 5709814263 },
      { kind: "github_issue_comment_exists", comment_url: "https://github.com/WasmAgent/wasmagent-js/issues/92#issuecomment-5709814263" },
      envSpecs,
    ),
    true,
  );
  assert.equal(
    sourceMatchesCheck(
      { kind: "github_issue_comment", repository: "WasmAgent/wasmagent-js", comment_id: 570981426 },
      { kind: "github_issue_comment_exists", comment_url: "https://github.com/WasmAgent/wasmagent-js/issues/92#issuecomment-5709814263" },
      envSpecs,
    ),
    false,
    "comment id must match exactly, not by substring",
  );
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

// --- default-branch-owned relevance detector (P0) ----------------------------

test("relevance detector matches gate sources, ledgers, and their validators", () => {
  const { relevant, matched } = computeRelevance([
    "evidence/external-outbound/APS92-aep-conformance-kit-0.1.11.json",
    "claims/public-claims.yml",
    "evidence/external-validation.json",
    "scripts/validate-public-claims.py",
    "scripts/validate-external-evidence.py",
    "scripts/verify-external-outbound-preflight.mjs",
    "scripts/external-outbound/relevance.mjs",
    ".github/workflows/external-outbound-preflight.yml",
    "schemas/external-outbound-preflight.schema.json",
  ]);
  assert.equal(relevant, true);
  assert.equal(matched.length, 9);
});

test("relevance detector ignores unrelated changes", () => {
  const { relevant, matched } = computeRelevance([
    "packages/foo/index.js",
    "scripts/some-other-script.mjs",
    "src/unrelated.ts",
  ]);
  assert.equal(relevant, false);
  assert.deepEqual(matched, []);
});

test("relevance detector covers the claim-firewall authority and public-text surfaces", () => {
  const { relevant, matched } = computeRelevance([
    "claims/claim-overreach-allowlist.json",
    "docs/some-public-page.md",
    "profile/README.md",
    "README.md",
    "ORG-FOCUS-2026Q3.md",
    "evidence/anything.json",
  ]);
  assert.equal(relevant, true);
  assert.equal(matched.length, 6);
});

test("relevance detector pattern list is not empty and anchored", () => {
  assert.ok(OUTBOUND_PATH_PATTERNS.length >= 10);
  for (const p of OUTBOUND_PATH_PATTERNS) {
    assert.ok(p.source.startsWith("^"), `pattern must be anchored: ${p.source}`);
  }
});
