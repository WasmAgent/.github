/**
 * End-to-end integration harness for the WasmAgent distributed agent mesh.
 *
 * Reference surface for the Milestone 6 bullet:
 *
 * > `tests/mesh/`: End-to-end integration test suite validating multi-agent
 * > attestation, ZK evidence verification, and real-time revocation
 * > (`npm run test:mesh`)
 *
 * Dependency-free by design (matching `wasmagent-js/runtime.ts`, the
 * `trace-pipeline/stream/stream.ts` and `wasmagent/edge/edge.ts` reference
 * surfaces). The harness models the cross-domain agent federation protocol and
 * ZK attestation architecture specified in `docs/federation-spec.md` in
 * process: agents are registered with cryptographic identities, attestations
 * and delegations are signed and verified against the mesh registry, ZK
 * proofs are generated over evidence without ever revealing the payload, and
 * Trust Passport revocations propagate to every federated peer in real time.
 *
 * The companion `tests/mesh/mesh.test.ts` suite is runnable with
 * `npm run test:mesh` (bun test mesh.test.ts).
 */

export type AgentId = string;
export type TrustDomainId = string;
export type PassportId = string;
export type EvidenceId = string;
export type DelegationId = string;
export type AttestationId = string;
export type Nonce = string;

/** A mesh agent's cryptographic identity, bound to a trust domain. */
export interface AgentIdentity {
  readonly agentId: AgentId;
  readonly domainId: TrustDomainId;
  /** DID identity — did:wasm:<agent-id> — portable across trust domains. */
  readonly did: string;
  /** Simulated public verification key for this agent. */
  readonly publicKey: string;
}

/** A signed attestation of an agent's capability set by an issuer. */
export interface Attestation {
  readonly attestationId: AttestationId;
  readonly subject: AgentId;
  readonly issuer: AgentId;
  readonly domainId: TrustDomainId;
  readonly capabilitySet: readonly string[];
  readonly issuedAt: string;
  /** Simulated signature over the attestation fields by the issuer. */
  readonly signature: string;
}

/** A scoped delegation from a delegating agent to a delegated agent. */
export interface Delegation {
  readonly delegationId: DelegationId;
  readonly delegator: AgentId;
  readonly delegatee: AgentId;
  /** Granted permission scope — must be a subset of the delegator's own scope. */
  readonly scope: readonly string[];
  /** Parent delegation id, forming the origin chain back to the root requester. */
  readonly parent: DelegationId | undefined;
  /** Tokenized revocation nonce; a peer that sees a revoked nonce fails closed. */
  readonly revokeNonce: Nonce;
  readonly expiry: string;
  /** Simulated signature over the delegation fields by the delegator. */
  readonly signature: string;
}

/** A signed AEP evidence event produced by an agent in the mesh. */
export interface EvidenceRecord {
  readonly evidenceId: EvidenceId;
  readonly agentId: AgentId;
  readonly kind: string;
  /** Sensitive payload — never leaves the trust domain in plaintext. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Simulated signature over the evidence identity fields by the agent. */
  readonly signature: string;
}

/** Public inputs of a ZK proof — the only thing a verifier ever sees. */
export interface ZkPublicStatement {
  readonly circuitId: string;
  readonly predicate: string;
  readonly agentId: AgentId;
  readonly evidenceId: EvidenceId;
  readonly kind: string;
  /** Commitment to the hidden evidence payload. */
  readonly commitment: string;
}

/** A ZK-SNARK style proof plus its public statement. */
export interface ZkProof {
  readonly proofId: string;
  readonly statement: ZkPublicStatement;
  readonly proof: string;
}

/** Outcome of verifying a ZK proof against a circuit verification key. */
export interface ZkVerificationResult {
  readonly verified: boolean;
  readonly circuitId: string;
  readonly reason: string;
}

/** A real-time revocation signal pushed to every federated peer. */
export interface RevocationSignal {
  readonly agentId: AgentId;
  readonly passportId: PassportId;
  readonly revocationReason: string;
  readonly timestamp: string;
  readonly sequence: number;
}

/** Outcome of verifying an attestation or delegation. */
export interface VerificationOutcome {
  readonly valid: boolean;
  readonly reason: string;
}

/** Raised when a delegation grants capabilities the delegator does not hold. */
export class DelegationEscalationError extends Error {
  constructor(delegator: AgentId, capabilities: string[]) {
    super(
      `delegation by ${delegator} would escalate scope beyond granted capabilities: ${capabilities.join(", ")}`,
    );
    this.name = "DelegationEscalationError";
  }
}

