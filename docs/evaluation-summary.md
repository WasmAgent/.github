# Evaluation summary

How WasmAgent decides whether an agent — or a benchmark claim about an agent —
is trustworthy. Evaluation is itself evidence: it must be recorded, verifiable,
and re-usable.

## Principles

1. **Benchmarks are claims.** A score is a hypothesis, not a fact.
2. **Adversarial over cherry-picked.** Dynamic tasks resist overfitting and
   memorization better than static suites.
3. **Verifiable over asserted.** Every run produces traces that can be
   re-checked by `trace-pipeline`.
4. **Paired statistics.** Comparisons report effect size and uncertainty,
   not just headline accuracy.

## Where evaluation lives

- `fresharena` — dynamic, verifiable, adversarial evaluation protocol for
  coding agents. Generates tasks, runs agents under `wasmagent-js`, and emits
  AEP evidence into `trace-pipeline`.
- `trace-pipeline` — admits evaluation runs as evidence and records them in
  the training-audit log.
- `agent-trust-infra` — attaches AgentBOM, MCP Posture, and Trust Passport to
  each evaluated run so results bind to a specific, reproducible
  configuration.

## Feedback loop

Evaluation results are not a leaderboard endpoint. They re-enter the evidence
chain, where they inform training-data admission (`trace-pipeline`), audit
reporting (`open-agent-audit`), and trust posture (`agent-trust-infra`). This
keeps the runtime, evidence, and audit story grounded in measured behavior.
