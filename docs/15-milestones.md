# Milestones

## Milestone 1 — Trust Artifact Reference Implementations

- [ ] `agent-trust-infra/`: Ship reference implementation for all three artifact types (AgentBOM, MCP Posture, Trust Passport)
- [ ] `agent-trust-infra/cli`: CLI emits valid AgentBOM JSON for any agent run (`agent-trust-cli --run-id <id> --output agentbom.json`)
- [ ] `agent-trust-infra/`: MCP Posture verification passes against sample agent manifest (`verify-posture --manifest examples/manifest.yaml`)
- [ ] `agent-trust-infra/`: Trust Passport export includes signed AEP events (`passport export --format json --include-aep`)
- [ ] `docs/`: Publish trust artifact spec docs with JSON schema validation (`docs/trust-artifacts.md` with embedded schema)
- [ ] `tests/`: Integration test suite passes for all three artifact types (`npm run test:trust-artifacts`)

## Milestone 2 — ERP Workload & Domain Expansion

- [ ] `erp-agent/`: Public repository lands with Cloudflare Workers deployment scaffold
- [ ] `erp-agent/`: Order-state verifier implemented and tested (`verify-order --state-file orders.json`)
- [ ] `erp-agent/`: Ledger verifier implemented and tested (`verify-ledger --ledger-path /ledger/operations.csv`)
- [ ] `erp-agent/`: AEP evidence export working for ERP operations (`erp-agent --export-aep --output evidence.jsonl`)
- [ ] `docs/project-index.json`: Updated to include `erp-agent` with `status: "public"` and `layer: "workloads"`
- [ ] `erp-agent/tests`: Domain-specific test suite passes (`npm run test:domain`)

## Milestone 3 — Ops Tooling & Generator Infrastructure

- [ ] `wasmagent-ops/generators/`: AgentBOM generator from execution traces (`generate-agentbom --trace-file trace.jsonl`)
- [ ] `wasmagent-ops/generators/`: Trust Passport generator from AEP events (`generate-passport --aep-file events.jsonl`)
- [ ] `wasmagent-ops/`: CI/CD pipeline updates to auto-generate trust artifacts on release
- [ ] `docs/architecture.md`: Complete architecture documentation with component diagrams
- [ ] `.github/`: Organization profile page renders product matrix from canonical asset URL
- [ ] `wasmagent-ops/tests`: Generator test suite validates output against schemas (`npm run test:generators`)

## Milestone 4 — Integration Validation & Launch Readiness

- [ ] `tests/e2e/`: End-to-end test suite validates full pipeline (workload → evidence → trust artifacts)
- [ ] `wasmagent-js/`: Runtime integration test passes with `bscode` and `erp-agent` workloads
- [ ] `trace-pipeline/`: Evidence admission gate validates and admits test workload evidence
- [ ] `docs/evaluation-summary.md`: Published evaluation metrics across all components
- [ ] `releases/`: Public ledger populated with 1.0 release entries for all core repos
- [ ] `docs/`: All documentation links validated with no broken references
- [ ] `README.md`: Canonical paths documented and verified reachable (product matrix SVG, project index JSON)

## Milestone 5 — Distributed Trust Network & Multi-Domain Ecosystem

- [ ] `trust-network/`: Public registry launches for agent identity and artifact discovery (discovery.trust.wasmagent.dev)
- [ ] `wasmagent-js/`: Multi-tenant verification runtime supports concurrent agent isolation with per-tenant trust policies
- [ ] `healthcare-agent/`: Healthcare domain workload lands with HIPAA-compliant evidence collection and PHI-audit trails
- [ ] `devops-agent/`: DevOps domain workload with deployment verification and infrastructure-as-code evidence capture
- [ ] `finance-agent/`: Finance domain workload with SOX compliance controls and transaction-replay verification
- [ ] `agent-trust-infra/`: Trust propagation protocol enables artifact chaining across domain boundaries (AgentBOM → AgentBOM)
- [ ] `wasmagent-ops/`: Continuous verification daemon monitors running agents and alerts on trust-policy violations
- [ ] `docs/`: Domain workload authoring guide with templates for new vertical-specific agents and verifier patterns
- [ ] `wasmagent-js/`: Policy-as-code framework enables declarative trust rules (e.g., "require AEP events for all data mutations")
- [ ] `trust-network/`: Public explorer renders live trust graph showing agent relationships and artifact provenance
- [ ] `docs/project-index.json`: Updated with three new domain agents and trust-network registry
- [ ] `tests/`: Cross-domain integration tests validate trust artifact propagation and policy enforcement boundaries