/** Raised when an agent whose passport has been revoked tries to act. */
export class PassportRevokedError extends Error {
  constructor(agentId: AgentId, passportId: PassportId) {
    super(`passport ${passportId} for agent ${agentId} has been revoked`);
    this.name = "PassportRevokedError";
  }
}

/** Raised when an operation references an agent that is not in the mesh. */
export class UnknownAgentError extends Error {
  constructor(agentId: AgentId, role: string) {
    super(`${role} ${agentId} is not registered in the mesh`);
    this.name = "UnknownAgentError";
  }
}

/** Deterministic FNV-1a hash used to simulate signing and commitments. */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Simulated signature: a keyed digest over the signed payload. */
export function sign(payload: string, publicKey: string): string {
  return hashString(`${payload}::${publicKey}`);
}

/** Verify a simulated signature against a public key. */
export function verifySignature(
  payload: string,
  publicKey: string,
  signature: string,
): boolean {
  return sign(payload, publicKey) === signature;
}

/**
 * In-process model of the cross-domain agent federation mesh.
 *
 * Multi-agent attestation: agents are registered per trust domain and their
 * capability sets are attested by an issuer; attestation and delegation chains
 * verify back to registered issuers, with delegation scope attenuated at every
 * hop so attempts to escalate permissions are rejected.
 *
 * ZK evidence verification: evidence is signed locally, then a prover commits
 * to the payload and produces a ZK proof; the verifier checks the proof
 * against the public statement and the circuit verification key without ever
 * seeing the payload (selective disclosure).
 *
 * Real-time revocation: revoking a passport marks the agent, its passport, and
 * its delegation nonces as revoked and pushes a `RevocationSignal` to every
 * federated peer domain; revoked agents fail closed on the next use and
 * revoked evidence is distinguishable from evidence that never existed.
 */
export class AgentMesh {
  private readonly agents = new Map<AgentId, AgentIdentity>();
  private readonly attestations = new Map<AttestationId, Attestation>();
  private readonly delegations = new Map<DelegationId, Delegation>();
  private readonly evidence = new Map<EvidenceId, EvidenceRecord>();
  private readonly passports = new Map<AgentId, PassportId>();
  private readonly revokedAgents = new Set<AgentId>();
  private readonly revokedPassports = new Set<PassportId>();
  private readonly revokedNonces = new Set<Nonce>();
  private readonly revokedEvidence = new Set<EvidenceId>();
  private readonly peers = new Set<TrustDomainId>();
  private readonly peerSignals = new Map<TrustDomainId, RevocationSignal[]>();
  private readonly revocationLog: RevocationSignal[] = [];
  private revocationSequence = 0;
  private evidenceCounter = 0;

  /** Register a trust domain as a federation peer of this mesh. */
  addPeer(domainId: TrustDomainId): void {
    this.peers.add(domainId);
  }

  /** Federation peer domain ids this mesh pushes revocations to. */
  peerDomains(): TrustDomainId[] {
    return [...this.peers];
  }

  /** Register a mesh agent bound to a trust domain. */
  registerAgent(
    agentId: AgentId,
    domainId: TrustDomainId,
    publicKey?: string,
  ): AgentIdentity {
    if (this.agents.has(agentId)) {
      throw new Error(`agent ${agentId} is already registered in the mesh`);
    }
    const identity: AgentIdentity = {
      agentId,
      domainId,
      did: `did:wasm:${agentId}`,
      publicKey: publicKey ?? `pk:${hashString(agentId)}`,
    };
    this.agents.set(agentId, identity);
    return identity;
  }

  /** Look up a registered agent identity, if present. */
  agent(agentId: AgentId): AgentIdentity | undefined {
    return this.agents.get(agentId);
  }

  /** Issue a Trust Passport id for an agent (idempotent). */
  issuePassport(agentId: AgentId): PassportId {
    const existing = this.passports.get(agentId);
    if (existing !== undefined) return existing;
    this.requireAgent(agentId, "passport subject");
    const passportId = `pass:${hashString(agentId)}`;
    this.passports.set(agentId, passportId);
    return passportId;
  }

  /** Passport id for an agent, if one has been issued. */
  passportFor(agentId: AgentId): PassportId | undefined {
    return this.passports.get(agentId);
  }

