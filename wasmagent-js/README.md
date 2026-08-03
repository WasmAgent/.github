# wasmagent-js multi-tenant verification runtime

`runtime.ts` provides a dependency-free `MultiTenantVerificationRuntime` for
embedding verification in JavaScript agents. Register each tenant with its own
trust policy, then call `verify(tenantId, request, verifier)`.

Tenant policies, concurrency gates, audit logs, and agent indexes are isolated
per tenant. A tenant concurrency limit queues only that tenant; verification in
other tenants remains concurrent. Policy checks fail closed, and audit-log
access is scoped to the requested tenant and, when supplied, agent.

```ts
import { MultiTenantVerificationRuntime } from "./runtime";

const runtime = new MultiTenantVerificationRuntime();
runtime.registerTenant("acme", {
  id: "acme-default",
  allowedActions: ["tool.call"],
  requiredCapabilities: ["network.read"],
  maxConcurrentVerifications: 8,
});

const result = await runtime.verify("acme", {
  agentId: "agent-7",
  action: "tool.call",
  capabilities: ["network.read"],
});
// result.decision === "PROCEED"
```

## SPIFFE/SPIRE identity driver

`spiffe/spiffe.ts` provides a dependency-free `SpiffeIdentityDriver` that binds
Wasm sandbox workloads to enterprise mTLS credentials (Milestone 6). The driver
fetches X.509-SVIDs and JWT-SVIDs from the SPIRE Workload API, watches for SVID
rotation, and exposes the active certificate chain + private key as mTLS
client/server credential material. The Workload API transport is pluggable so
tests can simulate SVID issuance and rotation without a live SPIRE agent.

```ts
import { SpiffeIdentityDriver } from "./spiffe/spiffe";

const driver = new SpiffeIdentityDriver({
  workloadApiAddress: "unix:///run/spire/sockets/agent.sock",
  selectors: [{ type: "k8s", value: "ns:payroll" }],
});
const bundle = await driver.connect();
// bundle.x509Svid.certChain + bundle.x509Svid.privateKey
// feed the mTLS handshake for the sandbox workload's SPIFFE identity.
```
