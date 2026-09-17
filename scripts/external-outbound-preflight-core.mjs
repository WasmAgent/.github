/**
 * External outbound preflight — pure evaluation core.
 *
 * The CLI (verify-external-outbound-preflight.mjs) gathers real check results
 * from allowlisted adapters and hands them here as a plain map; this module
 * owns the state machine and the HOLD contract. Kept free of I/O so the
 * hostile regressions (ER-01..ER-07) run hermetically under node --test.
 *
 * Contract (exit codes are chosen by the CLI from `status` / `hold_code`):
 *   TECHNICALLY_READY                    all checks pass; human approval may still be missing
 *   HOLD: PRIMARY_SOURCE_CONFLICT        unresolved contradiction / registry expectation mismatch
 *   HOLD: COMMAND_REPLAY_FAILED          a structured replay failed its expectations
 *   HOLD: ARTIFACT_NOT_FOUND             an artifact is absent from its registry
 *   HOLD: CLAIM_CEILING_EXCEEDED         claim_refs point outside the existing ledgers
 *   HOLD: CORRECTION_EVIDENCE_INSUFFICIENT  correction without >=2 machine-verified sources
 *
 * Machine/human boundary: the machine computes at most TECHNICALLY_READY. It
 * NEVER outputs EXTERNAL_READY — at most it reports HUMAN_APPROVAL_RECORDED
 * when the record carries an approval from an acceptable non-bot reviewer.
 * The final EXTERNAL_READY designation is a human action outside this
 * validator, and no workflow or bot may auto-post.
 */

export const ALLOWED_REPLAY_KINDS = new Set([
  "npm_metadata",
  "npm_clean_install",
  "npm_bin_exists",
  "npm_exec",
  "pypi_metadata",
  "pypi_clean_install",
  "github_release_run",
  "github_pr_state",
  "github_issue_comment_exists",
  "claim_ref",
]);

/** Primary-source kinds that are final-state evidence by nature. */
const FINAL_STATE_SOURCE_KINDS = new Set([
  "registry_metadata",
  "published_artifact",
  "clean_install_replay",
]);

/**
 * human_inference can be recorded honestly as a source, but it is never
 * machine-verifiable and never counts toward evidence thresholds.
 */
const UNVERIFIABLE_SOURCE_KINDS = new Set(["human_inference", "release_log"]);

const BOT_REVIEWERS = new Set([
  "github-actions[bot]",
  "dependabot[bot]",
  "renovate[bot]",
  "claude-bot",
]);

/** True when the named reviewer is an acceptable non-bot maintainer. */
export function isHumanReviewer(name) {
  return typeof name === "string" && name.length > 0 && !BOT_REVIEWERS.has(name);
}

/**
 * Evaluate one preflight record against gathered check results.
 *
 * @param {object} record  parsed preflight record (schema-validated upstream)
 * @param {Map<string, {ok: boolean, detail?: string}>} checkResults
 *        keyed by replay id; every command_replays[] entry must have a result.
 * @param {{claimIdsByLedger: Map<string, Set<string>>}} ledgerIndex
 *        existing claim ids per ledger ("public-claims" / "external-validation").
 * @returns {{status: "TECHNICALLY_READY", humanApprovalRecorded: boolean,
 *            holds: Array<{code: string, detail: string}>, notes: string[]}}
 */
