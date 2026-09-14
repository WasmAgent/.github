#!/usr/bin/env node
// Canonical evaluator for "required summary" jobs (N4-P1-01).
//
// Required-check architecture: a workflow runs on every pull request, a
// lightweight `changes` job decides relevance, an expensive inner job runs only
// when relevant, and an always-emitted summary job carries the stable required
// check name. The summary MUST fail closed: it is not enough for the inner job
// to be non-failing — the prerequisite jobs must have completed successfully
// and the relevance output must be one of the two expected states.
//
// This module is the single source of truth for that decision. Callers check
// out WasmAgent/.github at an immutable SHA and invoke it, instead of copying
// shell logic whose failure modes drift between repositories.
//
// Allowed states (nothing else may pass):
//   changes=success + relevant=true  + inner=success -> PASS
//   changes=success + relevant=false + inner=skipped -> PASS
//   changes=success + relevant=false + inner=success -> FAIL (impossible)
//   everything else                                  -> FAIL

export const PASS = "pass";
export const FAIL = "fail";

/**
 * @param {object} state
 * @param {string} state.changesResult  needs.changes.result
 * @param {string} state.relevant       needs.changes.outputs.relevant
 * @param {string} state.innerResult    needs.<inner-job>.result
 * @returns {{ status: "pass" | "fail", reason: string }}
 */
export function evaluateRequired({ changesResult, relevant, innerResult }) {
  if (changesResult !== "success") {
    return {
      status: FAIL,
      reason: `relevance detection did not succeed (changes=${format(changesResult)})`,
    };
  }

  if (relevant === "true") {
    if (innerResult === "success") {
      return {
        status: PASS,
        reason: "relevant changes detected and inner gate succeeded",
      };
    }
    return {
      status: FAIL,
      reason: `relevant changes detected but inner gate did not succeed (inner=${format(innerResult)})`,
    };
  }

  if (relevant === "false") {
    if (innerResult === "skipped") {
      return {
        status: PASS,
        reason: "no relevant changes and inner gate correctly skipped",
      };
    }
    return {
      status: FAIL,
      reason: `no relevant changes but inner gate unexpectedly ran (inner=${format(innerResult)})`,
    };
  }

  return {
    status: FAIL,
    reason: `missing or invalid relevance output (relevant=${format(relevant)})`,
  };
}

function format(value) {
  return value === undefined || value === null ? "<unset>" : `"${value}"`;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--changes-result") opts.changesResult = argv[++i];
    else if (arg === "--relevant") opts.relevant = argv[++i];
    else if (arg === "--inner-result") opts.innerResult = argv[++i];
    else if (arg === "--inner-name") opts.innerName = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`required-result: ${err.message}`);
    return 2;
  }
  const innerName = opts.innerName ?? "inner";
  const { status, reason } = evaluateRequired(opts);
  console.log(`relevance result: relevant=${format(opts.relevant)}`);
  console.log(`inner (${innerName}) result: ${format(opts.innerResult)}`);
  console.log(`required-check decision: ${status.toUpperCase()} — ${reason}`);
  if (status !== PASS) {
    console.error(`::error::required summary failed closed: ${reason}`);
    return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
