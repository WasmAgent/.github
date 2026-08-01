# Milestones

## Milestone 1 — Trust Artifact Reference Implementations

- [ ] `agentbom/`: Ship reference implementation for all three artifact types (AgentBOM, MCP Posture, Trust Passport)
- [ ] `agentbom/cli`: CLI emits valid AgentBOM JSON for any agent run (`agentbom --run-id <id> --output agentbom.json`)
- [ ] `agentbom/`: MCP Posture verification passes against sample agent manifest (`verify-posture --manifest examples/manifest.yaml`)
- [ ] `agentbom/`: Trust Passport export includes signed AEP events (`passport export --format json --include-aep`)
- [ ] `docs/`: Publish trust artifact spec docs with JSON schema validation (`docs/trust-artifacts.md` with embedded schema)
- [ ] `tests/`: Integration test suite passes for all three artifact types (`npm run test:trust-artifacts`)

## Milestone 2 — ERP Workload & Domain Expansion ✅ (via agent-golden-path)

The ERP-domain reference workload originally scoped as `erp-agent` (RFC-0001) is
fulfilled by [`agent-golden-path`](https://github.com/WasmAgent/agent-golden-path),
a runnable procurement copilot proving the full provable-agent chain end to end.
The literal `verify-order` / `verify-ledger` CLIs from the erp-agent design were
not carried forward; the domain is proven through compliance + budget guardrails +
signed AEP evidence instead.

- [x] Public ERP-domain workload repository lands (`agent-golden-path`, MIT, public)
- [x] AEP evidence export working for ERP operations (signed AEP records over the procurement flow)
- [x] `docs/project-index.json`: includes the ERP-domain workload as `status: shipped`, `category: workload`
- [x] Domain end-to-end test suite passes (`bun test` — compliance / budget / AEP+OAA chain, 4/4)

## Milestone 3 — Ops Tooling & Generator Infrastructure

- [ ] `wasmagent-ops/generators/`: AgentBOM generator from execution traces (`generate-agentbom --trace-file trace.jsonl`)
- [ ] `wasmagent-ops/generators/`: Trust Passport generator from AEP events (`generate-passport --aep-file events.jsonl`)
- [ ] `wasmagent-ops/`: CI/CD pipeline updates to auto-generate trust artifacts on release
- [ ] `docs/architecture.md`: Complete architecture documentation with component diagrams
- [ ] `.github/`: Organization profile page renders product matrix from canonical asset URL
- [ ] `wasmagent-ops/tests`: Generator test suite validates output against schemas (`npm run test:generators`)

## Milestone 4 — Integration Validation & Launch Readiness

- [ ] `tests/e2e/`: End-to-end test suite validates full pipeline (workload → evidence → trust artifacts)
- [ ] `wasmagent-js/`: Runtime integration test passes with `bscode` and `agent-golden-path` workloads
- [ ] `trace-pipeline/`: Evidence admission gate validates and admits test workload evidence
- [ ] `docs/evaluation-summary.md`: Published evaluation metrics across all components
- [ ] `releases/`: Public ledger populated with 1.0 release entries for all core repos
- [ ] `docs/`: All documentation links validated with no broken references
- [ ] `README.md`: Canonical paths documented and verified reachable (product matrix SVG, project index JSON)

## Milestone 5 — Distributed Trust Network & Multi-Domain Ecosystem

- [ ] `trust-network/`: Public registry launches for agent identity and artifact discovery (discovery.trust.wasmagent.dev)
- [x] `wasmagent-js/`: Multi-tenant verification runtime supports concurrent agent isolation with per-tenant trust policies
- [ ] `healthcare-agent/`: Healthcare domain workload lands with HIPAA-compliant evidence collection and PHI-audit trails
- [ ] `devops-agent/`: DevOps domain workload with deployment verification and infrastructure-as-code evidence capture
- [ ] `finance-agent/`: Finance domain workload with SOX compliance controls and transaction-replay verification
- [ ] `agentbom/`: Trust propagation protocol enables artifact chaining across domain boundaries (AgentBOM → AgentBOM)
- [ ] `wasmagent-ops/`: Continuous verification daemon monitors running agents and alerts on trust-policy violations
- [ ] `docs/`: Domain workload authoring guide with templates for new vertical-specific agents and verifier patterns
- [ ] `wasmagent-js/`: Policy-as-code framework enables declarative trust rules (e.g., "require AEP events for all data mutations")
- [ ] `trust-network/`: Public explorer renders live trust graph showing agent relationships and artifact provenance
- [ ] `docs/project-index.json`: Updated with three new domain agents and trust-network registry
- [ ] `tests/`: Cross-domain integration tests validate trust artifact propagation and policy enforcement boundaries
