#!/usr/bin/env node
// Consumer manifest loader for Org Gate O2b.
//
// Usage:
//   consumers.mjs --tsv           repo \t install \t command \t packages(csv)
//   consumers.mjs --repos         one repo per line
//   consumers.mjs --excluded      one excluded repo per line

import { readFileSync } from "node:fs";

export const CONSUMERS_PATH = "scripts/org-contract/consumers.json";

export function loadConsumers(path = CONSUMERS_PATH) {
  return JSON.parse(readFileSync(path, "utf8")).consumers;
}

export function loadExcluded(path = CONSUMERS_PATH) {
  return JSON.parse(readFileSync(path, "utf8")).excluded ?? [];
}

function main(argv) {
  const [flag] = argv;
  const consumers = loadConsumers();
  if (flag === "--tsv") {
    for (const c of consumers) {
      process.stdout.write(
        [c.repo, c.build ?? "", c.install, c.command, (c.packages ?? []).join(",")].join("\t") + "\n",
      );
    }
    return 0;
  }
  if (flag === "--repos") {
    process.stdout.write(consumers.map((c) => c.repo).join("\n") + "\n");
    return 0;
  }
  if (flag === "--excluded") {
    process.stdout.write(loadExcluded().map((c) => c.repo).join("\n") + "\n");
    return 0;
  }
  console.error("usage: consumers.mjs --tsv | --repos | --excluded");
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
