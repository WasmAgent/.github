#!/usr/bin/env node
// Org Gate O4 — release / deploy provenance (N2-P1-07).
//
// Structured workflow-graph validation: parse the release/deploy workflow YAML
// and assert the real DAG and step properties. A dead or unrelated job that
// merely contains the right substrings no longer satisfies the gate.
//
// Validates, per target:
//   - immutable action refs (step-level and job-level)
//   - a known publish/deploy job
//   - the publish job `needs` the exact precondition job (not an unrelated job)
//   - the precondition job executes the test suite
//   - the publish job checks out the exact source SHA (`ref: ${{ github.sha }}`)
//   - write permissions are limited to the publish job
//   - frozen install occurs in a load-bearing job
//   - an artifact-digest step precedes the publish step
//   - npm provenance via OIDC (id-token: write + provenance flag)
//
// Runtime evidence (Level 2): --provenance FILE validates a real relayed
// artifact against scripts/org-contract/provenance.mjs. Static-only evidence
// must be reported as `release_workflow_static_policy`, never
// `release_provenance`.
//
// Usage: check-release-provenance.mjs --root DIR [--provenance FILE] [--expected-source-sha SHA]
// Exit codes: 0 = all pass, 1 = violations, 2 = usage.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { validateProvenance } from "./provenance.mjs";

const require = createRequire(import.meta.url);
let parse = null;
try {
  ({ parse } = require("yaml"));
} catch {
  parse = null;
}

export const TEST_RE = /bun run (test|check:all|verify:all)|bun test|npm test|pytest|turbo run test/;
export const FROZEN_RE = /--frozen-lockfile|npm ci|uv sync --frozen/;
export const DIGEST_RE = /npm pack|package-digests|sha256sum|integrity/;
const PINNED_REF_RE = /@[0-9a-f]{40}$/;

export const TARGETS = {
  "open-agent-audit": {
    workflow: ".github/workflows/release.yml",
    kind: "npm-publish",
    publishJob: "release",
    preconditionJob: "preconditions",
  },
  agentbom: {
    workflow: ".github/workflows/release.yml",
    kind: "npm-publish",
    publishJob: "release",
    preconditionJob: "preconditions",
  },
  bscode: {
    workflow: ".github/workflows/deploy.yml",
    kind: "deploy",
    deployJob: "deploy",
  },
};

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function stepUses(step) {
  return typeof step?.uses === "string" ? step.uses : "";
}

function stepRun(step) {
  return typeof step?.run === "string" ? step.run : "";
}

function jobSteps(job) {
  return Array.isArray(job?.steps) ? job.steps : [];
}

function jobPermissions(job) {
  return job && typeof job.permissions === "object" && !Array.isArray(job.permissions)
    ? job.permissions
    : {};
}

function jobRunsTests(job) {
  return jobSteps(job).some((s) => TEST_RE.test(stepRun(s)));
}

function jobHasFrozenInstall(job) {
  return jobSteps(job).some((s) => FROZEN_RE.test(stepRun(s)));
}

function jobCheckoutExact(job) {
  return jobSteps(job).some(
    (s) => stepUses(s).startsWith("actions/checkout@") && String(s.with?.ref ?? "") === "${{ github.sha }}",
  );
}

function isPublishStep(step) {
  const uses = stepUses(step);
  if (/changesets\/action@/.test(uses)) return true;
  const run = stepRun(step);
  return /(bunx |bun )?changeset publish|npm publish|release:publish/.test(run);
}

function digestBeforePublish(job) {
  const steps = jobSteps(job);
  const digestIdx = steps.findIndex((s) => DIGEST_RE.test(stepRun(s)));
  const publishIdx = steps.findIndex(isPublishStep);
  return digestIdx >= 0 && publishIdx >= 0 && digestIdx < publishIdx;
}

function jobMentionsProvenance(job) {
  return jobSteps(job).some(
    (s) => JSON.stringify(s.env ?? {}).includes("NPM_CONFIG_PROVENANCE") || stepRun(s).includes("--provenance"),
  );
}

function jobHasProvenanceRecording(job) {
  const runs = jobSteps(job).map(stepRun).join("\n");
  const uploadsProvenance = jobSteps(job).some((s) => String(s.with?.path ?? "").includes("provenance"));
  return (runs.includes("source_sha=") && /sha256sum|lock_sha256/.test(runs)) || uploadsProvenance;
}

export function pinnedActionProblems(doc) {
  const problems = [];
  for (const [jobName, job] of Object.entries(doc.jobs ?? {})) {
    const jobUses = typeof job?.uses === "string" ? job.uses : "";
    if (jobUses && !jobUses.startsWith("./") && !PINNED_REF_RE.test(jobUses)) {
      problems.push(`${jobName}: job-level reusable workflow ref is not pinned: ${jobUses}`);
    }
    for (const step of jobSteps(job)) {
      const uses = stepUses(step);
      if (!uses || uses.startsWith("./") || uses.startsWith("docker://")) continue;
      if (!PINNED_REF_RE.test(uses)) problems.push(`${jobName}: mutable action ref ${uses}`);
    }
  }
  return problems;
}

