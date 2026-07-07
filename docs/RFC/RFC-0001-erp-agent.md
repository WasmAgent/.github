# RFC-0001: erp-agent — bscode sibling for ERP/business-API agents

| Field | Value |
|-------|-------|
| Status | Draft |
| Author | @telleroutlook |
| Created | 2025-01-01 |
| Discussion | [wasmagent-js#8](https://github.com/WasmAgent/wasmagent-js/issues/8) |
| Affects | wasmagent-js, bscode, trace-pipeline |

## Summary

Proposes a fourth repository in the WasmAgent ecosystem — `erp-agent`
— positioned as a **sibling** of `bscode` rather than a replacement.
The two reference apps share the same runtime (`wasmagent-js`) and
data factory (`trace-pipeline`); they differ only in their tools,
verifiers, and target deployment surface.

The thesis: the wasmagent flywheel is **task-agnostic by design**.
`bscode` is the first reference app (coding); ERP / business-API
agents are a different vertical with materially different economics
and a much weaker public data baseline. Adding a sibling proves the
task-agnostic claim and opens a market with stronger willingness
to pay than coding tools.

This is a **scoping RFC**: it asks for agreement on the structure
and the boundary between "what lives in the new repo" vs. "what gets
upstreamed into wasmagent-js / aep / trace-pipeline". It is not yet
a build plan.

## Why this is structurally possible

The current ecosystem already separates task-agnostic primitives
from task-specific glue, even though we've only ever instantiated
one task (coding via bscode). The split:

| Layer | Repo | Task-agnostic? |
|-------|------|----------------|
| WASM runtime, model adapters, ranking, AEP emitter | `wasmagent-js` | yes |
| MCP firewall, gateway, taint, consent, lease | `wasmagent-js` | yes |
| Compliance verifier framework + repair planner | `wasmagent-js` | mostly — verifier interface is task-agnostic; concrete verifiers are not |
| AEP record schema (v0.2, v0.3 in wasmagent-js#7) | `wasmagent-js` | yes |
| `validate-aep`, `trust-score`, `audit-report` | `trace-pipeline` | yes |
| `TrainingDataExporter` (SFT / DPO / PPO / router records) | `trace-pipeline` | yes |
| Cloudflare worker shell, auth, session, KV, rate-limit, rollout-adapter | `bscode` | mostly — could be lifted to a template |
| Concrete tools (`fs_write`, `bash`, `read_file`, ...) | `bscode` | **task-specific** |
| Concrete verifiers (`BuildPassesVerifier`, `VisualAssertVerifier`) | `wasmagent-js` (lib) + `bscode` (adapter) | **task-specific** |

Concretely, `packages/core/src/agents/verifiers/types.ts:38-44` already
declares the `verify_method` field as an **open string union** — built-ins
are listed for autocomplete, but applications can register custom kinds via
`VerificationPipeline.register()`. The docstring explicitly says:

> This keeps the protocol product-agnostic — bscode's "build_passes" or a
> CI's "lighthouse_score_min" verifier registers without touching WasmAgent
> core.

ERP-specific verifiers (`order_state_machine_valid`, `ledger_balanced`,
`permission_boundary_respected`, ...) fit the same registration pattern.
Nothing in the runtime needs to know they exist.

## Proposed structure

```
erp-agent/                                ← new sibling repo
├── apps/
│   ├── worker/                           ← runtime shell (mirrors bscode)
│   │   ├── src/
│   │   │   ├── tools/                    ← ERP-specific tools
│   │   │   │   ├── odoo-xmlrpc.ts
│   │   │   │   ├── netsuite-suiteql.ts
│   │   │   │   ├── sap-odata.ts
│   │   │   │   └── domain-glossary.ts
│   │   │   ├── verifiers/                ← ERP-specific verifiers
│   │   │   │   ├── order-state-verifier.ts
│   │   │   │   ├── ledger-balance-verifier.ts
│   │   │   │   ├── permission-boundary-verifier.ts
│   │   │   │   └── dual-write-consistency-verifier.ts
│   │   │   ├── rollout-adapter.ts        ← mirrors bscode pattern
│   │   │   ├── trajectoryExport.ts       ← AEP emission, mirrors bscode
│   │   │   ├── auth.ts
│   │   │   ├── mcp.ts                    ← gateway mounted at /mcp
│   │   │   └── ...
│   │   └── package.json                  ← depends on @wasmagent/* via npm
│   └── web/                              ← operator approval UI (optional)
├── .githooks/                            ← same pre-push hook
├── docs/
│   └── BRANCH_PROTECTION.md              ← pointer to wasmagent-js canon
└── README.md
```

The shared-with-bscode surface is roughly:

- `apps/worker/src/app.ts` (Hono app skeleton)
- `apps/worker/src/middleware/auth.ts`, `rateLimit.ts`
- `apps/worker/src/config/productionGuard.ts`
- `apps/worker/src/build-results.ts` → renamed to `verifier-results.ts`
- `apps/worker/src/rollout-adapter.ts`
- `apps/worker/src/trajectoryExport.ts`
- `apps/worker/scripts/test-aep-roundtrip.ts`

The diff-from-bscode surface is:

- `apps/worker/src/tools/` (all ERP API SDK wrappers + governance metadata)
- `apps/worker/src/verifiers/` (domain logic — the moat)
- `apps/worker/src/policies/` (lease shapes specific to financial/order side-effects)

## Verifier taxonomy

Coding verifiers operate on **deterministic build artifacts**
(`exitCode === 0`). ERP verifiers operate on **business-state invariants**
which are mostly post-condition checks against the target system's API.

| Verifier family | What it checks | Example |
|-----------------|----------------|---------|
| **State machine** | Did the entity transition through a legal state edge? | `quote → sales_order` requires `customer.credit_status == "ok"` |
| **Ledger / balance** | Do debits == credits across the affected accounts? | After AP voucher post: AP↑, Cash↓ or Expense↑, sum balanced |
| **Dual-write consistency** | If the agent wrote to two systems, do they agree? | Salesforce `Opportunity.amount` == NetSuite `Estimate.totalAmount` |
| **Permission boundary** | Did the call respect the principal's role / segment / region? | Buyer in EMEA cannot approve PO over €5k without VP sign-off |
| **Idempotency** | Did a retry produce the same observable effect? | Two POSTs with the same idempotency-key → one row, not two |
| **Audit-trail completeness** | Did the underlying ERP create the expected audit records? | Approval action → `audit_log` row with principal + reason |
| **Schema-drift detection** | Did the response still match the contract we trained on? | NetSuite added a field; prompt template now drifts |

The first four are the high-value moat; the last three are defensive. All
seven plug into `VerificationPipeline.register()` exactly like
`BuildPassesVerifier` does today.

## Compatibility with AEP v0.2 / v0.3

ERP tool calls map cleanly onto the current AEP record shape and benefit
from the v0.3 additions (wasmagent-js#7) more than coding does:

| AEP v0.3 field | Why it matters more for ERP than for coding |
|----------------|---------------------------------------------|
| `side_effect_class` | Coding: read vs write vs network. ERP: read vs **financial-mutate** vs network-egress-to-third-party. Distinction is regulatory. |
| `state_digest_kind: "db-rowset"` + coverage descriptor | Pre/post digest over an explicit table + row predicate is exactly the shape an ERP post-condition verifier needs. |
| `argument_drift` | A model that "approves PO #1234" then drifts to "approves PO #5678" is a real bug class in production. |
| `approval_mode: "bounded-lease"` | Natural shape for "this agent can post journal entries in cost-centre X for the next 60 minutes, up to 10 entries, total ≤ $50k". |
| `deny_reason_class: "missing-delegation"` | Maps directly to SoD (segregation-of-duties) violations in financial controls. |

No new AEP schema needs to be invented for ERP. The v0.3 RFC fields work
as-is. This is the strongest argument that the architecture is task-agnostic
in practice, not just in slides.

## Training-data strategy

Coding has abundant public training signal (SWE-bench, MBPP, HumanEval,
IFEval). ERP has near-zero — every customer's business rules, fields, and
permissions are different, and no one publishes training data over real
ledger data.

### Opportunity

Training records produced by an ERP agent operating under real business
constraints are scarce by definition. They are the moat that bscode-derived
coding data cannot be.

### Constraint

You cannot fork-execute ERP API calls the way you can fork sandbox builds.
Every call has externally-visible side effects (or audit-log entries even if
"rolled back"). Three implications:

1. **Generation happens in production runs, not in synthetic sweeps.** A
   human operator + AI assistant produces one trajectory per real task.
   Trust-score gating and AEP signature verification become more important.

2. **Verifier-based reward, not fork ranking.** `RolloutForkRunner` doesn't
   fit. Instead, `RolloutSingleRunner` + verifier ensemble produces a labelled
   record. Routes more like RLHF-from-real-use than DPO-from-ranked-rollouts.

3. **Training stays close to customer data boundary.** Two acceptable shapes:
   - **Local training**: customer runs `trace-pipeline` inside their VPC,
     model weights never leave.
   - **Federated contribution**: customer opts in to share redacted training
     records (using AEP's existing `redaction_profile` field) in exchange for
     improved model weights.

### Provenance

`trace-pipeline/evomerge/schemas/training.py` already carries a
`Provenance.source: str` field on every `SftTrainingRecord` /
`DpoTrainingRecord`. bscode emits `source = "bscode-trajectory"`;
erp-agent would emit `source = "erp-agent-trajectory"` (or finer, e.g.
`"erp-agent-odoo"`).

Pooling decision matrix:

| Training stage | Pool bscode + erp-agent? |
|----------------|--------------------------|
| SFT — general capability (tool use, instruction following) | yes |
| SFT — domain reasoning | no (separate models) |
| DPO — "follow tool schema correctly" | yes |
| DPO — "right answer" | no |
| Router training (which task → which capability) | yes |
| Verifier ensemble for trust score | yes (each verifier reports independently) |

## Choice of first ERP target

| Target | Pro | Con |
|--------|-----|-----|
| **Odoo** (open source, XML-RPC + REST) | Source-available; testable locally; large SME market | Less brand presence with enterprise procurement |
| **NetSuite SuiteQL** | Strong mid-market; reasonable API; query-rich | Account access expensive; auth (TBA) tedious |
| **SAP S/4 OData** | Largest TAM; API is well-typed | Sandbox access locked behind partner agreements; long sales cycle |

**Proposed first target: Odoo.** Reasons:
- Lowest friction to set up a real test environment (Docker Compose).
- Open source means the schema and the SDKs are public.
- SME segment best fits an MIT-licensed reference app.
- Once Odoo proves the pattern, SAP/NetSuite adaptation is mostly a
  different SDK call inside the same `tools/` shape.

## What needs to change in existing repos

Mostly nothing. The reference design is "drop a new sibling repo, depend on
the same npm packages, define your own tools and verifiers." Concrete
required changes:

1. **`wasmagent-js`** — optionally extract `apps/worker` from bscode into a
   reusable template package (`@wasmagent/worker-template`). **Not blocking**
   the erp-agent PoC; quality-of-life refactor for future siblings.

2. **`wasmagent-js/packages/aep`** — no schema change beyond what v0.3
   (wasmagent-js#7) already proposes.

3. **`trace-pipeline`** — no schema change. Add an entry to the documented
   list of recognised `Provenance.source` values (documentation only).

4. **`docs/architecture.md`** (this repo) — update the diagram to show two
   reference apps under the same runtime + data factory.

5. **`docs/BRANCH_PROTECTION.md`** — extend the scope sentence to include the
   new repo.

## Phased rollout

### Phase 1 — Architecture lock (1 week, this RFC's scope)

- Agree on the structure proposed here (or its revisions in comments).
- Pick first ERP target.
- Decide whether to extract `@wasmagent/worker-template` now or later.
  (Recommendation: later — copy bscode first; extract once the pattern is
  proven across two repos.)

No code changes.

### Phase 2 — PoC (≤ 4 weeks)

- Stand up `erp-agent` repo, mirror bscode's worker structure.
- Implement 3–5 Odoo tools (read partner, read invoice, create quote, update
  customer, read journal entry).
- Implement 2–3 verifiers (`order_state_machine_valid`,
  `customer_field_consistency`, `permission_boundary_respected`).
- Run one end-to-end loop and produce the first ERP training record
  (`Provenance.source = "erp-agent-odoo"`).

Success criterion: one verified ERP training record.

### Phase 3 — 1–2 paying customers (3–6 months)

- Recruit two design-partner customers (one Odoo, one larger ERP).
- Local-training shape: customer runs `trace-pipeline` inside their VPC.
- Federated-contribution shape: customer opts in to share redacted SFT/DPO
  records in exchange for improved adapter weights.

Success criterion: a verified ERP-domain DPO record set that outperforms a
coding-only-trained baseline on the customer's own held-out tasks.

## Risks

1. **Verifier-development cost.** ERP verifiers need domain experts.
   Mitigation: start with permission-boundary and idempotency verifiers
   (cheap, general); take state-machine and ledger verifiers as a learning
   curve.

2. **Customers won't share ledger data even if anonymized.** Mitigation:
   lead with local-training; treat federated contribution as opt-in upside.

3. **A bad PoC could damage the bscode story.** Mitigation: clear labelling
   (erp-agent is experimental); separate maturity tiers in the org README;
   don't cross-link until erp-agent is beta.

4. **Engineering bandwidth.** Mitigation: Phase 2 is ≤ 4 weeks of one
   contributor's time, ~80% copy-paste from bscode.

## Non-goals

- Not a generic "ERP integration platform" (Mulesoft / Boomi / Tray.io
  territory). The point is **agent training data**, not integration plumbing.
- Not a hosted SaaS product.
- Not a Salesforce / Workday / SAP partner integration.
- Not changing the AEP v0.3 design to accommodate ERP.

## Open questions

1. **`@wasmagent/worker-template` — extract now or later?**
2. **First ERP target — Odoo (recommended) or NetSuite?**
3. **Verifier ownership** — `@wasmagent/erp-verifiers` as an npm package in
   wasmagent-js, or kept inside `erp-agent` until a third consumer needs it?
4. **Repo visibility** — public from day one or private until PoC is
   presentable?
5. **Domain expert recruiting** — does this RFC's acceptance imply a hiring
   commitment?
6. **AEP v0.3 ERP feedback loop** — should the PoC instrument and report
   v0.3-coverage findings back to wasmagent-js#7?

## Related

- AEP v0.3 RFC: wasmagent-js#7
- Verifier interface: `packages/core/src/agents/verifiers/types.ts`
- bscode rollout adapter: `apps/worker/src/rollout-adapter.ts`
- Trace-pipeline provenance: `evomerge/schemas/training.py`
- Ecosystem diagram: `docs/architecture.md` (this repo)