  /**
   * Issue a signed attestation of an agent's capability set. The attestation
   * is signed by the issuer and registered in the mesh so any peer can verify
   * the chain back to the issuer's identity.
   */
  issueAttestation(
    issuer: AgentId,
    subject: AgentId,
    capabilitySet: readonly string[],
  ): Attestation {
    const issuerIdentity = this.requireAgent(issuer, "attestation issuer");
    const subjectIdentity = this.requireAgent(subject, "attestation subject");
    const attestationId = `att:${hashString(`${issuer}->${subject}:${capabilitySet.join(",")}`)}`;
    const issuedAt = new Date().toISOString();
    const signature = sign(
      this.attestationPayload(attestationId, issuer, subject, capabilitySet, issuedAt),
      issuerIdentity.publicKey,
    );
    const attestation: Attestation = {
      attestationId,
      subject,
      issuer,
      domainId: subjectIdentity.domainId,
      capabilitySet,
      issuedAt,
      signature,
    };
    this.attestations.set(attestationId, attestation);
    return attestation;
  }

  /**
   * Verify an attestation: the issuer must be registered, the subject must be
   * registered, neither party may be revoked, and the signature must verify
   * against the issuer's public key.
   */
  verifyAttestation(attestation: Attestation): VerificationOutcome {
    const issuer = this.agents.get(attestation.issuer);
    if (!issuer) {
      return {
        valid: false,
        reason: `issuer ${attestation.issuer} is not registered in the mesh`,
      };
    }
    if (!this.agents.has(attestation.subject)) {
      return {
        valid: false,
        reason: `subject ${attestation.subject} is not registered in the mesh`,
      };
    }
    if (
      this.revokedAgents.has(attestation.issuer) ||
      this.revokedAgents.has(attestation.subject)
    ) {
      return {
        valid: false,
        reason: `a party in attestation ${attestation.attestationId} has been revoked`,
      };
    }
    const payload = this.attestationPayload(
      attestation.attestationId,
      attestation.issuer,
      attestation.subject,
      attestation.capabilitySet,
      attestation.issuedAt,
    );
    if (!verifySignature(payload, issuer.publicKey, attestation.signature)) {
      return {
        valid: false,
        reason: `attestation ${attestation.attestationId} signature does not verify`,
      };
    }
    return { valid: true, reason: `attestation ${attestation.attestationId} verified` };
  }

  /**
   * Create a scoped delegation from a delegating agent to a delegated agent.
   * The delegated scope must be a subset of the capabilities the delegator
   * currently holds (attestation + inherited delegations); attempts to
   * escalate beyond that scope are rejected.
   */
  createDelegation(
    delegator: AgentId,
    delegatee: AgentId,
    scope: readonly string[],
    options: { parent?: DelegationId; expiry?: string } = {},
  ): Delegation {
    const delegatorIdentity = this.requireAgent(delegator, "delegator");
    this.requireAgent(delegatee, "delegatee");
    const granted = this.grantedScope(delegator);
    const outside = scope.filter((capability) => !granted.includes(capability));
    if (outside.length > 0) {
      throw new DelegationEscalationError(delegator, outside);
    }
    const expiry = options.expiry ?? "2099-12-31T00:00:00.000Z";
    const delegationId = `del:${hashString(
      `${delegator}->${delegatee}:${scope.join(",")}:${options.parent ?? "root"}`,
    )}`;
    const revokeNonce = `nonce:${hashString(`${delegationId}:${delegatee}`)}`;
    const payload = this.delegationPayload(
      delegationId,
      delegator,
      delegatee,
      scope,
      options.parent,
      revokeNonce,
      expiry,
    );
    const delegation: Delegation = {
      delegationId,
      delegator,
      delegatee,
      scope,
      parent: options.parent,
      revokeNonce,
      expiry,
      signature: sign(payload, delegatorIdentity.publicKey),
    };
    this.delegations.set(delegationId, delegation);
    return delegation;
  }

