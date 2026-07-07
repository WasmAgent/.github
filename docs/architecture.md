# Architecture

WasmAgent is an evidence-first stack for agent runs: protect execution,
record evidence, layer on trust artifacts, audit claims, and evaluate
adversarially. Each layer maps to a public repository.

## Overview

```mermaid
flowchart LR
    subgraph Runtime["Runtime Layer"]
        WM["wasmagent-js<br/>WebAssembly MCP Firewall"]
    end

    subgraph Workloads["Workload Layer"]
        BS["bscode<br/>Cloudflare Workers"]
        ER["erp-agent<br/>Domain Workloads"]
    end

    subgraph Evidence["Evidence Pipeline Layer"]
        TP["trace-pipeline<br/>AEP Ingestion & Storage"]
    end

    subgraph Trust["Trust Artifacts Layer"]
        ATI["agent-trust-infra<br/>AgentBOM • Posture • Passport"]
        OPS["wasmagent-ops<br/>Generators & CI/CD"]
    end

    subgraph Audit["Audit Layer"]
        OA["open-agent-audit<br/>Audit Reports"]
    end

    subgraph Eval["Evaluation Layer"]
        FA["fresharena<br/>Adversarial Evaluation"]
    end

    subgraph Org["Org Layer"]
        GH[".github<br/>Profile & Ledgers"]
    end

    WM --> BS
    WM --> ER
    BS --> TP
    ER --> TP
    TP --> ATI
    OPS --> ATI
    ATI --> OA
    OA --> FA
    FA --> TP

    GH -.-> BS
    GH -.-> ER
    GH -.-> TP
    GH -.-> ATI
    GH -.-> OA
    GH -.-> FA
```

## Layers

### Runtime — `wasmagent-js`

Sandboxes agent tools in WebAssembly behind an MCP firewall gated by
per-agent capability manifests. Emits signed Agent Evidence Protocol (AEP)
events for every tool call and capability escalation.

**Components:**
- MCP Firewall — restricts tool access based on capability manifests
- Capability Manifests — declare allowed tools and escalation paths
- AEP Event Signer — cryptographically signs all execution events

### Workloads — `bscode`

Reference coding-agent workload on Cloudflare Workers. Demonstrates the
runtime on a real product surface and exports AEP evidence.

**Components:**
- Code Editor interface backed by agent assistance
- AEP trace export for all agent interactions
- Cloudflare Workers deployment scaffold

### Evidence pipelines — `trace-pipeline`

Ingests AEP traces, applies paired-statistics checks as an evidence
admission gate for training data, and records every training run as
auditable evidence.

**Components:**
- AEP Ingestion — accepts and validates AEP event streams
- Paired-Statistics Gate — evidence quality filter for training data
- Evidence Store — auditable storage for all traces

### Trust artifacts — `agent-trust-infra`

Layers machine-readable identity and policy posture onto each run:

- **AgentBOM** — bill of materials for an agent (model, tools, dependencies).
- **MCP Posture** — declared and observed MCP surface and capabilities.
- **Trust Passport** — portable, verifiable run identity and posture.

These artifacts feed downstream audit and evaluation.

**Components:**
- AgentBOM Generator — extracts model, tools, and dependencies
- MCP Posture Verifier — validates declared vs. observed capabilities
- Trust Passport Issuer — creates portable run identity documents

### Ops Tooling — `wasmagent-ops`

Generators and CI/CD infrastructure for automated trust artifact creation.

**Components:**
- Trace→AgentBOM Generator — converts execution traces to AgentBOM
- AEP→Passport Generator — creates Trust Passports from AEP events
- CI/CD Pipeline — auto-generates artifacts on release

### Audit — `open-agent-audit`

