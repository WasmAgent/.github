/**
 * A small, dependency-free verification runtime for embedding in JavaScript
 * agents. Tenant state is deliberately private to a TenantContext: there is
 * no process-wide agent registry or policy fallback.
 */

export type TenantId = string;
export type AgentId = string;
export type VerificationDecision = "PROCEED" | "DENY";

export interface EvidenceEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface VerificationRequest {
  readonly agentId: AgentId;
  readonly action?: string;
  readonly capabilities?: readonly string[];
  readonly evidence?: readonly EvidenceEvent[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

/**
 * Declarative rules are evaluated before a verifier is called. `evaluate` is
 * an optional escape hatch for policy rules that cannot be expressed by the
 * built-in checks; it receives only the current tenant's request.
 */
export interface TrustPolicy {
  readonly id: string;
  readonly version?: string;
  readonly allowedAgents?: readonly AgentId[];
  readonly allowedActions?: readonly string[];
  readonly requiredCapabilities?: readonly string[];
  readonly requiredEvidenceTypes?: readonly string[];
  readonly maxConcurrentVerifications?: number;
  readonly evaluate?: (
    request: VerificationRequest,
  ) => PolicyDecision | Promise<PolicyDecision>;
}

export interface VerificationResult<T> {
  readonly requestId: string;
  readonly tenantId: TenantId;
  readonly agentId: AgentId;
  readonly policyId: string;
  readonly decision: VerificationDecision;
  readonly reason?: string;
  readonly value?: T;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface AuditEntry {
  readonly requestId: string;
  readonly tenantId: TenantId;
  readonly agentId: AgentId;
  readonly policyId: string;
  readonly decision: VerificationDecision;
  readonly reason?: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface VerificationContext {
  readonly tenantId: TenantId;
  readonly agentId: AgentId;
  readonly policy: TrustPolicy;
  /** Returns records for this agent only, never records from another agent. */
  readonly agentAuditLog: () => readonly AuditEntry[];
}

export type AgentVerifier<T> = (
  request: VerificationRequest,
  context: VerificationContext,
) => T | Promise<T>;

export class TenantNotFoundError extends Error {
  constructor(tenantId: TenantId) {
    super(`No verification tenant is registered for ${tenantId}`);
    this.name = "TenantNotFoundError";
  }
}

export class TenantAlreadyRegisteredError extends Error {
  constructor(tenantId: TenantId) {
    super(`Verification tenant ${tenantId} is already registered`);
    this.name = "TenantAlreadyRegisteredError";
  }
}

export class InvalidTrustPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTrustPolicyError";
  }
}

interface TenantContext {
  readonly tenantId: TenantId;
  policy: TrustPolicy;
  activeVerifications: number;
  readonly waiters: Array<() => void>;
  readonly auditLog: AuditEntry[];
  readonly agentAudit: Map<AgentId, AuditEntry[]>;
}

function copyPolicy(policy: TrustPolicy): TrustPolicy {
  return {
    ...policy,
    allowedAgents: policy.allowedAgents ? [...policy.allowedAgents] : undefined,
    allowedActions: policy.allowedActions ? [...policy.allowedActions] : undefined,
    requiredCapabilities: policy.requiredCapabilities
      ? [...policy.requiredCapabilities]
      : undefined,
    requiredEvidenceTypes: policy.requiredEvidenceTypes
      ? [...policy.requiredEvidenceTypes]
      : undefined,
  };
}

function validatePolicy(policy: TrustPolicy): void {
  if (!policy || !policy.id.trim()) {
    throw new InvalidTrustPolicyError("A trust policy must have a non-empty id");
  }

  if (
    policy.maxConcurrentVerifications !== undefined &&
    (!Number.isInteger(policy.maxConcurrentVerifications) ||
      policy.maxConcurrentVerifications < 1)
  ) {
    throw new InvalidTrustPolicyError(
      "maxConcurrentVerifications must be a positive integer",
    );
  }
}

function firstFailedRule(
  policy: TrustPolicy,
  request: VerificationRequest,
): string | undefined {
  if (policy.allowedAgents && !policy.allowedAgents.includes(request.agentId)) {
    return `agent ${request.agentId} is not allowed by policy ${policy.id}`;
  }

  if (
    policy.allowedActions &&
    (!request.action || !policy.allowedActions.includes(request.action))
  ) {
    return `action ${request.action ?? "<none>"} is not allowed by policy ${policy.id}`;
  }

  const capabilities = new Set(request.capabilities ?? []);
  const missingCapabilities = (policy.requiredCapabilities ?? []).filter(
    (capability) => !capabilities.has(capability),
  );
  if (missingCapabilities.length > 0) {
    return `missing required capabilities: ${missingCapabilities.join(", ")}`;
  }

  const evidenceTypes = new Set((request.evidence ?? []).map((event) => event.type));
  const missingEvidence = (policy.requiredEvidenceTypes ?? []).filter(
    (eventType) => !evidenceTypes.has(eventType),
  );
  if (missingEvidence.length > 0) {
    return `missing required evidence types: ${missingEvidence.join(", ")}`;
  }

  return undefined;
}

/** Evaluate one policy without accessing runtime or another tenant state. */
export async function evaluateTrustPolicy(
  policy: TrustPolicy,
  request: VerificationRequest,
): Promise<PolicyDecision> {
  const builtInFailure = firstFailedRule(policy, request);
  if (builtInFailure) {
    return { allowed: false, reason: builtInFailure };
  }

  if (policy.evaluate) {
    const customDecision = await policy.evaluate(request);
    if (!customDecision.allowed) {
      return {
        allowed: false,
        reason: customDecision.reason ?? `policy ${policy.id} rejected the request`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Concurrent multi-tenant verification runtime.
 *
 * Each tenant owns a policy, concurrency gate, audit log, and agent index.
 * A limit on tenant A queues only tenant A; tenant B continues independently.
 */
export class MultiTenantVerificationRuntime {
  private readonly tenants = new Map<TenantId, TenantContext>();
  private nextRequestNumber = 1;

  registerTenant(tenantId: TenantId, policy: TrustPolicy): void {
    this.assertTenantId(tenantId);
    validatePolicy(policy);
    if (this.tenants.has(tenantId)) {
      throw new TenantAlreadyRegisteredError(tenantId);
    }

    this.tenants.set(tenantId, {
      tenantId,
      policy: copyPolicy(policy),
      activeVerifications: 0,
      waiters: [],
      auditLog: [],
      agentAudit: new Map(),
    });
  }

  updateTenantPolicy(tenantId: TenantId, policy: TrustPolicy): void {
    const tenant = this.getTenant(tenantId);
    validatePolicy(policy);
    tenant.policy = copyPolicy(policy);
  }

  removeTenant(tenantId: TenantId): void {
    const tenant = this.getTenant(tenantId);
    if (tenant.activeVerifications > 0 || tenant.waiters.length > 0) {
      throw new Error(`Cannot remove tenant ${tenantId} while verification is active`);
    }
    this.tenants.delete(tenantId);
  }

  listTenants(): readonly TenantId[] {
    return [...this.tenants.keys()];
  }

  getTenantPolicy(tenantId: TenantId): TrustPolicy {
    return copyPolicy(this.getTenant(tenantId).policy);
  }

  getAuditLog(tenantId: TenantId, agentId?: AgentId): readonly AuditEntry[] {
    const tenant = this.getTenant(tenantId);
    const entries = agentId ? tenant.agentAudit.get(agentId) ?? [] : tenant.auditLog;
    return entries.map((entry) => ({ ...entry }));
  }

  async verify<T>(
    tenantId: TenantId,
    request: VerificationRequest,
    verifier?: AgentVerifier<T>,
  ): Promise<VerificationResult<T>> {
    const tenant = this.getTenant(tenantId);
    this.assertRequest(request);
    const requestId = request.requestId ?? `${tenantId}:${this.nextRequestNumber++}`;
    const scopedRequest: VerificationRequest = {
      ...request,
      capabilities: request.capabilities ? [...request.capabilities] : undefined,
      evidence: request.evidence ? request.evidence.map((event) => ({ ...event })) : undefined,
      metadata: request.metadata ? { ...request.metadata } : undefined,
      requestId,
    };
    const startedAt = new Date().toISOString();

    await this.acquire(tenant);
    try {
      const policy = copyPolicy(tenant.policy);
      const policyDecision = await evaluateTrustPolicy(policy, scopedRequest);
      if (!policyDecision.allowed) {
        return this.finish(
          tenant,
          scopedRequest,
          policy,
          startedAt,
          "DENY",
          policyDecision.reason,
        );
      }

      if (!verifier) {
        return this.finish(tenant, scopedRequest, policy, startedAt, "PROCEED");
      }

      try {
        const value = await verifier(scopedRequest, {
          tenantId,
          agentId: scopedRequest.agentId,
          policy,
          agentAuditLog: () => this.getAuditLog(tenantId, scopedRequest.agentId),
        });
        return this.finish(
          tenant,
          scopedRequest,
          policy,
          startedAt,
          "PROCEED",
          undefined,
          value,
        );
      } catch (error) {
        return this.finish(
          tenant,
          scopedRequest,
          policy,
          startedAt,
          "DENY",
          error instanceof Error ? error.message : "verifier failed",
        );
      }
    } catch (error) {
      // Policy evaluators are untrusted extension points: a failure is a
      // fail-closed denial and never leaks a different tenant's state.
      return this.finish(
        tenant,
        scopedRequest,
        tenant.policy,
        startedAt,
        "DENY",
        error instanceof Error ? error.message : "policy evaluation failed",
      );
    } finally {
      this.release(tenant);
    }
  }

  /** Alias for callers that model verification as a runtime operation. */
  run<T>(
    tenantId: TenantId,
    request: VerificationRequest,
    verifier?: AgentVerifier<T>,
  ): Promise<VerificationResult<T>> {
    return this.verify(tenantId, request, verifier);
  }

  private finish<T>(
    tenant: TenantContext,
    request: VerificationRequest,
    policy: TrustPolicy,
    startedAt: string,
    decision: VerificationDecision,
    reason?: string,
    value?: T,
  ): VerificationResult<T> {
    const completedAt = new Date().toISOString();
    const entry: AuditEntry = {
      requestId: request.requestId as string,
      tenantId: tenant.tenantId,
      agentId: request.agentId,
      policyId: policy.id,
      decision,
      reason,
      startedAt,
      completedAt,
    };
    tenant.auditLog.push(entry);
    const agentEntries = tenant.agentAudit.get(request.agentId) ?? [];
    agentEntries.push(entry);
    tenant.agentAudit.set(request.agentId, agentEntries);
    return { ...entry, value };
  }

  private async acquire(tenant: TenantContext): Promise<void> {
    const limit = tenant.policy.maxConcurrentVerifications;
    if (!limit || tenant.activeVerifications < limit) {
      tenant.activeVerifications += 1;
      return;
    }

    await new Promise<void>((resolve) => tenant.waiters.push(resolve));
  }

  private release(tenant: TenantContext): void {
    const next = tenant.waiters.shift();
    if (next) {
      // Transfer the slot directly to the waiter. Keeping the active count
      // unchanged prevents a new call from claiming the slot in between.
      next();
      return;
    }
    tenant.activeVerifications -= 1;
  }

  private getTenant(tenantId: TenantId): TenantContext {
    this.assertTenantId(tenantId);
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }
    return tenant;
  }

  private assertTenantId(tenantId: TenantId): void {
    if (!tenantId || !tenantId.trim()) {
      throw new Error("tenantId must be a non-empty string");
    }
  }

  private assertRequest(request: VerificationRequest): void {
    if (!request || !request.agentId || !request.agentId.trim()) {
      throw new Error("verification requests require a non-empty agentId");
    }
  }
}

export const VerificationRuntime = MultiTenantVerificationRuntime;
