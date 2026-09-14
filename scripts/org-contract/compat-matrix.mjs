#!/usr/bin/env node
// Pre-merge compatibility matrix loader.

import { readFileSync } from "node:fs";

export const MATRIX_PATH = "scripts/org-contract/compat-matrix.json";

export function loadMatrix(path = MATRIX_PATH) {
  return JSON.parse(readFileSync(path, "utf8")).targets;
}

function main(argv) {
  const [flag, repo] = argv;
  const targets = loadMatrix();
  if (flag === "--repos") {
    process.stdout.write(Object.keys(targets).join("\n") + "\n");
    return 0;
  }
  if (flag === "--kind" && repo) {
    const t = targets[repo];
    if (!t) {
      console.error(`no compat target for ${repo}`);
      return 1;
    }
    process.stdout.write(`${t.kind}\n`);
    return 0;
  }
  console.error("usage: compat-matrix.mjs --repos | --kind <repo>");
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