Turns the full evidence chain plus trust artifacts into enterprise-readable
audit reports with regulatory mappings. Deployed at
[trustavo.com](https://trustavo.com).

**Components:**
- Evidence Chain Builder — assembles full execution history
- Regulatory Mapper — maps evidence to compliance frameworks
- Report Generator — produces human-readable audit reports

### Evaluation — `fresharena`

Closes the loop with dynamic, verifiable, adversarial evaluation of coding
agents. Results are themselves evidence and re-enter the pipeline, keeping
the runtime, evidence, and audit story grounded in real benchmark
performance.

**Components:**
- Adversarial Test Suite — challenging benchmarks for agent capability
- Verifiable Results — cryptographically verified evaluation outcomes
- Performance Benchmark — standardized metrics across agents

### Project home — `.github`

Org profile, public ledgers (claims, releases, media), and shared docs
(roadmap, architecture, evaluation summary).

**Components:**
- Project Index — machine-readable repo, role, and status registry
- Claims Ledger — public record of org claims
- Release Ledger — public release tracking
- Documentation — architecture, roadmap, evaluation summaries

## Component Diagram

```mermaid
flowchart TB
    subgraph Agents["Agent Execution"]
        A1["Claude Agent"]
        A2["Custom Agent"]
    end

    subgraph Runtime["wasmagent-js"]
        R1["MCP Firewall"]
        R2["Capability Manifests"]
        R3["AEP Event Signer"]
    end

    subgraph Workloads["Workloads"]
        W1["bscode<br/>Coding Agent"]
        W2["erp-agent<br/>Domain Workload"]
    end

    subgraph Pipeline["trace-pipeline"]
        P1["AEP Ingestion"]
        P2["Paired-Statistics Gate"]
        P3["Evidence Store"]
    end

    subgraph TrustInfra["agent-trust-infra"]
        T1["AgentBOM Generator"]
        T2["MCP Posture Verifier"]
        T3["Trust Passport Issuer"]
    end

    subgraph OpsTools["wasmagent-ops"]
        O1["Trace→AgentBOM"]
        O2["AEP→Passport"]
        O3["CI/CD Pipeline"]
    end

    subgraph Audit["open-agent-audit"]
        AU1["Evidence Chain Builder"]
        AU2["Regulatory Mapper"]
        AU3["Report Generator"]
    end

    subgraph Evaluation["fresharena"]
        E1["Adversarial Test Suite"]
        E2["Verifiable Results"]
        E3["Performance Benchmark"]
    end

    subgraph Org[".github"]
        G1["Project Index"]
        G2["Claims Ledger"]
        G3["Release Ledger"]
        G4["Documentation"]
    end

    A1 --> R1
    A2 --> R1
    R1 --> R2
    R2 --> R3
    R3 --> W1
    R3 --> W2

    W1 --> P1
    W2 --> P1
    P1 --> P2
    P2 --> P3

    P3 --> T1
    P3 --> T2
    P3 --> T3
    P3 --> O1
    P3 --> O2

    O1 --> T1
    O2 --> T3
    O3 --> T1
    O3 --> T3

    T1 --> AU1
    T2 --> AU1
    T3 --> AU1
    P3 --> AU1

    AU1 --> AU2
    AU2 --> AU3

    AU3 --> E1
    P3 --> E1
    E1 --> E2
    E2 --> E3
    E3 --> P1

    W1 -.-> G4
    W2 -.-> G4
    T1 -.-> G1
    T2 -.-> G1
    AU3 -.-> G2
    O3 -.-> G3
```

## Data Flow

```mermaid
sequenceDiagram
    participant Agent as Agent
    participant Runtime as wasmagent-js
    participant Workload as Workload
    participant Pipeline as trace-pipeline
    participant Trust as agent-trust-infra
    participant Audit as open-agent-audit
    participant Eval as fresharena

    Agent->>Runtime: Request execution
    Runtime->>Runtime: Check capability manifest
    Runtime->>Workload: Execute with MCP firewall
    Workload->>Runtime: Return results
    Runtime->>Runtime: Sign AEP events
    Runtime->>Pipeline: Send AEP trace

    Pipeline->>Pipeline: Validate AEP format
    Pipeline->>Pipeline: Apply paired-statistics check
    Pipeline->>Pipeline: Store as evidence

    Pipeline->>Trust: Request trust artifacts
    Trust->>Trust: Generate AgentBOM
    Trust->>Trust: Verify MCP posture
    Trust->>Trust: Issue Trust Passport
    Trust->>Audit: Send evidence + artifacts

    Audit->>Audit: Build evidence chain
    Audit->>Audit: Map to regulations
    Audit->>Audit: Generate audit report

    Audit->>Eval: Trigger evaluation
    Eval->>Workload: Run adversarial tests
    Eval->>Pipeline: Submit evaluation results
    Pipeline->>Pipeline: Store evaluation as evidence
```

### Core Flow

1. `wasmagent-js` protects a run and emits AEP events.
2. Workloads such as `bscode` produce verifiable runtime traces.
3. `trace-pipeline` admits and stores those traces as evidence.
4. `agent-trust-infra` attaches AgentBOM, MCP Posture, and Trust Passport.
5. `open-agent-audit` renders the chain into audit reports.
6. `fresharena` evaluates agents adversarially; results re-enter step 3.

### Feedback Loop

Evaluation results from `fresharena` are themselves evidence and flow
back into `trace-pipeline`, creating a continuous improvement loop that
keeps the runtime, evidence, and audit story grounded in real benchmark
performance.

## Repository Relationships

```mermaid
flowchart LR
    subgraph Core["Core Stack"]
        direction TB
        WM["wasmagent-js"]
        TP["trace-pipeline"]
        ATI["agent-trust-infra"]
    end

    subgraph Workloads["Workloads"]
        BS["bscode"]
        ER["erp-agent"]
    end

    subgraph Support["Supporting Infrastructure"]
        OPS["wasmagent-ops"]
        OA["open-agent-audit"]
        FA["fresharena"]
    end

    subgraph Coordination["Coordination"]
        GH[".github"]
        CB["claude-bot"]
        CBG["claude-bot-go"]
    end

    WM --> BS
    WM --> ER
    BS --> TP
    ER --> TP
    TP --> ATI
    OPS --> ATI
    ATI --> OA
    OA --> FA
    FA --> TP

    GH -.-> BS
    GH -.-> ER
    GH -.-> TP
    GH -.-> ATI
    GH -.-> OA
    GH -.-> FA

    CB -.-> GH
    CBG -.-> GH
```

The `.github` repository serves as the coordination hub, maintaining
canonical documentation, public ledgers, and the project index that
all other repositories reference for consistency.
