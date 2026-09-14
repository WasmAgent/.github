/**
 * Runtime release/deploy provenance artifact — schema and validator (N2-P1-07).
 *
 * O4 historically inspected workflow text for substrings such as `sha256sum`
 * and `ref: ${{ github.sha }}`, which a dead or unrelated job could satisfy.
 * The structured workflow-graph validator lives in
 * check-release-provenance.mjs; this module defines and validates the
 * *runtime* evidence artifact a real publish/deploy (or dry-run) should emit.
 */

export const PROVENANCE_FORMAT = "wasmagent-release-provenance/v1";
export const HEX40 = /^[0-9a-f]{40}$/;
export const HEX64 = /^[0-9a-f]{64}$/;
export const OUTCOMES = ["published", "deployed", "dry-run", "skipped", "failed"];

export const PROVENANCE_REQUIRED_FIELDS = [
  "format",
  "source_sha",
  "workflow_sha",
  "lock_sha256",
  "toolchain",
  "artifact_digest",
  "test_run_ids",
  "publish_destination",
  "outcome",
];

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

/**
 * Validate a provenance artifact. Returns a list of problems (empty = ok).
 * `expectedSourceSha` (optional) pins the artifact to the source SHA the gate
 * observed — a mismatch is a failure (N2-PV-04).
 */
export function validateProvenance(doc, { expectedSourceSha } = {}) {
  const problems = [];
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return ["provenance artifact must be a JSON object"];
  }

  for (const field of PROVENANCE_REQUIRED_FIELDS) {
    if (!(field in doc)) problems.push(`missing required field: ${field}`);
  }

  if (doc.format !== PROVENANCE_FORMAT) {
    problems.push(`format must be "${PROVENANCE_FORMAT}", got ${JSON.stringify(doc.format)}`);
  }
  for (const field of ["source_sha", "workflow_sha"]) {
    if (field in doc && !HEX40.test(String(doc[field]))) {
      problems.push(`${field} must be a full 40-hex SHA`);
    }
  }
  if ("lock_sha256" in doc && !HEX64.test(String(doc.lock_sha256))) {
    problems.push("lock_sha256 must be a full 64-hex sha256");
  }
  if ("toolchain" in doc && !isNonEmptyString(doc.toolchain)) {
    problems.push("toolchain must be a non-empty string");
  }
  if ("artifact_digest" in doc && !isNonEmptyString(doc.artifact_digest)) {
    problems.push("artifact_digest must be a non-empty string (sha256 or npm integrity)");
  }
  if ("test_run_ids" in doc) {
    if (!Array.isArray(doc.test_run_ids) || doc.test_run_ids.length === 0) {
      problems.push("test_run_ids must be a non-empty array");
    } else if (!doc.test_run_ids.every(isNonEmptyString)) {
      problems.push("test_run_ids entries must be non-empty strings");
    }
  }
  if ("publish_destination" in doc && !isNonEmptyString(doc.publish_destination)) {
    problems.push("publish_destination must be a non-empty string");
  }
  if ("outcome" in doc && !OUTCOMES.includes(doc.outcome)) {
    problems.push(`outcome must be one of: ${OUTCOMES.join(", ")}`);
  }
  if (expectedSourceSha !== undefined && doc.source_sha !== expectedSourceSha) {
    problems.push(
      `source_sha ${JSON.stringify(doc.source_sha)} != expected publish source ${expectedSourceSha}`,
    );
  }
  return problems;
}
