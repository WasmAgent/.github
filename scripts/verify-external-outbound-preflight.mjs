#!/usr/bin/env node
// External outbound technical preflight (validator).
//
// Verifies evidence/external-outbound/*.json preflight records against real
// primary sources before a substantive external message is considered
// TECHNICALLY_READY:
//   1. structural validation against schemas/external-outbound-preflight.schema.json
//   2. artifact existence + exact registry expectations (npm / PyPI)
//   3. clean-install of the PUBLISHED artifact and replay of the exact
//      structured commands the message gives to external users
//   4. final GitHub PR / release-run / comment state
//   5. claim_refs against the existing public-claims / external-validation ledgers
//   6. any unresolved contradiction => HOLD
//
// Structured allowlisted checks only — the record never contains shell for
// the verifier to execute. TECHNICALLY_READY does NOT authorize posting:
// EXTERNAL_READY additionally requires explicit human approval from a
// non-bot maintainer, and even then the posting itself stays manual.
//
// Output contract:
//   TECHNICALLY_READY                       exit 0 (EXTERNAL_READY reported separately)
//   HOLD: <CODE>                            exit 1
//
// Usage:
//   node scripts/verify-external-outbound-preflight.mjs [record.json]
//   (no argument => every record under evidence/external-outbound/)

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluatePreflight } from "./external-outbound-preflight-core.mjs";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "external-outbound");
const LEDGER_FILES = {
  "public-claims": join(REPO_ROOT, "claims", "public-claims.yml"),
  "external-validation": join(REPO_ROOT, "evidence", "external-validation.json"),
};

// ---------------------------------------------------------------------------
// Structural validation (stdlib subset of the JSON Schema contract).
// ---------------------------------------------------------------------------

const MESSAGE_CLASSES = new Set([
  "release_enablement",
  "release_announcement",
  "install_instructions",
  "status_report",
  "rerun_request",
  "correction",
]);

