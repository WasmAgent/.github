import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateRequired, FAIL, PASS } from "./required-result.mjs";

function decide(changesResult, relevant, innerResult) {
  return evaluateRequired({ changesResult, relevant, innerResult });
}

// Hostile matrix from N4-P1-01 (N4-RC-01 .. N4-RC-08). The two PASS cases are
// the only states a required summary may accept; every other combination must
// fail closed, including the "heavy job never ran because detection broke" hole.

test("N4-RC-01 changes=success, relevant=true, inner=success -> PASS", () => {
  assert.equal(decide("success", "true", "success").status, PASS);
});

test("N4-RC-02 changes=success, relevant=false, inner=skipped -> PASS", () => {
  assert.equal(decide("success", "false", "skipped").status, PASS);
});

test("N4-RC-03 changes=failure, inner=skipped -> FAIL", () => {
  assert.equal(decide("failure", "", "skipped").status, FAIL);
});

test("N4-RC-04 changes=cancelled, inner=skipped -> FAIL", () => {
  assert.equal(decide("cancelled", "", "skipped").status, FAIL);
});

test("N4-RC-05 relevant=true, inner=skipped -> FAIL", () => {
  assert.equal(decide("success", "true", "skipped").status, FAIL);
});

test("N4-RC-06 relevant=true, inner=cancelled -> FAIL", () => {
  assert.equal(decide("success", "true", "cancelled").status, FAIL);
});

test("N4-RC-07 impossible state relevant=false + inner=success -> FAIL", () => {
  assert.equal(decide("success", "false", "success").status, FAIL);
});

test("N4-RC-08 missing relevance output -> FAIL", () => {
  assert.equal(decide("success", "", "skipped").status, FAIL);
  assert.equal(decide("success", undefined, "skipped").status, FAIL);
});

test("changes=skipped is not success -> FAIL", () => {
  assert.equal(decide("skipped", "false", "skipped").status, FAIL);
});

test("relevant=true + inner=failure -> FAIL", () => {
  assert.equal(decide("success", "true", "failure").status, FAIL);
});

test("unknown relevance value -> FAIL", () => {
  assert.equal(decide("success", "maybe", "success").status, FAIL);
  assert.equal(decide("success", "TRUE", "success").status, FAIL);
});
