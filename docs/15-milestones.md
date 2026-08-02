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

{
  "milestone": "## Milestone 6 — Runtime Trust Enforcement & Multi-Agent Accountability\n\n- [ ] `agentbom/`: Add runtime verification API (`validateRuntimeBehavior`) that compares observed tool calls and permission usage against an AgentBOM, returning a signed accountability record\n- [ ] `wasmagent-js/`: Ship a trust enforcement middleware for `bscode` and `agent-golden-path` so every tool invocation is checked against the current AgentBOM before execution\n- [ ] `trace-pipeline/`: Extend the evidence admission gate to support continuous compliance polling, alerting on BOM drift during long-running agent sessions\n- [ ] `agentbom-cli`: Add `verify-drift` command that takes a trace file and declares whether runtime behavior matches the AgentBOM, outputting a machine-readable diff\n- [ ] `docs/architecture.md`: Document the runtime enforcement pipeline with sequence diagrams for pre-tool-call checks, drift detection, and revocation flows\n- [ ] `wasmagent-ops/`: Publish a reusable GitHub Action (`verify-agent`) that enforces trust artifact schema validation and attestation presence in downstream CI pipelines\n- [ ] `claims/`: Launch a public “trusted agent registry” containing signed AgentBOMs and performance/behavior attestations for all org-owned workloads\n- [ ] `agentbom/`: Add support for composite (federated) AgentBOMs that aggregate sub-agent BOMs with dependency and permission-boundary validation\n- [ ] `releases/`: Publish versioned, signed compliance policy packs (SOC2, ISO27001, EU AI Act) as reusable artifacts for consistent verification across agents\n- [ ] `tests/e2e/`: Add a multi-agent end-to-end test verifying that a planner agent and executor agent exchange BOMs and refuse unauthorized tool delegation\n- [ ] `docs/`: Publish a security threat model for runtime trust enforcement, covering TOCTOU, privilege escalation, and replay attacks"
}

## Milestone 6 — Distributed Agent Mesh & Continuous Attestation

- [ ] `wasmagent-ops/federation/`: Control plane for multi-cluster agent mesh synchronization and cross-domain attestation (`wasmagent-mesh sync --peers mesh-peers.yaml`)
- [ ] `aep/zk-proofs/`: Zero-Knowledge (ZK-SNARK) attestation exporter for privacy-preserving AEP evidence verification (`passport prove --privacy-mode zk`)
- [ ] `agentbom/policy/`: Embed WebAssembly-native Open Policy Agent (OPA/Rego) evaluator for inline runtime guardrail enforcement
- [ ] `wasmagent-js/spiffe/`: SPIFFE/SPIRE cryptographic identity driver binding Wasm sandbox workloads to enterprise mTLS credentials
- [ ] `trace-pipeline/stream/`: Real-time gRPC telemetry and event ingestion pipeline for instant posture drift detection and passport revocation
- [ ] `wasmagent/edge/`: Low-latency WasmAgent edge runtime supporting offline evidence buffering and eventual ledger synchronization
- [ ] `agent-golden-path/multi-agent/`: Multi-agent procurement federation workload (buyer copilot ↔ supplier copilot) under signed AEP contracts
- [ ] `wasmagent-ops/resilience/`: Automated circuit breaker and transactional rollback mechanism triggered on policy violation events
- [ ] `docs/federation-spec.md`: Complete cross-domain agent federation protocol and ZK attestation architecture specification
- [ ] `tests/mesh/`: End-to-end integration test suite validating multi-agent attestation, ZK evidence verification, and real-time revocation (`npm run test:mesh`)

## Milestone 6 — Continuous Real-Time Attestation & Federated Trust Mesh

- [ ] `wasmagent-runtime/attestation`: Implement streaming WebSocket/gRPC attestation service emitting live AEP event proofs during agent execution loops (`wasmagent serve-attestation --port 9090`)
- [ ] `agentbom/federation`: Integrate Decentralized Identifier (DID) and Verifiable Credential (VC) support into Trust Passports for cross-organizational verification (`passport verify-did --did did:wasm:agent123`)
- [ ] `wasmagent-ops/operator`: Ship Kubernetes Admission Controller (`wasmagent-operator`) to enforce AgentBOM posture and MCP policy gates at container admission (`kubectl apply -f deploy/operator.yaml`)
- [ ] `agentbom/lineage`: Add multi-agent nested delegation tracking to AgentBOM schemas with cryptographic graph visualizer (`agentbom export-graph --trace-id <id> --format svg`)
- [ ] `trace-pipeline/zk`: Introduce Zero-Knowledge proof verification adapter for AEP evidence, enabling compliance auditing without revealing proprietary payload data (`zk-verify --proof proof.json --schema aep-v1`)
- [ ] `wasmagent-js/guardrails`: Implement active runtime policy auto-tightening and automatic sandboxing upon detecting MCP posture drift (`wasmagent-js --enforce-drift-policy`)
- [ ] `wasmagent-ops/telemetry`: Export OpenTelemetry traces and Prometheus compliance metrics for enterprise agent fleet observability (`wasmagent-telemetry --metrics-port 9090`)
- [ ] `docs/federated-trust.md`: Publish cross-domain trust mesh specification detailing AEP evidence federation and multi-tenant ledger synchronization (`docs/federated-trust.md`)
- [ ] `tests/e2e/federation`: E2E test suite validating real-time attestation streams, lineage graph integrity, and cross-repo compliance verification (`bun test:federation`)
