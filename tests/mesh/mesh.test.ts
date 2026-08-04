import { describe, expect, it } from "bun:test";

import {
  AgentMesh,
  DelegationEscalationError,
  PassportRevokedError,
  hashString,
  type Attestation,
  type ZkProof,
} from "./mesh";

describe("tests/mesh — multi-agent attestation", () => {
  it("attests a multi-agent mesh across trust domains and verifies the chain to the trust anchor", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("anchor", "acme");
    mesh.registerAgent("planner", "acme");
    mesh.registerAgent("executor", "globex");
    mesh.addPeer("globex");

    const anchorToPlanner = mesh.issueAttestation("anchor", "planner", [
      "read",
      "audit",
      "plan",
    ]);
    const anchorToExecutor = mesh.issueAttestation("anchor", "executor", ["read"]);

    expect(mesh.verifyAttestation(anchorToPlanner).valid).toBe(true);
    expect(mesh.verifyAttestation(anchorToExecutor).valid).toBe(true);
    expect(mesh.agent("planner")?.did).toBe("did:wasm:planner");
  });

  it("verifies attestation chains across trust domains with registered issuers only", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("anchor", "acme");
    mesh.registerAgent("planner", "acme");
    mesh.registerAgent("executor", "globex");
    mesh.addPeer("globex");

    const anchorToExecutor = mesh.issueAttestation("anchor", "executor", ["read"]);
    expect(mesh.verifyAttestation(anchorToExecutor).valid).toBe(true);

    const forgedIssuer: Attestation = {
      attestationId: "att:forged-issuer",
      subject: "executor",
      issuer: "ghost-issuer",
      domainId: "globex",
      capabilitySet: ["admin"],
      issuedAt: new Date().toISOString(),
      signature: hashString("forged"),
    };
    const rejected = mesh.verifyAttestation(forgedIssuer);
    expect(rejected.valid).toBe(false);
    expect(rejected.reason).toContain("not registered");
  });

  it("rejects attestations for unregistered subjects and tampered signatures", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("anchor", "acme");
    mesh.registerAgent("planner", "acme");

    const unregisteredSubject: Attestation = {
      attestationId: "att:forged",
      subject: "ghost",
      issuer: "anchor",
      domainId: "acme",
      capabilitySet: ["read"],
      issuedAt: new Date().toISOString(),
      signature: hashString("forged"),
    };
    const rejected = mesh.verifyAttestation(unregisteredSubject);
    expect(rejected.valid).toBe(false);
    expect(rejected.reason).toContain("not registered");

    const good = mesh.issueAttestation("anchor", "planner", ["read"]);
    expect(mesh.verifyAttestation(good).valid).toBe(true);

    const tampered: Attestation = { ...good, signature: hashString("tampered") };
    expect(mesh.verifyAttestation(tampered).valid).toBe(false);
  });

  it("attenuates delegation scope across hops and rejects escalation attempts", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("anchor", "acme");
    mesh.registerAgent("planner", "acme");
    mesh.registerAgent("executor", "acme");
    mesh.issueAttestation("anchor", "anchor", ["read", "audit", "plan"]);
    mesh.issueAttestation("anchor", "planner", ["read", "audit", "plan"]);

    const anchorDelegation = mesh.createDelegation("anchor", "planner", ["read", "audit"]);
    const plannerDelegation = mesh.createDelegation("planner", "executor", ["read"], {
      parent: anchorDelegation.delegationId,
    });

    expect(mesh.verifyDelegation(anchorDelegation).valid).toBe(true);
    expect(mesh.verifyDelegation(plannerDelegation).valid).toBe(true);

    // "write" is outside the scope the anchor granted the planner.
    expect(() => mesh.createDelegation("planner", "executor", ["read", "write"])).toThrow(
      DelegationEscalationError,
    );

    // Revoking the delegation's nonce fails it closed on the next use.
    mesh.revokeDelegation(plannerDelegation.delegationId);
    expect(mesh.verifyDelegation(plannerDelegation).valid).toBe(false);
  });
});

