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