  /**
   * Verify a delegation: both parties must be registered, the delegator's
   * signature must verify, no party or nonce may be revoked, and if a parent
   * delegation exists the delegated scope must be a subset of the parent's.
   */
  verifyDelegation(delegation: Delegation): VerificationOutcome {
    const delegator = this.agents.get(delegation.delegator);
    if (!delegator) {
      return { valid: false, reason: `delegator ${delegation.delegator} is not registered` };
    }
    if (!this.agents.has(delegation.delegatee)) {
      return { valid: false, reason: `delegatee ${delegation.delegatee} is not registered` };
    }
    if (
      this.revokedAgents.has(delegation.delegator) ||
      this.revokedAgents.has(delegation.delegatee)
    ) {
      return {
        valid: false,
        reason: `a party in delegation ${delegation.delegationId} has been revoked`,
      };
    }
    if (this.revokedNonces.has(delegation.revokeNonce)) {
      return {
        valid: false,
        reason: `delegation ${delegation.delegationId} carries a revoked nonce`,
      };
    }
    const payload = this.delegationPayload(
      delegation.delegationId,
      delegation.delegator,
      delegation.delegatee,
      delegation.scope,
      delegation.parent,
      delegation.revokeNonce,
      delegation.expiry,
    );
    if (!verifySignature(payload, delegator.publicKey, delegation.signature)) {
      return {
        valid: false,
        reason: `delegation ${delegation.delegationId} signature does not verify`,
      };
    }
    if (delegation.parent !== undefined) {
      const parent = this.delegations.get(delegation.parent);
      if (!parent) {
        return { valid: false, reason: `parent delegation ${delegation.parent} not found` };
      }
      const parentResult = this.verifyDelegation(parent);
      if (!parentResult.valid) {
        return {
          valid: false,
          reason: `parent delegation ${delegation.parent} is invalid: ${parentResult.reason}`,
        };
      }
      const outside = delegation.scope.filter(
        (capability) => !parent.scope.includes(capability),
      );
      if (outside.length > 0) {
        return {
          valid: false,
          reason: `delegation ${delegation.delegationId} scope exceeds parent scope`,
        };
      }
    }
    return { valid: true, reason: `delegation ${delegation.delegationId} verified` };
  }

