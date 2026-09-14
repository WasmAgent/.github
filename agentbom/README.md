# agentbom — reference implementation of the three trust artifact types

A dependency-free Go reference implementation of the three WasmAgent trust
artifact types shipped by [Milestone 1](../docs/15-milestones.md):

| Artifact | JSON format marker | Purpose |
|---|---|---|
| `AgentBOM` | `bomFormat: "AgentBOM"` | Versioned bill of materials for an agent (runtime, tools, model, dependencies) |
| `MCPPosture` | `postureFormat: "MCPPosture"` | Declared MCP surface and capability envelope (servers, tools, allowed operations, restricted paths) |
| `TrustPassport` | `passportFormat: "TrustPassport"` | Portable, verifiable bundle: identity, posture snapshot, signed evidence references, trust score |

The JSON shapes mirror the canonical fixtures in `tests/e2e/fixtures/` and the
JSON Schemas referenced by their `$schema` fields
(`https://wasmagent.github.io/agent-trust-infra/schemas/`).

## Usage

```go
package main

import (
	"fmt"

	"github.com/WasmAgent/.github/agentbom"
)

func main() {
	// Code-generated reference samples for all three artifact types.
	bom := agentbom.NewReferenceAgentBOM()
	posture := agentbom.NewReferenceMCPPosture()

	// Validate any artifact against the reference schema.
	if err := agentbom.Validate(bom); err != nil {
		panic(err)
	}

	// Link an AgentBOM + MCP Posture into a Trust Passport.
	passport, err := agentbom.BuildTrustPassport(
		agentbom.PassportIdentity{
			AgentID:   "github.com/WasmAgent/golden-path-agent",
			Version:   "1.0.0",
			Timestamp: "2026-07-07T00:00:00Z",
		},
		bom,
		posture,
		[]agentbom.EvidenceRef{
			{Type: "AEP", Location: "evidence/events.jsonl", Signature: "ed25519:..."},
		},
		0.95,
	)
	if err != nil {
		panic(err)
	}
	fmt.Println(passport.TrustScore)
}
```

## API

- `ParseAgentBOM`, `ParseMCPPosture`, `ParseTrustPassport` — parse and
  validate a JSON document for the respective artifact type.
- `Validate(artifact)` — validate any of the three artifact types against its
  reference schema.
- `NewReferenceAgentBOM`, `NewReferenceMCPPosture`,
  `NewReferenceTrustPassport` — code-generated reference samples.
- `BuildTrustPassport(identity, bom, posture, evidence, trustScore)` — the
  reference chain: derives a Trust Passport that is consistent with a
  validated AgentBOM and MCP Posture.

All artifact types implement `Validate() error`. The package has no external
dependencies and is safe to embed in generators, CI gates, or downstream
tooling.

## Tests

```bash
cd agentbom
go test ./...
```

The test suite covers all three artifact types: reference-sample validity,
JSON round-trips, schema rejection cases, conformance against the canonical
`tests/e2e/fixtures/` documents, and the `BuildTrustPassport` chain.
