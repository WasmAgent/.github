# WasmAgent Golden Path

End-to-end integration demo: **Protect → Record → Audit → Admit**

This is the org-level integration acceptance line. All core repos contribute one step.
If this demo runs end-to-end, the cross-repo contracts are compatible.

## What it demonstrates

```
[1/4] MCP firewall blocks a dangerous tool call        (wasmagent-js)
[2/4] Signed AEP evidence record generated             (wasmagent-js)
[3/4] Audit report verified against AEP evidence       (open-agent-audit)
[4/4] Trace admitted / rejected by pipeline            (trace-pipeline)
```

## Quick start

The runnable implementation lives in
[`agent-golden-path`](https://github.com/WasmAgent/agent-golden-path). The
`.github` copy is the **orchestration + exact-stack lock + expected vectors**
only:

```bash
git clone https://github.com/WasmAgent/agent-golden-path
cd agent-golden-path
bun install --frozen-lockfile
bun run test:e2e:certified
```

Org Gate O3 runs that same certified-stack E2E at the exact revision pinned in
[`versions.lock.json`](versions.lock.json).

## Ownership boundary (P2-02)

Do not maintain two independent implementations of the Golden Path.

| Concern | Owner |
|---|---|
| Exact stack lock (`versions.lock.json`), expected vectors, orchestration metadata, org attestations | **`.github/golden-path/`** |
| Runnable reference app, real E2E implementation, user-facing demo | **[`agent-golden-path`](https://github.com/WasmAgent/agent-golden-path)** |

`.github` owns the certified tuple and the gate; `agent-golden-path` owns the
executable artifact that the gate exercises.

## Status

The stack lock (`versions.lock.json`) is real and pins the certified core SHAs
plus the tested `agent-golden-path` revision. The E2E implementation is
exercised by Org Gate O3. `docker-compose.yml` and the shell scripts under
`scripts/` are thin local conveniences and are not part of the certified gate.

## Repository contributions

| Step | Repo | What it provides |
|---|---|---|
| Protect | `wasmagent-js` | `@wasmagent/mcp-firewall` — blocks malicious-call.json |
| Record | `wasmagent-js` | `@wasmagent/aep` — signs AEP evidence |
| Audit | `open-agent-audit` | `@openagentaudit/core` — verifies AEP, generates report |
| Admit | `trace-pipeline` | `evomerge admission-gate` — admission decision |
| Workload | `bscode` | `fixtures/bench-v0/` — safe and malicious call fixtures |
| Specs (optional) | `agentbom` | MCP Posture conformance fixtures (replaces archived agent-trust-infra) |
| Evaluation (optional) | `fresharena` | evaluation scenario |

## Files

```
golden-path/
  README.md           — this file
  versions.lock.json  — machine-readable pinned stack (certified core tuple + tested non-core SHA)
  docker-compose.yml  — local convenience stack for manual inspection
  scripts/
    bootstrap.sh      — local dependency/image bootstrap helper
    demo.sh           — local end-to-end demo wrapper
  fixtures/
    safe-call.json        — example safe MCP tool call
    malicious-call.json   — example malicious MCP tool call
  expected/
    aep.json              — expected AEP structure
    audit-report.json     — expected audit report structure
    admission-decision.json — expected admission decision
  tests/
    golden-path.test.ts   — fixture/expected-vector sanity checks
```
