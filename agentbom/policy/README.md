# agentbom/policy — WASM-native OPA/Rego evaluator

Reference artifact set for embedding a **WebAssembly-native Open Policy Agent
(OPA/Rego) evaluator** for inline runtime guardrail enforcement (Milestone 6).

> `agentbom/policy/`: Embed WebAssembly-native Open Policy Agent (OPA/Rego)
> evaluator for inline runtime guardrail enforcement

## What lives here

| File | Purpose |
|---|---|
| `guardrails.rego` | Sample Rego policy module (`package wasmagent.guardrails`) gating tool calls and evidence requirements inline. |
| `opa-evaluator-config.schema.json` | JSON Schema describing an OPA/Rego WASM evaluator configuration (wasm module, entrypoint, decision, fail-closed mode). |
| `opa-evaluator-config-sample.json` | Conformant sample evaluator configuration consumed by the e2e suite. |

## Embedding model

The evaluator is compiled to WASM once and embedded into the runtime:

```bash
opa build -t wasm -e wasmagent.guardrails/allow guardrails.rego
```

Every tool call / MCP request is then gated inline before execution:

```
request → OPA/Rego WASM evaluator → allow? → PROCEED / DENY (fail closed)
```

The `wasmagent-js` runtime (`wasmagent-js/runtime.ts`) exposes the inline
enforcement point through the `TrustPolicy.evaluate` hook: a tenant policy may
delegate its decision to the embedded OPA/Rego WASM evaluator, which receives
only the current tenant's request and returns an `{ allowed, reason }` decision.
Policy evaluation is untrusted code: a failure fails closed and never leaks
another tenant's state.

## Verify

```bash
go test -short ./tests/e2e/... -run OPA
```