export function evaluatePreflight(record, checkResults, ledgerIndex) {
  const holds = [];
  const notes = [];

  // Artifacts must exist on their registry (ARTIFACT_NOT_FOUND) and match any
  // exact expectations the message depends on (PRIMARY_SOURCE_CONFLICT).
  const artifactChecks = checkResults.get("__artifacts__") ?? { ok: true, artifacts: [] };
  if (!artifactChecks.ok) {
    holds.push({ code: "ARTIFACT_NOT_FOUND", detail: artifactChecks.detail ?? "artifact check failed" });
  }
  for (const conflict of artifactChecks.artifacts ?? []) {
    holds.push({ code: "PRIMARY_SOURCE_CONFLICT", detail: conflict });
  }

  // Every replay entry needs a result, and each must pass.
  for (const replay of record.command_replays ?? []) {
    if (!ALLOWED_REPLAY_KINDS.has(replay.kind)) {
      holds.push({ code: "COMMAND_REPLAY_FAILED", detail: `${replay.id}: kind ${replay.kind} is not allowlisted` });
      continue;
    }
    const result = checkResults.get(replay.id);
    if (!result) {
      holds.push({ code: "COMMAND_REPLAY_FAILED", detail: `${replay.id}: no result gathered` });
      continue;
    }
    if (!result.ok) {
      holds.push({
        code: replay.kind === "claim_ref" ? "CLAIM_CEILING_EXCEEDED" : "COMMAND_REPLAY_FAILED",
        detail: `${replay.id}: ${result.detail ?? "failed"}`,
      });
    }
  }

  // Every recorded contradiction must be resolved by a passing check
  // (ER-01/ER-02): unresolved or falsely-resolved contradictions are HOLD.
  for (const c of record.contradictions ?? []) {
    const resolver = c.resolved_by ? checkResults.get(c.resolved_by) : null;
    if (!resolver || !resolver.ok) {
      holds.push({
        code: "PRIMARY_SOURCE_CONFLICT",
        detail: `contradiction ${c.id} unresolved: ${c.description}`,
      });
    }
  }

  // claim_refs must exist in the referenced ledger (ER-05).
  for (const ref of record.claim_refs ?? []) {
    const ids = ledgerIndex?.claimIdsByLedger?.get(ref.ledger);
    if (!ids || !ids.has(ref.claim_id)) {
      holds.push({
        code: "CLAIM_CEILING_EXCEEDED",
        detail: `claim_ref ${ref.ledger}:${ref.claim_id} not found in the ledger`,
      });
    }
  }

  // Correction threshold (ER-07..ER-07c): a factual correction requires at
  // least TWO MACHINE-VERIFIED evidence sources — each `verified_by` must
  // point to a DISTINCT, PASSING check; unverified statements, inferences and
  // log quotations never count — and at least one verified source must be
  // final-state evidence.
  if (record.message_class === "correction") {
    const { verified, verifiedFinalState } = countVerifiedSources(record, checkResults);
    if (verified < 2 || verifiedFinalState < 1) {
      holds.push({
        code: "CORRECTION_EVIDENCE_INSUFFICIENT",
        detail:
          `correction has ${verified} machine-verified source(s) with ${verifiedFinalState} ` +
          `final-state — needs >=2 distinct verified_by sources including >=1 verified final-state source`,
      });
    }
  }

  const status = holds.length === 0 ? "TECHNICALLY_READY" : "HOLD";

  // Machine/human boundary (ER-06): the machine never emits EXTERNAL_READY.
  // It only records whether the record carries a plausible human approval.
  const approval = record.human_approval ?? {};
  let humanApprovalRecorded = false;
  if (status === "TECHNICALLY_READY") {
    if (approval.approved && isHumanReviewer(approval.reviewed_by)) {
      humanApprovalRecorded = true;
      notes.push(
        `HUMAN_APPROVAL_RECORDED — reviewed_by=${approval.reviewed_by}; the final ` +
          "EXTERNAL_READY designation is a human action outside this validator",
      );
    } else if (approval.approved) {
      notes.push(
        `HUMAN_APPROVAL_RECORDED rejected: reviewed_by ${JSON.stringify(approval.reviewed_by ?? null)} ` +
          "is not an acceptable non-bot reviewer",
      );
    } else {
      notes.push("HUMAN_APPROVAL: none recorded — sending requires explicit human approval");
    }
  }

  return { status, humanApprovalRecorded, holds, notes };
}

/**
 * Count machine-verified sources for the correction threshold. A source
 * counts only when it carries `verified_by` pointing at a DISTINCT, PASSING
 * check and is of a verifiable kind. Returns the verified count and how many
 * of the verified sources are final-state evidence.
 */
function countVerifiedSources(record, checkResults) {
  const seenChecks = new Set();
  let verified = 0;
  let verifiedFinalState = 0;
  for (const source of record.primary_sources ?? []) {
    if (UNVERIFIABLE_SOURCE_KINDS.has(source.kind)) continue;
    const checkId = source.verified_by;
    if (!checkId || seenChecks.has(checkId)) continue;
    const result = checkResults.get(checkId);
    if (!result || !result.ok) continue;
    seenChecks.add(checkId);
    verified += 1;
    if (source.final_state === true || FINAL_STATE_SOURCE_KINDS.has(source.kind)) {
      verifiedFinalState += 1;
    }
  }
  return { verified, verifiedFinalState };
}
