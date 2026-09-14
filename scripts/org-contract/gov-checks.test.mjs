import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectGovernanceCandidate,
  validateCandidateLock,
  validateCandidateManifests,
  validateCandidateWorkflows,
} from "./gov-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

function candidateCopy() {
  const dir = mkdtempSync(join(tmpdir(), "gov-cand-"));
  cpSync(REPO_ROOT, dir, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(REPO_ROOT.length).replace(/^[\\/]+/, "");
      const seg = rel.split(/[\\/]/);
      return seg[0] !== ".git" && seg[0] !== "node_modules";
    },
  });
  return dir;
}

function readUtf8(path) {
  return readFileSync(path, "utf8");
}

test("the trusted inspector accepts the current governance tree", () => {
  assert.deepEqual(inspectGovernanceCandidate(REPO_ROOT), []);
});

test("lock validation detects a missing gated repo", () => {
  const dir = candidateCopy();
  try {
    const lockPath = join(dir, "golden-path", "versions.lock.json");
    const lock = JSON.parse(readUtf8(lockPath));
    delete lock.non_core.symkernel;
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.ok(validateCandidateLock(dir).some((p) => p.includes("symkernel")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("manifest validation detects a narrowed compat matrix", () => {
  const dir = candidateCopy();
  try {
    const matrixPath = join(dir, "scripts", "org-contract", "compat-matrix.json");
    writeFileSync(matrixPath, JSON.stringify({ format: "x", targets: {} }));
    assert.ok(validateCandidateManifests(dir).some((p) => p.includes("missing pre-merge target")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("workflow validation rejects the broken reusable self-checkout ref", () => {
  const dir = candidateCopy();
  try {
    const reusable = join(dir, ".github", "workflows", "reusable-compat-check.yml");
    const text = readUtf8(reusable).replace(
      "ref: ${{ job.workflow_sha }}",
      "ref: ${{ github.job_workflow_sha }}",
    );
    writeFileSync(reusable, text);
    const problems = validateCandidateWorkflows(dir);
    assert.ok(problems.some((p) => p.includes("job.workflow_sha")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("workflow validation rejects a mutable action ref", () => {
  const dir = candidateCopy();
  try {
    const wf = join(dir, ".github", "workflows", "org-compat.yml");
    writeFileSync(
      wf,
      [
        "name: Broken",
        "on:",
        "  pull_request:",
        "permissions:",
        "  contents: read",
        "jobs:",
        "  x:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
      ].join("\n"),
    );
    assert.ok(validateCandidateWorkflows(dir).some((p) => p.includes("mutable action ref")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