export function structuralProblems(record) {
  const problems = [];
  const push = (cond, msg) => {
    if (!cond) problems.push(msg);
  };
  push(record && typeof record === "object" && !Array.isArray(record), "record must be a JSON object");
  if (problems.length) return problems;

  push(record.schema_version === 1, "schema_version must be 1");
  push(typeof record.id === "string" && /^[A-Z0-9]+(-[A-Z0-9]+)*-[0-9]{3,}$/.test(record.id), `invalid id ${JSON.stringify(record.id)}`);
  push(record.target && typeof record.target.repository === "string" && record.target.repository.length > 0, "target.repository required");
  push(MESSAGE_CLASSES.has(record.message_class), `invalid message_class ${JSON.stringify(record.message_class)}`);
  push(Array.isArray(record.artifacts), "artifacts must be an array");
  for (const a of record.artifacts ?? []) {
    push(a && ["npm", "pypi"].includes(a.ecosystem), "artifact ecosystem must be npm|pypi");
    push(a && typeof a.package === "string" && a.package.length > 0, "artifact package required");
    push(a && typeof a.version === "string" && a.version.length > 0, "artifact version required");
  }
  push(Array.isArray(record.primary_sources), "primary_sources must be an array");
  for (const s of record.primary_sources ?? []) {
    push(s && typeof s.kind === "string", "primary_source needs kind");
    if (!s) continue;
    if (s.kind === "github_release_run") {
      push(typeof s.repository === "string" && s.repository.length > 0, `github_release_run source needs repository`);
      push(typeof s.run_id === "string" && s.run_id.length > 0, `github_release_run source needs run_id`);
    } else if (s.kind === "github_pr_state") {
      push(typeof s.repository === "string" && s.repository.length > 0, `github_pr_state source needs repository`);
      push(Number.isInteger(s.pr_number) && s.pr_number > 0, `github_pr_state source needs pr_number`);
    } else if (s.kind === "github_issue_comment") {
      push(typeof s.repository === "string" && s.repository.length > 0, `github_issue_comment source needs repository`);
      push(Number.isInteger(s.comment_id) && s.comment_id > 0, `github_issue_comment source needs comment_id`);
    } else {
      push(typeof s.ref === "string" && s.ref.length > 0, `primary_source ${s.kind} needs ref`);
    }
  }
  push(Array.isArray(record.command_replays), "command_replays must be an array");
  for (const r of record.command_replays ?? []) {
    push(r && typeof r.id === "string" && typeof r.kind === "string", `replay needs id + kind`);
    push(r && r.argv === undefined || Array.isArray(r.argv), `replay ${r?.id}: argv must be a string array`);
  }
  push(Array.isArray(record.claim_refs), "claim_refs must be an array");
  push(
    record.human_approval && record.human_approval.required === true && typeof record.human_approval.approved === "boolean",
    "human_approval {required: true, approved: bool} is mandatory",
  );
  // The exact outbound draft is mandatory — a ledger reference without the
  // message it authorizes cannot be claim-ceiling audited.
  push(
    record.outbound_message && typeof record.outbound_message.content === "string" && record.outbound_message.content.length > 0,
    "outbound_message.content (the exact draft) is mandatory",
  );
  if (typeof record.outbound_message?.sha256 === "string") {
    push(
      /^[0-9a-f]{64}$/.test(record.outbound_message.sha256) &&
        createHash("sha256").update(record.outbound_message.content ?? "").digest("hex") === record.outbound_message.sha256,
      "outbound_message.sha256 does not match content",
    );
  }
  // Replay ids must be unique: duplicate ids make check-result lookup
  // ambiguous (a later entry could shadow the identity an earlier one
  // verified).
  const seenReplayIds = new Set();
  for (const r of record.command_replays ?? []) {
    if (r && typeof r.id === "string") {
      push(!seenReplayIds.has(r.id), `duplicate replay id: ${r.id}`);
      seenReplayIds.add(r.id);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Adapters (each returns {ok, detail}; never throws).
// ---------------------------------------------------------------------------

/**
 * Secrets never reach the child processes that install/run record-named
 * packages: any env var whose name looks like a credential is stripped.
 * (gh calls need GH_TOKEN and are made with the unscrubbed process env.)
 */
export function sanitizeEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (/(TOKEN|SECRET|PASSWORD|KEY)$/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Packages on this list are allowed to run npm install scripts during the
 * clean-install replay. Empty by default and extended only by reviewed PR —
 * a data record can never open this door.
 */
export const INSTALL_SCRIPTS_ALLOWLIST = new Set();

function npmInstallArgs(spec) {
  const args = ["install", spec];
  const name = spec.startsWith("@") ? `@${spec.split("/")[1].split("@")[0]}` : spec.split("@")[0];
  if (!INSTALL_SCRIPTS_ALLOWLIST.has(name)) args.push("--ignore-scripts");
  return args;
}

/**
 * Executed replay commands must call a binary the target package actually
 * exposes: argv[0] must be one of the bin names the registry metadata
 * declares for that exact package@version. This keeps "structured checks
 * only" true at the executable level, not just the invocation level.
 */
export function execBinAllowlisted(argv, binKeys) {
  const head = argv?.[0];
  if (typeof head !== "string" || head.length === 0) return false;
  return binKeys.includes(head);
}

function sh(cmd, args, opts = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(cmd, args, { encoding: "utf8", ...opts }),
    };
  } catch (err) {
    return { ok: false, stdout: err.stdout ?? "", detail: `${cmd} ${args.join(" ")} failed: ${err.status ?? err.message}` };
  }
}

function npmView(spec, field) {
  const r = sh("npm", ["view", spec, ...(field ? [field] : [])]);
  return { ...r, value: r.ok ? r.stdout.trim() : null };
}

function pypiMetadata(pkg, version) {
  try {
    const res = spawnSync("curl", ["-sf", `https://pypi.org/pypi/${pkg}/${version}/json`], { encoding: "utf8" });
    if (res.status !== 0) return { ok: false, detail: `PyPI has no ${pkg} ${version}` };
    const data = JSON.parse(res.stdout);
    return { ok: data.info?.version === version, detail: data.info?.version !== version ? `PyPI serves ${data.info?.version}` : undefined };
  } catch (err) {
    return { ok: false, detail: `PyPI metadata fetch failed: ${err.message}` };
  }
}

function ghApi(path) {
  const r = sh("gh", ["api", path]);
  if (!r.ok) return r;
  try {
    return { ok: true, json: JSON.parse(r.stdout) };
  } catch (err) {
    return { ok: false, detail: `gh api returned non-JSON: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Replay execution against the published artifacts.
// ---------------------------------------------------------------------------

function gatherCheckResults(record) {
  const results = new Map();
  const set = (id, ok, detail) => results.set(id, { ok, detail });

  // --- artifacts: existence + exact expectations ----------------------------
  const artifactConflicts = [];
  let artifactsOk = true;
  for (const a of record.artifacts ?? []) {
    const spec = `${a.package}@${a.version}`;
    if (a.ecosystem === "npm") {
      const r = npmView(spec, "version");
      if (!r.ok || r.value !== a.version) {
        artifactsOk = false;
        set(`artifact:${a.ecosystem}:${spec}`, false, `npm registry does not serve ${spec}`);
        continue;
      }
      if (a.expect && "bin" in a.expect) {
        // Full metadata as JSON: `npm view <spec> bin --json` treats --json as
        // a second field name, but `npm view <spec> --json` is well-defined.
        const metaR = npmView(spec, "--json");
        let observed = null;
        try {
          observed = metaR.ok ? (JSON.parse(metaR.stdout || "null")?.bin ?? null) : null;
        } catch {
          observed = null;
        }
        const expected = a.expect.bin;
        if (JSON.stringify(observed) !== JSON.stringify(expected)) {
          artifactConflicts.push(
            `${spec}: message expects bin=${JSON.stringify(expected)}, registry serves ${JSON.stringify(observed)}`,
          );
        }
      }
      set(`artifact:npm:${spec}`, true);
    } else {
      const r = pypiMetadata(a.package, a.version);
      if (!r.ok) {
        artifactsOk = false;
        set(`artifact:${a.ecosystem}:${spec}`, false, r.detail ?? `PyPI does not serve ${spec}`);
      } else {
        set(`artifact:${a.ecosystem}:${spec}`, true);
      }
    }
  }
  results.set("__artifacts__", { ok: artifactsOk, artifacts: artifactConflicts });

  // --- structured replays ----------------------------------------------------
  // envs: replay id -> { dir, spec } of the clean environment (and the exact
  // package@version installed into it, for bin allowlisting).
  const envs = new Map();
  const binCache = new Map();
  const registryBinKeys = (spec) => {
    if (binCache.has(spec)) return binCache.get(spec);
    const metaR = npmView(spec, "--json");
    let keys = [];
    try {
      const bin = metaR.ok ? (JSON.parse(metaR.stdout || "null")?.bin ?? null) : null;
      keys = bin ? Object.keys(bin) : [];
    } catch {
      keys = [];
    }
    binCache.set(spec, keys);
    return keys;
  };
  const childEnv = sanitizeEnv();
  for (const replay of record.command_replays ?? []) {
    switch (replay.kind) {
      case "npm_metadata": {
        const r = npmView(`${replay.package}@${replay.version}`, "version");
        set(replay.id, r.ok && r.value === replay.version, r.ok ? undefined : r.detail ?? `registry does not serve ${replay.package}@${replay.version}`);
        break;
      }
      case "npm_clean_install": {
        const dir = mkdtempSync(join(tmpdir(), "aep-outbound-"));
        writePkgJson(dir);
        const spec = `${replay.package}@${replay.version}`;
        const r = sh("npm", npmInstallArgs(spec), { cwd: dir, env: childEnv });
        envs.set(replay.id, { dir, spec });
        set(replay.id, r.ok, r.detail);
        break;
      }
      case "npm_bin_exists": {
        const env = envs.get(replay.requires);
        if (!env) {
          set(replay.id, false, `requires missing clean-install ${replay.requires}`);
          break;
        }
        const bin = join(env.dir, "node_modules", ".bin", replay.bin_name);
        let ok = false;
        try {
          ok = statSync(bin).isFile();
        } catch {
          ok = false;
        }
        set(replay.id, ok, ok ? undefined : `${replay.bin_name} missing from node_modules/.bin`);
        break;
      }
      case "npm_exec": {
        const env = envs.get(replay.requires);
        if (!env) {
          set(replay.id, false, `requires missing clean-install ${replay.requires}`);
          break;
        }
        // Executable-level allowlist: argv[0] must be a bin the target
        // package actually exposes on the registry.
        const binKeys = registryBinKeys(env.spec);
        if (!execBinAllowlisted(replay.argv, binKeys)) {
          set(
            replay.id,
            false,
            `argv[0] ${JSON.stringify(replay.argv?.[0] ?? null)} is not a bin declared by ${env.spec} (declared: ${JSON.stringify(binKeys)})`,
          );
          break;
        }
        const args = ["--no-install", ...(replay.argv ?? [])];
        let r;
        try {
          const out = execFileSync("npx", args, { cwd: env.dir, encoding: "utf8", env: childEnv });
          r = { ok: true, stdout: out, status: 0 };
        } catch (err) {
          r = { ok: false, stdout: err.stdout ?? "", status: err.status ?? 1 };
        }
        const exitOk = r.status === (replay.expect_exit ?? 0);
        const contains = (replay.expect_stdout_contains ?? []).every((s) => r.stdout.includes(s));
        set(replay.id, exitOk && contains, exitOk && contains ? undefined : `exit=${r.status}, stdout=${JSON.stringify(r.stdout.slice(0, 400))}`);
        break;
      }
      case "pypi_metadata": {
        const r = pypiMetadata(replay.package, replay.version);
        set(replay.id, r.ok, r.detail);
        break;
      }
      case "pypi_clean_install": {
        const dir = mkdtempSync(join(tmpdir(), "aep-outbound-py-"));
        const venv = join(dir, "venv");
        let r = sh("python3", ["-m", "venv", venv], { env: childEnv });
        if (r.ok) {
          // Wheel-only, no dependency resolution: a version that ships only an
          // sdist would execute its build backend here — refuse instead (the
          // replay then HOLDs for manual review rather than building
          // candidate-named code).
          r = sh(
            join(venv, "bin", "pip"),
            ["install", "--only-binary=:all:", "--no-deps", `${replay.package}==${replay.version}`],
            { env: childEnv },
          );
        }
        envs.set(replay.id, { dir: venv, spec: `${replay.package}==${replay.version}` });
        set(replay.id, r.ok, r.detail);
        break;
      }
      case "github_release_run": {
        const repo = replay.repository ?? record.target.repository;
        const r = ghApi(`/repos/${repo}/actions/runs/${replay.run_id}`);
        const conclusion = r.ok ? r.json?.conclusion : null;
        set(replay.id, r.ok && conclusion === (replay.expect_conclusion ?? "success"), r.ok ? `run conclusion=${conclusion}` : r.detail);
        break;
      }
      case "github_pr_state": {
        const repo = replay.repository ?? record.target.repository;
        const r = ghApi(`/repos/${repo}/pulls/${replay.pr_number}`);
        const merged = r.ok ? r.json?.merged === true : false;
        set(replay.id, r.ok && (replay.expect_state ?? "merged") === "merged" ? merged : r.ok, r.ok ? `merged=${merged}` : r.detail);
        break;
      }
      case "github_issue_comment_exists": {
        const url = replay.comment_url ?? "";
        const m = url.match(/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/\d+#issuecomment-(\d+)/);
        if (!m) {
          set(replay.id, false, `unparseable comment url ${JSON.stringify(url)}`);
          break;
        }
        const r = ghApi(`/repos/${m[1]}/issues/comments/${m[2]}`);
        set(replay.id, r.ok && !!r.json?.html_url, r.ok ? undefined : r.detail);
        break;
      }
      case "claim_ref": {
        set(replay.id, true); // actual check happens against claim_refs below
        break;
      }
      default:
        set(replay.id, false, `unknown kind ${replay.kind}`);
    }
  }

  // Source-to-check semantic binding is enforced inside the core evaluator
  // (countVerifiedSources via sourceMatchesCheck), which reads
  // record.command_replays directly — no auxiliary result keys needed.

  return results;
}

function writePkgJson(dir) {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "aep-outbound-preflight", version: "0.0.0", private: true }, null, 2));
}

// ---------------------------------------------------------------------------
// Ledger index for claim_refs.
// ---------------------------------------------------------------------------

function loadLedgerIndex() {
  const claimIdsByLedger = new Map();
  // external-validation.json: plain JSON.
  try {
    const ledger = JSON.parse(readFileSync(LEDGER_FILES["external-validation"], "utf8"));
    claimIdsByLedger.set(
      "external-validation",
      new Set((ledger.records ?? []).map((r) => r.id)),
    );
  } catch {
    claimIdsByLedger.set("external-validation", new Set());
  }
  // public-claims.yml: text scan for list-item ids (the file's own validator
  // owns its deep grammar; we only need id existence).
  const ids = new Set();
  try {
    const text = readFileSync(LEDGER_FILES["public-claims"], "utf8");
    for (const m of text.matchAll(/^\s*-\s*id:\s*(\S+)/gm)) ids.add(m[1]);
  } catch {
    // leave empty
  }
  claimIdsByLedger.set("public-claims", ids);
  // Prohibited-claim tokens per external-validation record id — the ceiling
  // the exact outbound draft is audited against.
  const prohibitedByExtId = new Map();
  try {
    const ledger = JSON.parse(readFileSync(LEDGER_FILES["external-validation"], "utf8"));
    for (const r of ledger.records ?? []) {
      prohibitedByExtId.set(r.id, (r.prohibited_claims ?? []).map(String));
    }
  } catch {
    // leave empty
  }
  return { claimIdsByLedger, prohibitedByExtId };
}

/**
 * Integrity snapshot of the trust-authority files. The replayed external
 * bins execute AFTER the ledgers are read; a bin that mutates the ledgers in
 * the workspace must not be able to retroactively change what was audited —
 * and the mutation itself is a fail-closed HOLD.
 */
function snapshotLedgers() {
  const snapshots = new Map();
  for (const [ledger, path] of Object.entries(LEDGER_FILES)) {
    if (existsSync(path)) snapshots.set(ledger, readFileSync(path, "utf8"));
  }
  return snapshots;
}

function ledgersUnmutated(snapshots) {
  const problems = [];
  for (const [ledger, path] of Object.entries(LEDGER_FILES)) {
    const before = snapshots.get(ledger);
    const after = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (before !== after) {
      problems.push(`trust authority mutated during replay: ${path}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------

function verifyRecord(path) {
  let record;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { status: "HOLD", exitCode: 1, lines: [`HOLD: SCHEMA_INVALID — ${path}: ${err.message}`] };
  }

  const problems = structuralProblems(record);
  if (problems.length) {
    const lines = [`HOLD: SCHEMA_INVALID — ${path}`];
    for (const p of problems) lines.push(`  - ${p}`);
    return { status: "HOLD", exitCode: 1, lines };
  }

  // TOCTOU guard: snapshot the trust-authority files and build the ledger
  // index BEFORE any external executable from the record runs. The replayed
  // bins must not be able to influence what is audited, and any workspace
  // mutation they cause is itself a fail-closed HOLD.
  const ledgerIndex = loadLedgerIndex();
  const ledgerSnapshots = snapshotLedgers();

  const checkResults = gatherCheckResults(record);

  const mutationProblems = ledgersUnmutated(ledgerSnapshots);
  for (const p of mutationProblems) {
    checkResults.set(`__authority_integrity__`, { ok: false, detail: p });
  }
  if (mutationProblems.length) {
    checkResults.get("__artifacts__").ok = false;
  }

  const verdict = evaluatePreflight(record, checkResults, ledgerIndex);
  for (const p of mutationProblems) {
    verdict.holds.push({ code: "PRIMARY_SOURCE_CONFLICT", detail: p });
    verdict.status = "HOLD";
    verdict.notes = verdict.notes.filter((n) => !n.includes("HUMAN_APPROVAL"));
  }

  const lines = [];
  lines.push(`${verdict.status} — ${record.id} (${path})`);
  for (const note of verdict.notes) lines.push(`  ${note}`);
  for (const h of verdict.holds) lines.push(`  HOLD: ${h.code} — ${h.detail}`);
  return {
    status: verdict.status,
    humanApprovalRecorded: verdict.humanApprovalRecorded,
    exitCode: verdict.status === "TECHNICALLY_READY" ? 0 : 1,
    lines,
  };
}

function main(argv) {
  let paths;
  if (argv[0]) {
    paths = [argv[0]];
  } else if (existsSync(EVIDENCE_DIR)) {
    paths = readdirSync(EVIDENCE_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => join(EVIDENCE_DIR, f));
  } else {
    console.log("no external-outbound records — nothing to verify");
    return 0;
  }
  if (paths.length === 0) {
    console.log("no external-outbound records — nothing to verify");
    return 0;
  }

  let exit = 0;
  for (const p of paths) {
    const r = verifyRecord(p);
    for (const line of r.lines) console.log(line);
    if (r.exitCode !== 0) exit = 1;
  }
  return exit;
}

// Only auto-run when invoked as the CLI (importing this module — e.g. from
// the hostile regression tests — must not execute anything).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
