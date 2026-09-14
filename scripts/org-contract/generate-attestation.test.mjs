import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ATTESTATION_FORMAT, buildAttestation } from "./generate-attestation.mjs";
import { LOCKFILE_PATHS, loadStackLock, requiredNonCoreRepos } from "./stack-lock.mjs";

function materializeRoot(lock, content = "lock-bytes") {
  const root = mkdtempSync(join(tmpdir(), "org-attest-"));
  for (const repo of Object.keys(lock.non_core)) {
    const rel = LOCKFILE_PATHS[repo];
    const abs = join(root, repo, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

test("builds an exact-tuple v2 attestation from the real lock", () => {
  const lock = loadStackLock();
  const root = materializeRoot(lock);
  const attestation = buildAttestation({
    lock,
    root,
    gateSha: "0".repeat(40),
    runId: 12345,
    generatedAt: "2026-09-14T00:00:00.000Z",
  });

  assert.equal(attestation.format, ATTESTATION_FORMAT);
  assert.equal(attestation.core_target, lock.aep_certified_target);
  assert.deepEqual(Object.keys(attestation.repositories).sort(), requiredNonCoreRepos());
  for (const repo of requiredNonCoreRepos()) {
    assert.match(attestation.repositories[repo].sha, /^[0-9a-f]{40}$/);
    assert.equal(attestation.repositories[repo].lock_sha256.length, 64);
    assert.ok(attestation.repositories[repo].gates_exercised.length > 0);
  }
});

test("fails when a gate-consumed repo is not pinned", () => {
  const lock = loadStackLock();
  const mutated = { ...lock, non_core: { ...lock.non_core } };
  delete mutated.non_core.symkernel;
  assert.throws(
    () =>
      buildAttestation({
        lock: mutated,
        root: materializeRoot(lock),
        gateSha: "0".repeat(40),
        generatedAt: "2026-09-14T00:00:00.000Z",
      }),
    /symkernel/,
  );
});

test("fails when a pinned repo's lockfile is missing from the checkout", () => {
  const lock = loadStackLock();
  const root = mkdtempSync(join(tmpdir(), "org-attest-empty-"));
  assert.throws(
    () => buildAttestation({ lock, root, gateSha: "0".repeat(40) }),
    /missing lockfile/,
  );
});