  /** Revoke a delegation's nonce so it fails closed on the next use. */
  revokeDelegation(delegationId: DelegationId): void {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) {
      throw new Error(`delegation ${delegationId} not found`);
    }
    this.revokedNonces.add(delegation.revokeNonce);
  }

  /**
   * Record a signed AEP evidence event for an agent. Agents whose passport has
   * been revoked fail closed and cannot produce further evidence.
   */
  recordEvidence(
    agentId: AgentId,
    kind: string,
    payload: Readonly<Record<string, unknown>>,
  ): EvidenceRecord {
    const identity = this.requireAgent(agentId, "evidence agent");
    const passportId = this.passports.get(agentId) ?? "unissued";
    if (this.revokedAgents.has(agentId) || this.revokedPassports.has(passportId)) {
      throw new PassportRevokedError(agentId, passportId);
    }
    this.evidenceCounter += 1;
    const evidenceId = `evt:${hashString(
      `${agentId}:${kind}:${this.evidenceCounter}:${JSON.stringify(payload)}`,
    )}`;
    const signature = sign(`${evidenceId}:${agentId}:${kind}`, identity.publicKey);
    const record: EvidenceRecord = {
      evidenceId,
      agentId,
      kind,
      payload,
      signature,
    };
    this.evidence.set(evidenceId, record);
    return record;
  }

  /** Verify an evidence record's simulated signature. */
  verifyEvidence(evidence: EvidenceRecord): boolean {
    const identity = this.agents.get(evidence.agentId);
    if (!identity) return false;
    return verifySignature(
      `${evidence.evidenceId}:${evidence.agentId}:${evidence.kind}`,
      identity.publicKey,
      evidence.signature,
    );
  }

  /**
   * Prover side of ZK evidence verification: commits to the evidence payload
   * (so the payload never appears in the public statement) and produces a
   * simulated SNARK proof over the public statement.
   */
  generateZkProof(
    evidence: EvidenceRecord,
    predicate: string,
    circuitId: string,
  ): ZkProof {
    const commitment = hashString(`${JSON.stringify(evidence.payload)}:${evidence.evidenceId}`);
    const statement: ZkPublicStatement = {
      circuitId,
      predicate,
      agentId: evidence.agentId,
      evidenceId: evidence.evidenceId,
      kind: evidence.kind,
      commitment,
    };
    return {
      proofId: `proof:${hashString(`${circuitId}:${evidence.evidenceId}:${predicate}`)}`,
      statement,
      proof: this.prove(statement),
    };
  }

  /**
   * Verifier side of ZK evidence verification: checks the proof against the
   * circuit verification key and the public statement. The hidden payload is
   * never needed — verification is stateless and reveals only the public
   * statement (selective disclosure).
   */
  verifyZkProof(proof: ZkProof, verificationKey: string): ZkVerificationResult {
    if (proof.statement.circuitId !== verificationKey) {
      return {
        verified: false,
        circuitId: proof.statement.circuitId,
        reason: `circuit ${proof.statement.circuitId} does not match verification key ${verificationKey}`,
      };
    }
    const expected = this.prove(proof.statement);
    if (expected !== proof.proof) {
      return {
        verified: false,
        circuitId: proof.statement.circuitId,
        reason: "proof does not match the public statement",
      };
    }
    return {
      verified: true,
      circuitId: proof.statement.circuitId,
      reason: "proof verified against public statement",
    };
  }

  /**
   * Revoke an agent's Trust Passport and push a real-time revocation signal to
   * every federated peer domain. The agent, its passport, and its delegation
   * nonces all fail closed from this point on.
   */
  revokePassport(agentId: AgentId, reason: string): RevocationSignal {
    this.requireAgent(agentId, "revocation subject");
    const passportId = this.passports.get(agentId);
    if (passportId === undefined) {
      throw new Error(`agent ${agentId} has no passport to revoke`);
    }
    this.revokedAgents.add(agentId);
    this.revokedPassports.add(passportId);
    this.revocationSequence += 1;
    const signal: RevocationSignal = {
      agentId,
      passportId,
      revocationReason: reason,
      timestamp: new Date().toISOString(),
      sequence: this.revocationSequence,
    };
    this.revocationLog.push(signal);
    for (const domainId of this.peers) {
      this.propagateRevocation(signal, domainId);
    }
    return signal;
  }

  /**
   * Push a revocation signal to a federated peer domain over the simulated
   * mesh control plane. In-process peers observe the signal immediately,
   * modelling push-based (not polled) revocation propagation.
   */
  propagateRevocation(signal: RevocationSignal, domainId: TrustDomainId): void {
    const received = this.peerSignals.get(domainId) ?? [];
    received.push(signal);
    this.peerSignals.set(domainId, received);
  }

  /** Revocation signals delivered to a federated peer domain. */
  revocationsReceivedBy(domainId: TrustDomainId): RevocationSignal[] {
    return [...(this.peerSignals.get(domainId) ?? [])];
  }

  /** All revocation signals issued by this mesh, in sequence order. */
  revocationHistory(): RevocationSignal[] {
    return [...this.revocationLog];
  }

  /** Whether an agent's passport has been revoked. */
  isRevoked(agentId: AgentId): boolean {
    return this.revokedAgents.has(agentId);
  }

  /** Whether a Trust Passport has been revoked. */
  isPassportRevoked(passportId: PassportId): boolean {
    return this.revokedPassports.has(passportId);
  }

  /**
   * Mark an existing evidence record as revoked in the mesh ledger, so
   * auditors can distinguish "never existed" from "existed and was revoked".
   */
  revokeEvidence(evidenceId: EvidenceId): void {
    if (!this.evidence.has(evidenceId)) {
      throw new Error(`cannot revoke unknown evidence ${evidenceId}`);
    }
    this.revokedEvidence.add(evidenceId);
  }

  /** Ledger status of an evidence record. */
  evidenceStatus(evidenceId: EvidenceId): "unknown" | "active" | "revoked" {
    if (this.revokedEvidence.has(evidenceId)) return "revoked";
    if (this.evidence.has(evidenceId)) return "active";
    return "unknown";
  }

  /** The capabilities an agent currently holds (attestation + delegations). */
  grantedScope(agentId: AgentId): string[] {
    const scope = new Set<string>();
    for (const attestation of this.attestations.values()) {
      if (attestation.subject === agentId) {
        for (const capability of attestation.capabilitySet) scope.add(capability);
      }
    }
    for (const delegation of this.delegations.values()) {
      if (delegation.delegatee === agentId) {
        for (const capability of delegation.scope) scope.add(capability);
      }
    }
    return [...scope];
  }

  private attestationPayload(
    attestationId: AttestationId,
    issuer: AgentId,
    subject: AgentId,
    capabilitySet: readonly string[],
    issuedAt: string,
  ): string {
    return `${attestationId}:${issuer}:${subject}:${capabilitySet.join(",")}:${issuedAt}`;
  }

  private delegationPayload(
    delegationId: DelegationId,
    delegator: AgentId,
    delegatee: AgentId,
    scope: readonly string[],
    parent: DelegationId | undefined,
    revokeNonce: Nonce,
    expiry: string,
  ): string {
    return `${delegationId}:${delegator}:${delegatee}:${scope.join(",")}:${parent ?? "root"}:${revokeNonce}:${expiry}`;
  }

  private prove(statement: ZkPublicStatement): string {
    return hashString(
      `${statement.circuitId}:${statement.predicate}:${statement.agentId}:${statement.evidenceId}:${statement.commitment}`,
    );
  }

  private requireAgent(agentId: AgentId, role: string): AgentIdentity {
    const identity = this.agents.get(agentId);
    if (!identity) {
      throw new UnknownAgentError(agentId, role);
    }
    return identity;
  }
}
