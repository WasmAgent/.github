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
 *   HOLD: CORRECTION_EVIDENCE_INSUFFICIENT  correction without >=2 sources incl. one final-state
 *
 * TECHNICALLY_READY never implies permission to post: EXTERNAL_READY requires
 * explicit human approval from a non-bot maintainer, and even then no
 * workflow or bot may auto-post.
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

const FINAL_STATE_SOURCE_KINDS = new Set([
  "registry_metadata",
  "published_artifact",
  "clean_install_replay",
]);

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
 * @returns {{status: "TECHNICALLY_READY", externalReady: boolean,
 *            holds: Array<{code: string, detail: string}>, notes: string[]}}
 */
export function evaluatePreflight(record, checkResults, ledgerIndex) {
  const holds = [];
  const notes = [];

  // Artifacts must exist on their registry (ARTIFACT_NOT_FOUND) and match any
  // exact expectations the message depends on (PRIMARY_SOURCE_CONFLICT).
  const artifactChecks = (checkResults.get("__artifacts__") ?? { ok: true, artifacts: [] });
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

  // Correction threshold (ER-07): a factual correction needs >=2 primary
  // sources and at least one final-state source, where final-state means an
  // explicit final_state source OR a successful clean-install replay.
  if (record.message_class === "correction") {
    const sources = record.primary_sources ?? [];
    const cleanInstallOk = [...checkResults.entries()].some(([id, r]) => {
      const replay = (record.command_replays ?? []).find((c) => c.id === id);
      return (
        (replay?.kind === "npm_clean_install" || replay?.kind === "pypi_clean_install") && r.ok
      );
    });
    const hasFinalState =
      cleanInstallOk ||
      sources.some(
        (s) =>
          (s.final_state === true || FINAL_STATE_SOURCE_KINDS.has(s.kind)) &&
          isSourceVerified(s, checkResults),
      );
    if (sources.length < 2 || !hasFinalState) {
      holds.push({
        code: "CORRECTION_EVIDENCE_INSUFFICIENT",
        detail: `correction has ${sources.length} source(s), final-state ${
          hasFinalState ? "present" : "absent"
        } — needs >=2 sources including one final-state source`,
      });
    }
  }

  const status = holds.length === 0 ? "TECHNICALLY_READY" : "HOLD";
  // HOLD details are printed from `holds` by the CLI; notes only carry the
  // state-machine commentary (EXTERNAL_READY determination).

  // Human approval gate (ER-06): TECHNICALLY_READY is never enough to post,
  // and a bot reviewer never satisfies the approval requirement.
  const approval = record.human_approval ?? {};
  let externalReady = false;
  if (status === "TECHNICALLY_READY") {
    if (!approval.approved) {
      notes.push("EXTERNAL_READY: no — TECHNICALLY_READY requires explicit human approval before sending");
    } else if (!isHumanReviewer(approval.reviewed_by)) {
      notes.push(
        `EXTERNAL_READY: no — reviewed_by ${JSON.stringify(approval.reviewed_by ?? null)} is not an acceptable non-bot reviewer`,
      );
    } else {
      externalReady = true;
      notes.push(`EXTERNAL_READY: yes (approved by ${approval.reviewed_by}) — posting itself still stays manual`);
    }
  }

  return { status, externalReady, holds, notes };
}

/**
 * A primary source counts as verified when a check result named after its
 * kind/ref exists and passed (adapters key results as `source:<kind>:<ref>`).
 * Sources without a matching check (e.g. a plain release log the verifier
 * cannot re-open) are treated as unverified — they can still satisfy the
 * source-count half of the correction threshold but never the final-state half.
 */
function isSourceVerified(source, checkResults) {
  const result = checkResults.get(`source:${source.kind}:${source.ref}`);
  return Boolean(result && result.ok);
}