export function validateTarget(spec, doc) {
  const problems = [];
  const jobs = doc.jobs ?? {};
  problems.push(...pinnedActionProblems(doc));

  if (spec.kind === "npm-publish") {
    const pub = jobs[spec.publishJob];
    const pre = jobs[spec.preconditionJob];
    if (!pub) problems.push(`missing publish job: ${spec.publishJob}`);
    if (!pre) problems.push(`missing precondition job: ${spec.preconditionJob}`);

    if (pub && pre && !asArray(pub.needs).includes(spec.preconditionJob)) {
      problems.push(
        `publish job ${spec.publishJob} must need ${spec.preconditionJob} (needs: ${JSON.stringify(asArray(pub.needs))})`,
      );
    }
    if (pre && !jobRunsTests(pre)) {
      problems.push(`precondition job ${spec.preconditionJob} does not execute the test suite`);
    }
    if (pub) {
      if (!jobCheckoutExact(pub)) {
        problems.push(`publish job ${spec.publishJob} does not check out ref: \${{ github.sha }}`);
      }
      if (!digestBeforePublish(pub)) {
        problems.push(`publish job ${spec.publishJob} has no artifact-digest step preceding publish`);
      }
      const perms = jobPermissions(pub);
      if (perms["id-token"] !== "write") {
        problems.push(`publish job ${spec.publishJob} must grant id-token: write for OIDC provenance`);
      }
      if (!jobMentionsProvenance(pub)) {
        problems.push(`publish job ${spec.publishJob} does not enable npm provenance (NPM_CONFIG_PROVENANCE/--provenance)`);
      }
    }
    if (![pre, pub].some((j) => j && jobHasFrozenInstall(j))) {
      problems.push("no frozen install in the load-bearing (precondition/publish) job");
    }
    for (const [name, job] of Object.entries(jobs)) {
      const perms = jobPermissions(job);
      const hasWrite = ["contents", "pull-requests", "id-token", "packages"].some(
        (k) => perms[k] === "write",
      );
      if (hasWrite && name !== spec.publishJob) {
        problems.push(`job ${name} has write permissions; only ${spec.publishJob} may`);
      }
    }
  }

  if (spec.kind === "deploy") {
    const dep = jobs[spec.deployJob];
    if (!dep) {
      problems.push(`missing deploy job: ${spec.deployJob}`);
    } else {
      if (dep.environment !== "production") {
        problems.push(`deploy job ${spec.deployJob} must declare environment: production`);
      }
      if (!jobCheckoutExact(dep)) {
        problems.push(`deploy job ${spec.deployJob} does not check out ref: \${{ github.sha }}`);
      }
      if (!jobHasFrozenInstall(dep)) {
        problems.push(`deploy job ${spec.deployJob} does not perform a frozen install`);
      }
      const runs = jobSteps(dep).map(stepRun).join("\n");
      if (!runs.includes("not-configured")) {
        problems.push(`deploy job ${spec.deployJob} lacks an explicit not-configured/skipped path`);
      }
      if (!jobHasProvenanceRecording(dep)) {
        problems.push(`deploy job ${spec.deployJob} does not record deploy provenance (source SHA + lock/bundle digest)`);
      }
    }
  }

  return problems;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1];
    i++;
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.root) {
    console.error("usage: check-release-provenance.mjs --root DIR [--provenance FILE] [--expected-source-sha SHA]");
    return 2;
  }
  if (!parse) {
    console.error("FAIL release-provenance: the 'yaml' parser is not installed (set NODE_PATH to a dir containing yaml)");
    return 1;
  }

  let failures = 0;
  const record = (repo, name, ok, detail = "") => {
    if (!ok) failures++;
    console.log(`[${ok ? "PASS" : "FAIL"}] ${repo}  ${name}${detail ? `  ${detail}` : ""}`);
  };

  for (const [repo, spec] of Object.entries(TARGETS)) {
    const path = join(args.root, repo, spec.workflow);
    if (!existsSync(path)) {
      record(repo, `provenance surface present (${spec.workflow})`, false, "workflow not found");
      continue;
    }
    let doc;
    try {
      doc = parse(readFileSync(path, "utf8"));
    } catch (err) {
      record(repo, "workflow parses as YAML", false, err.message);
      continue;
    }
    const problems = validateTarget(spec, doc);
    record(repo, `structured ${spec.kind} provenance graph`, problems.length === 0, problems.join("; "));
  }

  if (args.provenance) {
    if (!existsSync(args.provenance)) {
      record("provenance-artifact", "artifact present", false, "file not found");
    } else {
      const doc = JSON.parse(readFileSync(args.provenance, "utf8"));
      const problems = validateProvenance(doc, {
        ...(args["expected-source-sha"] ? { expectedSourceSha: args["expected-source-sha"] } : {}),
      });
      record("provenance-artifact", "runtime provenance artifact", problems.length === 0, problems.join("; "));
    }
  }

  console.log(
    failures === 0
      ? "\nOrg Gate O4: release workflow policy PASS (static graph; see provenance artifact for runtime evidence)"
      : `\nOrg Gate O4: ${failures} violation(s)`,
  );
  return failures === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
