import { describe, expect, it } from "bun:test";

import type { JwtSvid, SvidBundle, WorkloadApiTransport, X509Svid } from "./spiffe";
import {
  InvalidSpiffeIdError,
  SpiffeIdentityDriver,
  parseSpiffeId,
} from "./spiffe";

const sampleSvid = (spiffeId: string, expiresAt?: string): X509Svid => ({
  spiffeId,
  certChain: [
    "-----BEGIN CERTIFICATE-----\nMIIB leaf chain\n-----END CERTIFICATE-----",
  ],
  privateKey:
    "-----BEGIN PRIVATE KEY-----\nMIIE workload key\n-----END PRIVATE KEY-----",
  bundle: [
    "-----BEGIN CERTIFICATE-----\nMIIB trust root\n-----END CERTIFICATE-----",
  ],
  expiresAt:
    expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
});

class FakeWorkloadApi implements WorkloadApiTransport {
  private svids: X509Svid[];
  private readonly listeners = new Set<(svid: X509Svid) => void>();

  constructor(svid: X509Svid) {
    this.svids = [svid];
  }

  fetchX509Svid(): Promise<X509Svid> {
    return Promise.resolve(this.svids[0]);
  }

  fetchJwtSvid(audience: string): Promise<JwtSvid> {
    const svid = this.svids[0];
    return Promise.resolve({
      spiffeId: svid.spiffeId,
      token: "eyJhbGciOiJFUzI1NiJ9.signed-jwt",
      audience,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  watchX509Svid(onUpdate: (svid: X509Svid) => void): () => void {
    this.listeners.add(onUpdate);
    return () => this.listeners.delete(onUpdate);
  }

  push(svid: X509Svid): void {
    this.svids = [svid];
    for (const listener of this.listeners) {
      listener(svid);
    }
  }
}

describe("SpiffeIdentityDriver", () => {
  it("parses and validates SPIFFE IDs with trust domain and path", () => {
    const parts = parseSpiffeId("spiffe://example.org/ns/payroll/sa/billing");
    expect(parts.trustDomain).toBe("example.org");
    expect(parts.path).toBe("/ns/payroll/sa/billing");

    expect(() => parseSpiffeId("https://example.org/x")).toThrow(
      InvalidSpiffeIdError,
    );
    expect(() => parseSpiffeId("spiffe://example.org")).toThrow(
      InvalidSpiffeIdError,
    );
    expect(() => parseSpiffeId("spiffe:///ns/payroll")).toThrow(
      InvalidSpiffeIdError,
    );
  });

  it("fetches and rotates X.509 SVIDs through the Workload API transport", async () => {
    const first = sampleSvid(
      "spiffe://example.org/ns/payroll/sa/billing",
      new Date(Date.now() + 60_000).toISOString(),
    );
    const second = sampleSvid(
      "spiffe://example.org/ns/payroll/sa/billing",
      new Date(Date.now() + 120_000).toISOString(),
    );
    const api = new FakeWorkloadApi(first);
    const driver = new SpiffeIdentityDriver({
      transport: api,
      selectors: [{ type: "k8s", value: "ns:payroll" }],
    });

    expect(driver.getSelectors()).toEqual([{ type: "k8s", value: "ns:payroll" }]);

    const bundle = await driver.connect();
    expect(bundle.trustDomain).toBe("example.org");
    expect(bundle.x509Svid.spiffeId).toBe("spiffe://example.org/ns/payroll/sa/billing");

    let rotated: SvidBundle | undefined;
    driver.onRotation((next) => {
      rotated = next;
    });
    api.push(second);
    expect(rotated?.x509Svid.expiresAt).toBe(second.expiresAt);
    expect(driver.getActiveBundle().x509Svid.expiresAt).toBe(second.expiresAt);

    const creds = driver.createMtlsClientCredentials();
    expect(creds.certChain.length).toBeGreaterThan(0);
    expect(creds.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(creds.trustBundle.length).toBeGreaterThan(0);
    expect(creds.spiffeId).toBe("spiffe://example.org/ns/payroll/sa/billing");

    driver.close();
  });

  it("issues JWT-SVIDs for a requested audience", async () => {
    const api = new FakeWorkloadApi(
      sampleSvid("spiffe://example.org/ns/payroll/sa/billing"),
    );
    const driver = new SpiffeIdentityDriver({ transport: api });
    await driver.connect();

    const jwt = await driver.fetchJwtSvid("spire-server");
    expect(jwt.token).toBe("eyJhbGciOiJFUzI1NiJ9.signed-jwt");
    expect(jwt.audience).toBe("spire-server");
    expect(jwt.spiffeId).toBe("spiffe://example.org/ns/payroll/sa/billing");
    expect(driver.getActiveJwtSvid().audience).toBe("spire-server");

    driver.close();
  });

  it("binds a Wasm sandbox workload to mTLS credentials", async () => {
    const api = new FakeWorkloadApi(
      sampleSvid("spiffe://example.org/ns/payroll/sa/billing"),
    );
    const driver = new SpiffeIdentityDriver({
      transport: api,
      selectors: [{ type: "wasm", value: "sandbox:default" }],
    });
    await driver.connect();

    driver.bindWorkload("spiffe://example.org/ns/payroll/sa/billing");
    const serverCreds = driver.createMtlsServerCredentials();
    expect(serverCreds.spiffeId).toBe("spiffe://example.org/ns/payroll/sa/billing");

    expect(() => driver.bindWorkload("spiffe://other.org/ns/payroll/sa/billing")).toThrow(
      /does not match required/,
    );

    driver.close();
  });
});
