#!/usr/bin/env node
/**
 * Outbound-gate relevance detector — DEFAULT-BRANCH-OWNED.
 *
 * This module is the trust anchor for the required check
 * "External outbound preflight (.github)": the workflow's summary job loads
 * THIS FILE from origin/main (never from the candidate tree), feeds it the
 * objective changed-file list (git diff --name-only origin/main...HEAD), and
 * passes the resulting relevance to the pinned required-result evaluator.
 *
 * A candidate pull request can therefore not weaken the gate by editing the
 * detector or its path list: whatever is on main decides. Editing the
 * detector itself requires merging a PR that is evaluated against the
 * detector already on main.
 *
 * Usage:
 *   node scripts/external-outbound/relevance.mjs --files <changed-files.txt>
 *
 * Output: exactly one line "relevant=true" or "relevant=false" (plus a
 * matched-file summary on stderr), exit 0 in both cases — the decision is
 * data, not a failure.
 */

import { readFileSync } from "node:fs";

export const OUTBOUND_PATH_PATTERNS = [
  // Gate definition and evidence
  /^evidence\/external-outbound\//,
  /^schemas\/external-outbound-preflight\.schema\.json$/,
  /^scripts\/external-outbound-preflight(-core)?\.mjs$/,
  /^scripts\/external-outbound-preflight\.test\.mjs$/,
  /^scripts\/verify-external-outbound-preflight\.mjs$/,
  /^scripts\/external-outbound\/relevance\.mjs$/,
  /^\.github\/workflows\/external-outbound-preflight\.yml$/,
  // Claim-firewall authority and public-text surfaces — exactly what
  // scripts/validate-public-claims.py reads and scans (SCAN_DIRS,
  // SCAN_FILES, ALLOWLIST_PATH). Weakening the claim authority or editing
  // public claim text must not slip past this gate.
  /^claims\//,
  /^evidence\//,
  /^docs\//,
  /^media\//,
  /^releases\//,
  /^profile\//,
  /^README\.md$/,
  /^ORG-FOCUS-2026Q3\.md$/,
  // Ledger validators
  /^scripts\/validate-public-claims\.py$/,
  /^scripts\/validate-external-evidence\.py$/,
];

/** Pure relevance decision (unit-tested). */
export function computeRelevance(changedFiles, patterns = OUTBOUND_PATH_PATTERNS) {
  const matched = changedFiles.filter((f) => patterns.some((p) => p.test(f)));
  return { relevant: matched.length > 0, matched };
}

function main(argv) {
  let filesArg = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--files") filesArg = argv[++i];
    else {
      console.error(`unknown argument ${argv[i]}`);
      return 2;
    }
  }
  if (!filesArg) {
    console.error("usage: relevance.mjs --files <changed-files.txt>");
    return 2;
  }
  const files = readFileSync(filesArg, "utf8").split(/\r?\n/).filter(Boolean);
  const { relevant, matched } = computeRelevance(files);
  for (const m of matched) console.error(`outbound-relevant: ${m}`);
  process.stdout.write(`relevant=${relevant}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
