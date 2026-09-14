#!/usr/bin/env node
// Consumer manifest loader for Org Gate O2b.
//
// Usage:
//   consumers.mjs --tsv           repo | build | install | command | packages(csv)
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
    // Fields are separated by "|" (a non-whitespace delimiter) so that an empty
    // field such as an empty `build` is preserved by `IFS='|' read`. A tab
    // delimiter would be collapsed by the shell, shifting every later field.
    for (const c of consumers) {
      const fields = [c.repo, c.build ?? "", c.install, c.command, (c.packages ?? []).join(",")];
      for (const field of fields) {
        if (field.includes("|")) {
          console.error(`consumers.mjs: field contains the '|' delimiter: ${JSON.stringify(field)}`);
          return 1;
        }
      }
      process.stdout.write(fields.join("|") + "\n");
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
