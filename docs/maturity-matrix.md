# Repository Maturity Matrix

Per-repo maturity, contract stability, and intended use.
Mirrors the status blocks in each repo's README. Update both when status changes.

Last updated: 2026-07-21

| Repository | Status | Contract stability | Recommended for | Not recommended for |
|---|---|---|---|---|
| `wasmagent-js` | Beta | Stable (`core`, `mcp-gateway`); Evolving (`compliance`, `attestation`) | Agent runtime protection, AEP evidence collection | Compliance certification claims |
| `open-agent-audit` | Beta | Stable (`schema`, `core`, `adapters`); Evolving (`passport`) | Enterprise audit trail, regulatory compliance evidence | Self-certified compliance without independent review |
| `trace-pipeline` | Experimental | Evolving | AEP validation, training-data admission, benchmark contamination audit | General observability platform; training framework |
| `bscode` | Reference Workload | Stable (evidence export API); Evolving (bench-v0 task set) | Golden Path integration testing; AEP evidence generation | Cursor/Claude Code replacement; general coding IDE |
| `agent-trust-infra` | Research Preview | Evolving | AgentBOM/MCP Posture spec implementers, conformance testing | Production deployments; Trust Passport (migrated to open-agent-audit) |
| `fresharena` | Research | Evolving | Solver rank-comparison experiments; dynamic evaluation research | Production compliance reporting; substitute for open-agent-audit |
| `wasmagent-proxy` | Experimental | Evolving | Gateway-level AEP evidence; Envoy/Istio/Kong sidecar | Endpoint-local MCP servers; general gateway RBAC/routing |
| `wasmagent-train-replay` | Experimental | Evolving | Distributed training audit; tamper-evident epoch evidence | General PyTorch profiling (use `fr_trace`); real-time monitoring |
| `symkernel` | Experimental | Unstable | WasmAgent-ecosystem CEL/wazero/Z3 verification | Standalone production policy engine |
| `.github` | Active | Stable (ledgers, assets); Evolving (Golden Path) | Org navigation, cross-repo integration testing, governance | Product-specific runtime code |

## Status definitions

| Status | Meaning |
|---|---|
| **Beta** | Functional and used in production contexts; specific documented limitations apply |
| **Reference Workload** | Stable reference implementation; not a general-purpose product |
| **Experimental** | Functional but API/schema may change without notice; use in production at your own risk |
| **Research Preview** | Research-grade; interfaces change without notice; not for production |
| **Research** | Active research project; results may change as experiments evolve |
| **Active** | Operational; content evolves but the repo's purpose is stable |

## Contract stability definitions

| Stability | Meaning |
|---|---|
| **Stable** | Breaking changes require major version bump and advance notice |
| **Evolving** | Fields may be added; breaking changes possible with minor notice |
| **Unstable** | API may change without notice |
