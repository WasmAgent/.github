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

## Quick start (target — not yet functional)

```bash
git clone https://github.com/WasmAgent/.github
cd .github/golden-path
docker compose up --build
./scripts/demo.sh
```

Or via CLI (future):

```bash
npx @wasmagent/cli demo trust-loop
```

## Status

🚧 **Scaffolded — not yet runnable.** Scripts are stubs; `versions.lock` pins are placeholders.

Tracked in: WasmAgent/.github issue [#103](https://github.com/WasmAgent/.github/issues/103)

## Repository contributions

| Step | Repo | What it provides |
|---|---|---|
| Protect | `wasmagent-js` | `@wasmagent/mcp-firewall` — blocks malicious-call.json |
| Record | `wasmagent-js` | `@wasmagent/aep` — signs AEP evidence |
| Audit | `open-agent-audit` | `@openagentaudit/core` — verifies AEP, generates report |
| Admit | `trace-pipeline` | `evomerge admission-gate` — admission decision |
| Workload | `bscode` | `fixtures/bench-v0/` — safe and malicious call fixtures |
| Specs (optional) | `agent-trust-infra` | conformance fixtures |
| Evaluation (optional) | `fresharena` | evaluation scenario |

## Files

```
golden-path/
  README.md           — this file
  versions.lock       — pinned compatible versions across repos
  docker-compose.yml  — (stub) one-command local stack
  scripts/
    bootstrap.sh      — (stub) install deps and pull images
    run-agent.sh      — (stub) run a bscode agent
    verify-aep.sh     — (stub) verify the signed AEP record
    audit.sh          — (stub) generate audit report
    admit.sh          — (stub) run admission decision
    demo.sh           — (stub) full end-to-end run
  fixtures/
    safe-call.json    — example safe MCP tool call
    malicious-call.json — example malicious MCP tool call
  expected/
    aep.json          — (placeholder) expected AEP structure
    audit-report.json — (placeholder) expected audit report structure
    admission-decision.json — (placeholder) expected admission decision
```
