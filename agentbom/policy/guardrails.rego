# Reference guardrail policy for the WASM-native OPA/Rego evaluator.
#
# Compile to WASM for embedding:
#   opa build -t wasm -e wasmagent.guardrails/allow guardrails.rego

package wasmagent.guardrails

# Default: fail closed. A request that matches no allow rule is denied.
default allow := false

# An agent may invoke a tool only when the tool and its capability are
# declared in the AgentBOM posture for that agent.
allow {
    input.tool != ""
    input.declared_tools[input.tool]
    input.capability != ""
    input.declared_capabilities[input.capability]
}

# Data mutations additionally require signed AEP evidence so the runtime can
# record the operation for the compliance pipeline.
allow {
    input.action == "tool.call"
    input.tool == "data.write"
    input.has_aep_evidence == true
}
