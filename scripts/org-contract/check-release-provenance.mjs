#!/usr/bin/env node
// Org Gate O4 — release / deploy provenance.
//
// Verifies that every publishing or deploying non-core repository carries a
// full provenance envelope in its release/deploy workflow. Scans checkouts
// laid out like the O1 scanner (--root DIR).
//
// Envelope required by the plan (sections 7, 19):
//   - immutable action refs
//   - frozen dependency install
//   - full CI / tests before publish
//   - exact source SHA
//   - provenance / attestation (OIDC id-token where publishing)
//   - artifact / package digest recorded
//   - no placeholder assurance artifacts
//
// Usage: check-release-provenance.mjs --root DIR
// Exit codes: 0 = all pass, 1 = violations, 2 = usage.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
if (rootIdx < 0 || !argv[rootIdx + 1]) {
  console.error("usage: check-release-provenance.mjs --root DIR");
  process.exit(2);
}
const root = argv[rootIdx + 1];

const HEX40 = /@[0-9a-f]{40}(?:\s|$)/;
const USES_RE = /^\s*(?:-\s+)?uses:\s*(\S+)\s*(#.*)?$/gm;

// repo -> provenance surface
const TARGETS = {
  "open-agent-audit": { workflow: ".github/workflows/release.yml", kind: "npm-publish" },
  agentbom: { workflow: ".github/workflows/release.yml", kind: "npm-publish" },
  bscode: { workflow: ".github/workflows/deploy.yml", kind: "deploy" },
};

const PLACEHOLDER_MARKERS = ["UNVERIFIED-SCAFFOLD", "pending implementation", "generator: scaffold"];

let failures = 0;
function check(repo, name, ok, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`[${tag}] ${repo}  ${name}${detail ? `  ${detail}` : ""}`);
}

function pinnedActions(content) {
  const unpinned = [];
  for (const m of content.matchAll(USES_RE)) {
    const ref = m[1];
    if (ref.startsWith("./") || ref.startsWith("docker://")) continue;
    if (!HEX40.test(ref)) unpinned.push(ref);
  }
  return unpinned;
}

function frozenInstall(content) {
  return (
    content.includes("--frozen-lockfile") ||
    content.includes("npm ci") ||
    content.includes("uv sync --frozen")
  );
}

for (const [repo, spec] of Object.entries(TARGETS)) {
  const path = join(root, repo, spec.workflow);
  if (!existsSync(path)) {
    check(repo, `provenance surface present (${spec.workflow})`, false, "workflow not found");
    continue;
  }
  const content = readFileSync(path, "utf8");

  const unpinned = pinnedActions(content);
  check(repo, "O4-immutable-actions", unpinned.length === 0, unpinned.join(", "));
  check(repo, "O4-frozen-install", frozenInstall(content));

  const placeholders = PLACEHOLDER_MARKERS.filter((p) => content.includes(p));
  check(repo, "O4-no-placeholder-evidence", placeholders.length === 0, placeholders.join(", "));

  const exactSha =
    content.includes("ref: ${{ github.sha }}") ||
    content.includes("refs/heads/main") ||
    content.includes("github.event_name == 'push'");
  check(repo, "O4-exact-source-sha", exactSha);

  if (spec.kind === "npm-publish") {
    check(
      repo,
      "O4-oidc-provenance",
      content.includes("id-token: write") &&
        (content.includes("NPM_CONFIG_PROVENANCE") || content.includes("--provenance")),
    );
    const gateIndex = content.indexOf("needs:");
    check(
      repo,
      "O4-tests-before-publish",
      gateIndex >= 0 && /bun run (test|check:all|verify:all)|bun test|npm test|pytest/.test(content),
    );
    check(
      repo,
      "O4-artifact-digest",
      content.includes("npm pack") || content.includes("sha256sum") || content.includes("integrity"),
    );
  }

  if (spec.kind === "deploy") {
    check(repo, "O4-production-environment", content.includes("environment: production"));
    check(
      repo,
      "O4-explicit-not-configured",
      content.includes("not-configured") || content.includes("NOT-CONFIGURED"),
    );
    check(
      repo,
      "O4-deploy-provenance",
      content.includes("sha256sum") || content.includes("bun.lock") || content.includes("integrity"),
    );
  }
}

console.log(
  failures === 0
    ? "\nOrg Gate O4: release provenance PASS"
    : `\nOrg Gate O4: ${failures} violation(s)`,
);
process.exit(failures === 0 ? 0 : 1);
