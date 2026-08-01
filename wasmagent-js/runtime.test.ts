import { describe, expect, it } from "bun:test";

import { MultiTenantVerificationRuntime } from "./runtime";

const request = (agentId: string, action: string, capability: string) => ({
  agentId,
  action,
  capabilities: [capability],
});

const timeout = (milliseconds: number) =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timed out after ${milliseconds}ms`)), milliseconds),
  );

describe("MultiTenantVerificationRuntime", () => {
  it("isolates concurrency gates so another tenant can verify concurrently", async () => {
    const runtime = new MultiTenantVerificationRuntime();
    runtime.registerTenant("acme", {
      id: "acme-policy",
      allowedAgents: ["acme-agent"],
      allowedActions: ["read"],
      requiredCapabilities: ["db.read"],
      maxConcurrentVerifications: 1,
    });
    runtime.registerTenant("globex", {
      id: "globex-policy",
      allowedAgents: ["globex-agent"],
      allowedActions: ["write"],
      requiredCapabilities: ["db.write"],
      maxConcurrentVerifications: 1,
    });

    let acmeActive = 0;
    let maxAcmeActive = 0;
    let releaseAcme: () => void = () => undefined;
    const acmeHeld = new Promise<void>((resolve) => {
      releaseAcme = resolve;
    });
    let firstAcmeStarted: () => void = () => undefined;
    const firstAcmeStartedSignal = new Promise<void>((resolve) => {
      firstAcmeStarted = resolve;
    });

    const firstAcme = runtime.verify(
      "acme",
      request("acme-agent", "read", "db.read"),
      async () => {
        acmeActive += 1;
        maxAcmeActive = Math.max(maxAcmeActive, acmeActive);
        firstAcmeStarted();
        await acmeHeld;
        acmeActive -= 1;
        return "first";
      },
    );
    await firstAcmeStartedSignal;

    let secondAcmeFinished = false;
    const secondAcme = runtime
      .verify("acme", request("acme-agent", "read", "db.read"))
      .then((result) => {
        secondAcmeFinished = true;
        return result;
      });
    await Promise.resolve();
    expect(secondAcmeFinished).toBe(false);

    const globex = await Promise.race([
      runtime.verify("globex", request("globex-agent", "write", "db.write")),
      timeout(100),
    ]);
    expect(globex.decision).toBe("PROCEED");
    expect(globex.tenantId).toBe("globex");

    releaseAcme();
    const [firstResult, secondResult] = await Promise.all([firstAcme, secondAcme]);
    expect(firstResult.value).toBe("first");
    expect(secondResult.decision).toBe("PROCEED");
    expect(maxAcmeActive).toBe(1);
    expect(runtime.getAuditLog("acme")).toHaveLength(2);
    expect(runtime.getAuditLog("globex")).toHaveLength(1);
  });

  it("evaluates and records each tenant with its own trust policy", async () => {
    const runtime = new MultiTenantVerificationRuntime();
    runtime.registerTenant("reader", {
      id: "reader-policy",
      allowedAgents: ["shared-agent"],
      allowedActions: ["read"],
      requiredCapabilities: ["db.read"],
    });
    runtime.registerTenant("writer", {
      id: "writer-policy",
      allowedAgents: ["shared-agent"],
      allowedActions: ["write"],
      requiredCapabilities: ["db.write"],
    });

    const firstReader = await runtime.verify(
      "reader",
      request("shared-agent", "read", "db.read"),
    );
    const writerDenied = await runtime.verify(
      "writer",
      request("shared-agent", "read", "db.read"),
    );
    expect(firstReader.decision).toBe("PROCEED");
    expect(writerDenied.decision).toBe("DENY");
    expect(writerDenied.policyId).toBe("writer-policy");

    let scopedAuditLength = -1;
    const secondReader = await runtime.verify(
      "reader",
      request("shared-agent", "read", "db.read"),
      (_request, context) => {
        expect(context.tenantId).toBe("reader");
        expect(context.policy.id).toBe("reader-policy");
        scopedAuditLength = context.agentAuditLog().length;
        return "reader-result";
      },
    );

    expect(secondReader.value).toBe("reader-result");
    expect(scopedAuditLength).toBe(1);
    expect(runtime.getAuditLog("reader", "shared-agent")).toHaveLength(2);
    expect(runtime.getAuditLog("writer", "shared-agent")).toHaveLength(1);
    expect(runtime.getAuditLog("reader").every((entry) => entry.tenantId === "reader")).toBe(
      true,
    );
  });
});