describe("tests/mesh — ZK evidence verification", () => {
  it("generates ZK proofs that verify without revealing evidence payloads", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("planner", "acme");
    mesh.issuePassport("planner");
    const sensitivePayload = "classified-customer-pii";
    const evidence = mesh.recordEvidence("planner", "aep.tool.call", {
      tool: "ledger.write",
      payload: sensitivePayload,
    });

    const proof = mesh.generateZkProof(
      evidence,
      "tool-call-within-agentbom",
      "circuit:aep-v1",
    );

    const result = mesh.verifyZkProof(proof, "circuit:aep-v1");
    expect(result.verified).toBe(true);
    // The verifier sees only the public statement — never the payload.
    expect(JSON.stringify(proof.statement)).not.toContain(sensitivePayload);
  });

  it("rejects tampered proofs and mismatched circuit verification keys", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("planner", "acme");
    mesh.issuePassport("planner");
    const evidence = mesh.recordEvidence("planner", "aep.tool.call", { tool: "ledger.write" });

    const proof = mesh.generateZkProof(
      evidence,
      "tool-call-within-agentbom",
      "circuit:aep-v1",
    );

    expect(mesh.verifyZkProof(proof, "circuit:aep-v2").verified).toBe(false);

    const tampered: ZkProof = { ...proof, proof: hashString("tampered") };
    expect(mesh.verifyZkProof(tampered, "circuit:aep-v1").verified).toBe(false);
  });
});

describe("tests/mesh — real-time revocation", () => {
  it("propagates real-time revocation signals to every federated peer", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("planner", "acme");
    mesh.registerAgent("executor", "globex");
    mesh.addPeer("globex");
    mesh.addPeer("supplier");
    const passportId = mesh.issuePassport("planner");

    const signal = mesh.revokePassport(
      "planner",
      "posture drift: data.write outside approved scope",
    );

    expect(signal.passportId).toBe(passportId);
    expect(signal.sequence).toBe(1);
    expect(mesh.isPassportRevoked(passportId)).toBe(true);
    expect(mesh.isRevoked("planner")).toBe(true);
    // Push-based propagation: every federated peer observed the signal.
    expect(mesh.revocationsReceivedBy("globex").map((s) => s.passportId)).toContain(
      passportId,
    );
    expect(mesh.revocationsReceivedBy("supplier")).toHaveLength(1);
    expect(mesh.revocationHistory()).toHaveLength(1);
  });

  it("revokes a passport mid-flight and downstream delegated operations fail closed", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("anchor", "acme");
    mesh.registerAgent("planner", "acme");
    mesh.registerAgent("executor", "acme");
    mesh.issueAttestation("anchor", "anchor", ["read", "audit", "plan"]);
    mesh.issueAttestation("anchor", "planner", ["read", "audit", "plan"]);
    const root = mesh.createDelegation("anchor", "planner", ["read", "audit"]);
    const chain = mesh.createDelegation("planner", "executor", ["read"], {
      parent: root.delegationId,
    });
    expect(mesh.verifyDelegation(chain).valid).toBe(true);

    const passportId = mesh.issuePassport("executor");
    const signal = mesh.revokePassport("executor", "unauthorized data.write observed");

    expect(signal.passportId).toBe(passportId);
    // The delegation chain fails closed once the delegatee's passport is revoked.
    expect(mesh.verifyDelegation(chain).valid).toBe(false);
    // The unaffected root delegation remains valid.
    expect(mesh.verifyDelegation(root).valid).toBe(true);
  });

  it("fails closed on revoked passports and distinguishes revoked evidence from never-existing evidence", () => {
    const mesh = new AgentMesh();
    mesh.registerAgent("anchor", "acme");
    mesh.registerAgent("executor", "globex");
    const passportId = mesh.issuePassport("executor");

    const evidence = mesh.recordEvidence("executor", "aep.tool.call", { tool: "ledger.write" });
    expect(mesh.verifyEvidence(evidence)).toBe(true);

    mesh.revokeEvidence(evidence.evidenceId);
    expect(mesh.evidenceStatus(evidence.evidenceId)).toBe("revoked");
    expect(mesh.evidenceStatus("evt:never-existed")).toBe("unknown");

    mesh.revokePassport("executor", "permission escalation across delegation hops");
    expect(mesh.isPassportRevoked(passportId)).toBe(true);

    // Revoked agents fail closed: no further evidence may be recorded.
    expect(() =>
      mesh.recordEvidence("executor", "aep.tool.call", { tool: "ledger.write" }),
    ).toThrow(PassportRevokedError);

    // Post-revocation attestations verify as invalid for the revoked subject.
    const postRevocation = mesh.issueAttestation("anchor", "executor", ["read"]);
    expect(mesh.verifyAttestation(postRevocation).valid).toBe(false);
  });
});
