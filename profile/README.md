# WasmAgent

Verifiable evidence and security control plane for AI agents and MCP-based
tool use.

## Projects

| Repository | Role |
|---|---|
| [wasmagent-js](https://github.com/WasmAgent/wasmagent-js) | Embedded agent runtime — WASM sandbox, MCP firewall, capability manifests, AEP emitter |
| [bscode](https://github.com/WasmAgent/bscode) | Reference coding-agent workload on Cloudflare Workers; AEP evidence export |
| [trace-pipeline](https://github.com/WasmAgent/trace-pipeline) | Trace → training-data pipeline; eval trust audit toolkit |
| [open-agent-audit](https://github.com/WasmAgent/open-agent-audit) | Open evidence format and Cloudflare-native audit toolkit |
| [wasmagent](https://github.com/WasmAgent/wasmagent) | Project home — roadmap, claim registry, release ledger |

## Product matrix

![WasmAgent product matrix](https://raw.githubusercontent.com/WasmAgent/wasmagent/main/assets/product-matrix.webp)

A single runtime (`wasmagent-js`) emits AEP records from real workloads
(`bscode`, and future workloads such as `erp-agent`). Two downstream pipelines
consume the same AEP JSONL: `trace-pipeline` produces training data, and
`open-agent-audit` produces audit evidence.

> The image shows the intended product matrix. `erp-agent` is a roadmap
> workload and not yet a public repository.

## Disclaimer

Repositories in this organization produce **technical evidence** and
research tooling. They do not provide legal advice, regulatory
certification, or compliance determinations.
