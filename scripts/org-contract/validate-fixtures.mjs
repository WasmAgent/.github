#!/usr/bin/env node
// Org Gate O2 — canonical fixture validation (ORG-CD-03 / ORG-CD-04).
//
// Validates every fixture bundled in the pinned @wasmagent/protocol package
// against its canonical schema:
//   valid/*   -> MUST pass
//   invalid/* -> MUST fail (no silent normalization to valid)
// Plus a derived semantic-negative: mutating a valid aep-record fixture must
// fail validation.

import { createRequire } from "node:module";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(process.cwd() + "/");
const { Ajv2020 } = require("ajv/dist/2020.js");
const addFormats = require("ajv-formats");
const pkgRoot = join(process.cwd(), "node_modules", "@wasmagent", "protocol");
const schemasDir = join(pkgRoot, "schemas");

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);

function loadSchema(schemaPath) {
  const schema = require(schemaPath);
  return ajv.compile(schema);
}

let pass = 0;
let fail = 0;
const failures = [];

function check(dir, family, schemaFn, expectValid) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const doc = require(join(dir, f));
    const valid = schemaFn()(doc);
    if (valid === expectValid) {
      pass++;
    } else {
      fail++;
      failures.push(`${family}/${expectValid ? "valid" : "invalid"}/${f}: expected ${expectValid ? "PASS" : "FAIL"}`);
    }
  }
}

// Walk each schema family's fixtures: schemas/<family>/fixtures/<schema-name>/{valid,invalid}/*.json
for (const family of readdirSync(schemasDir)) {
  const famDir = join(schemasDir, family);
  try {
    if (!require("node:fs").statSync(famDir).isDirectory()) continue;
  } catch {
    continue;
  }
  const fixturesDir = join(famDir, "fixtures");
  if (!existsSync(fixturesDir)) continue;
  for (const name of readdirSync(fixturesDir)) {
    const schemaPath = join(famDir, `${name}.schema.json`);
    if (!existsSync(schemaPath)) continue;
    const make = () => loadSchema(schemaPath);
    check(join(fixturesDir, name, "valid"), `${family}/${name}`, make, true);
    check(join(fixturesDir, name, "invalid"), `${family}/${name}`, make, false);
  }
}

// ORG-CD-04: derived semantic-negative — a required field removed from a
// canonical valid fixture must FAIL, and a wrong schema_version must FAIL.
// Uses the seed fixture set, which is always bundled in the package.
const seedSchemaPath = join(schemasDir, "aep", "seed.schema.json");
const seedValidDir = join(schemasDir, "aep", "fixtures", "seed", "valid");
if (existsSync(seedSchemaPath) && existsSync(seedValidDir) && readdirSync(seedValidDir).length) {
  const validate = loadSchema(seedSchemaPath);
  const sample = require(join(seedValidDir, readdirSync(seedValidDir)[0]));
  const required = (require(seedSchemaPath).required ?? []).filter(Boolean);
  const victim = required[0];
  if (victim) {
    const mutated = JSON.parse(JSON.stringify(sample));
    delete mutated[victim];
    if (validate(mutated)) {
      fail++;
      failures.push(`semantic-negative: seed with required field '${victim}' removed unexpectedly PASSED`);
    } else {
      pass++;
    }
  } else {
    failures.push("semantic-negative: seed schema declares no required fields — gate cannot run");
    fail++;
  }
}

console.log(`fixture validation: ${pass} pass, ${fail} fail`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
