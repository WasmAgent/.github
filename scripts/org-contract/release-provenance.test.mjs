import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { TARGETS, validateTarget } from "./check-release-provenance.mjs";
import { PROVENANCE_FORMAT, validateProvenance } from "./provenance.mjs";

const require = createRequire(import.meta.url);
const { parse } = require("yaml");

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

const NPM_VALID = `
name: Release
permissions:
  contents: read
jobs:
  preconditions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA_A}
      - run: bun install --frozen-lockfile
      - run: bun run check:all
  release:
    needs: preconditions
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@${SHA_A}
        with:
          ref: \${{ github.sha }}
      - run: sha256sum bun.lock
      - uses: changesets/action@${SHA_B}
        env:
          NPM_CONFIG_PROVENANCE: "true"
`;

const DEPLOY_VALID = `
name: Deploy
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@${SHA_A}
        with:
          ref: \${{ github.sha }}
      - run: bun install --frozen-lockfile
      - run: echo "state=not-configured" >> "$GITHUB_OUTPUT"
      - run: |
          echo "source_sha=\${GITHUB_SHA}"
          echo "bun_lock_sha256=$(sha256sum bun.lock | cut -d' ' -f1)"
`;

function npmVariant(transform) {
  return transform(NPM_VALID);
}

test("valid npm-publish workflow passes structured validation", () => {
  assert.deepEqual(validateTarget(TARGETS["open-agent-audit"], parse(NPM_VALID)), []);
});

test("N2-PV-01 digest in a dead/unrelated job does not satisfy publish", () => {
  const yaml = npmVariant((s) =>
    s
      .replace("      - run: sha256sum bun.lock\n", "")
      .replace(
        "jobs:\n",
        "jobs:\n  dead:\n    runs-on: ubuntu-latest\n    steps:\n      - run: sha256sum bun.lock\n",
      ),
  );
  const problems = validateTarget(TARGETS["open-agent-audit"], parse(yaml));
  assert.ok(problems.some((p) => p.includes("artifact-digest")), problems.join("; "));
});

test("N2-PV-02 unrelated needs does not satisfy the release dependency", () => {
  const yaml = npmVariant((s) =>
    s
      .replace("needs: preconditions", "needs: dead")
      .replace(
        "jobs:\n",
        "jobs:\n  dead:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
      ),
  );
  const problems = validateTarget(TARGETS["open-agent-audit"], parse(yaml));
  assert.ok(problems.some((p) => p.includes("must need preconditions")), problems.join("; "));
});

test("N2-PV-03 publish checkout on a moving ref fails", () => {
  const yaml = npmVariant((s) => s.replace("ref: \${{ github.sha }}", "ref: main"));
  const problems = validateTarget(TARGETS["open-agent-audit"], parse(yaml));
  assert.ok(problems.some((p) => p.includes("github.sha")), problems.join("; "));
});

test("O4: mutable action refs are rejected", () => {
  const yaml = npmVariant((s) => s.replace(`actions/checkout@${SHA_A}`, "actions/checkout@v4"));
  const problems = validateTarget(TARGETS["open-agent-audit"], parse(yaml));
  assert.ok(problems.some((p) => p.includes("mutable action ref")), problems.join("; "));
});

test("O4: write permissions outside the publish job are rejected", () => {
  const yaml = npmVariant((s) =>
    s.replace(
      "  preconditions:\n    runs-on: ubuntu-latest",
      "  preconditions:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write",
    ),
  );
  const problems = validateTarget(TARGETS["open-agent-audit"], parse(yaml));
  assert.ok(problems.some((p) => p.includes("has write permissions")), problems.join("; "));
});

test("O4: digest step after publish is rejected", () => {
  const yaml = npmVariant((s) =>
    s
      .replace("      - run: sha256sum bun.lock\n", "")
      .replace(
        '          NPM_CONFIG_PROVENANCE: "true"\n',
        '          NPM_CONFIG_PROVENANCE: "true"\n      - run: sha256sum bun.lock\n',
      ),
  );
  const problems = validateTarget(TARGETS["open-agent-audit"], parse(yaml));
  assert.ok(problems.some((p) => p.includes("artifact-digest")), problems.join("; "));
});

test("valid deploy workflow passes structured validation", () => {
  assert.deepEqual(validateTarget(TARGETS.bscode, parse(DEPLOY_VALID)), []);
});

test("N2-PV-05 deploy without provenance recording fails", () => {
  const yaml = DEPLOY_VALID.replace(
    '      - run: |\n          echo "source_sha=${GITHUB_SHA}"\n          echo "bun_lock_sha256=$(sha256sum bun.lock | cut -d\' \' -f1)"\n',
    "",
  );
  const problems = validateTarget(TARGETS.bscode, parse(yaml));
  assert.ok(problems.some((p) => p.includes("does not record deploy provenance")), problems.join("; "));
});

test("N2-PV-04 runtime provenance source SHA mismatch fails", () => {
  const valid = {
    format: PROVENANCE_FORMAT,
    source_sha: SHA_A,
    workflow_sha: SHA_B,
    lock_sha256: "c".repeat(64),
    toolchain: "bun 1.3.14",
    artifact_digest: "sha512-abc",
    test_run_ids: ["12345"],
    publish_destination: "npm:@wasmagent/aep",
    outcome: "published",
  };
  assert.deepEqual(validateProvenance(valid), []);
  assert.ok(
    validateProvenance(valid, { expectedSourceSha: SHA_B }).some((p) =>
      p.includes("expected publish source"),
    ),
  );
});

test("runtime provenance artifact rejects missing/invalid fields", () => {
  assert.ok(validateProvenance({}).length >= 8);
  assert.equal(validateProvenance("nope").length, 1);
  assert.ok(
    validateProvenance({
      format: PROVENANCE_FORMAT,
      source_sha: "short",
      workflow_sha: SHA_B,
      lock_sha256: "nothex",
      toolchain: "",
      artifact_digest: "",
      test_run_ids: [],
      publish_destination: "",
      outcome: "maybe",
    }).length >= 6,
  );
});
