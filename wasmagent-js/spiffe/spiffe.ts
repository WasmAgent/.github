/**
 * SPIFFE/SPIRE cryptographic identity driver for Wasm sandbox workloads.
 *
 * This module is dependency-free by design (matching `wasmagent-js/runtime.ts`).
 * A workload calls `connect()` on the driver and receives X.509-SVID /
 * JWT-SVID credential material that binds the sandbox to an enterprise SPIFFE
 * identity. The SPIRE Workload API transport is pluggable so tests can
 * simulate SVID issuance and rotation without a live SPIRE agent.
 *
 * Reference surface for the Milestone 6 bullet:
 *
 * > `wasmagent-js/spiffe/`: SPIFFE/SPIRE cryptographic identity driver binding
 * > Wasm sandbox workloads to enterprise mTLS credentials
 */

export type TrustDomain = string;
export type SpiffeId = string;
export type SpiffePath = string;

export interface SpiffeIdParts {
  readonly trustDomain: TrustDomain;
  readonly path: SpiffePath;
}

/** SPIFFE Workload API selector, e.g. `k8s:ns:payroll`. */
export interface SpiffeSelector {
  readonly type: string;
  readonly value: string;
}

/** X.509-SVID issued by a SPIRE agent for a workload. */
export interface X509Svid {
  readonly spiffeId: SpiffeId;
  readonly certChain: readonly string[];
  readonly privateKey: string;
  readonly bundle: readonly string[];
  readonly expiresAt: string;
  readonly hint?: string;
}

/** JWT-SVID issued by a SPIRE agent for a workload and audience. */
export interface JwtSvid {
  readonly spiffeId: SpiffeId;
  readonly token: string;
  readonly audience: string;
  readonly expiresAt: string;
}

/** The active identity bundle held by the driver after `connect()`. */
export interface SvidBundle {
  readonly trustDomain: TrustDomain;
  readonly x509Svid: X509Svid;
  readonly refreshedAt: string;
}

/** mTLS credential material derived from the active X.509-SVID. */
export interface MtlsCredentials {
  readonly spiffeId: SpiffeId;
  readonly certChain: readonly string[];
  readonly privateKey: string;
  readonly trustBundle: readonly string[];
  readonly expiresAt: string;
}

export class InvalidSpiffeIdError extends Error {
  constructor(spiffeId: SpiffeId, reason: string) {
    super(`invalid SPIFFE ID ${spiffeId}: ${reason}`);
    this.name = "InvalidSpiffeIdError";
  }
}

export class SpireWorkloadApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpireWorkloadApiError";
  }
}

const SPIFFE_SCHEME = "spiffe://";

/**
 * Validate a SPIFFE ID and split it into trust domain and path, e.g.
 * `spiffe://example.org/ns/payroll/sa/billing` ->
 * `{ trustDomain: "example.org", path: "/ns/payroll/sa/billing" }`.
 */
export function parseSpiffeId(spiffeId: SpiffeId): SpiffeIdParts {
  if (!spiffeId || !spiffeId.startsWith(SPIFFE_SCHEME)) {
    throw new InvalidSpiffeIdError(spiffeId, "must start with spiffe://");
  }
  const remainder = spiffeId.slice(SPIFFE_SCHEME.length);
  const slash = remainder.indexOf("/");
  const trustDomain = slash === -1 ? remainder : remainder.slice(0, slash);
  const path = slash === -1 ? "" : remainder.slice(slash);
  if (!trustDomain) {
    throw new InvalidSpiffeIdError(spiffeId, "trust domain must not be empty");
  }
  if (!path) {
    throw new InvalidSpiffeIdError(spiffeId, "path must not be empty");
  }
  return { trustDomain, path };
}

export function validateSelector(selector: SpiffeSelector): void {
  if (!selector || !selector.type.trim()) {
    throw new Error("SPIFFE selector must have a non-empty type");
  }
  if (!selector.value.trim()) {
    throw new Error(`SPIFFE selector ${selector.type} must have a non-empty value`);
  }
}

/**
 * Pluggable SPIRE Workload API transport. Production implementations talk to
 * the Unix socket / TCP Workload API (e.g.
 * `unix:///run/spire/sockets/agent.sock`); tests use a fake.
 */
export interface WorkloadApiTransport {
  fetchX509Svid(): Promise<X509Svid>;
  fetchJwtSvid(audience: string): Promise<JwtSvid>;
  watchX509Svid(onUpdate: (svid: X509Svid) => void): () => void;
}

export interface SpiffeIdentityDriverOptions {
  readonly workloadApiAddress?: string;
  readonly selectors?: readonly SpiffeSelector[];
  readonly transport: WorkloadApiTransport;
}

/**
 * Binds a Wasm sandbox workload to SPIFFE/SPIRE identity credentials.
 *
 * On `connect()` the driver fetches the workload's initial X.509-SVID and
 * starts watching the Workload API for rotations. `createMtlsClientCredentials`
 * and `createMtlsServerCredentials` expose the active SVID as mTLS credential
 * material so agent tool calls authenticate with the workload's SPIFFE ID.
 */
export class SpiffeIdentityDriver {
  private readonly transport: WorkloadApiTransport;
  private readonly selectors: readonly SpiffeSelector[];
  private activeBundle: SvidBundle | undefined;
  private activeJwt: JwtSvid | undefined;
  private unwatch: (() => void) | undefined;
  private readonly rotationCallbacks = new Set<(bundle: SvidBundle) => void>();

  constructor(options: SpiffeIdentityDriverOptions) {
    this.transport = options.transport;
    this.selectors = options.selectors ?? [];
    for (const selector of this.selectors) {
      validateSelector(selector);
    }
  }

  getSelectors(): readonly SpiffeSelector[] {
    return this.selectors.map((selector) => ({ ...selector }));
  }

  /** Fetch the initial X.509-SVID and subscribe to rotation updates. */
  async connect(): Promise<SvidBundle> {
    const svid = await this.transport.fetchX509Svid();
    if (!svid || !svid.spiffeId) {
      throw new SpireWorkloadApiError("Workload API returned an empty X.509-SVID");
    }
    const parts = parseSpiffeId(svid.spiffeId);
    this.activeBundle = {
      trustDomain: parts.trustDomain,
      x509Svid: svid,
      refreshedAt: new Date().toISOString(),
    };
    this.unwatch = this.transport.watchX509Svid((rotated) => {
      const nextParts = parseSpiffeId(rotated.spiffeId);
      const nextBundle: SvidBundle = {
        trustDomain: nextParts.trustDomain,
        x509Svid: rotated,
        refreshedAt: new Date().toISOString(),
      };
      this.activeBundle = nextBundle;
      for (const callback of this.rotationCallbacks) {
        callback(nextBundle);
      }
    });
    return this.activeBundle;
  }

  getActiveBundle(): SvidBundle {
    if (!this.activeBundle) {
      throw new SpireWorkloadApiError("SPIFFE driver is not connected");
    }
    return this.activeBundle;
  }

  /** Register a callback invoked on every SVID rotation; returns unsubscribe. */
  onRotation(callback: (bundle: SvidBundle) => void): () => void {
    this.rotationCallbacks.add(callback);
    return () => this.rotationCallbacks.delete(callback);
  }

  async fetchJwtSvid(audience: string): Promise<JwtSvid> {
    const jwt = await this.transport.fetchJwtSvid(audience);
    if (!jwt || !jwt.token) {
      throw new SpireWorkloadApiError("Workload API returned an empty JWT-SVID");
    }
    this.activeJwt = jwt;
    return jwt;
  }

  getActiveJwtSvid(): JwtSvid {
    if (!this.activeJwt) {
      throw new SpireWorkloadApiError("no JWT-SVID has been fetched");
    }
    return this.activeJwt;
  }

  /**
   * Pin the sandbox to an expected SPIFFE ID. Any SVID that does not match
   * (trust domain and path) is rejected, so an identity mix-up fails closed.
   */
  bindWorkload(expectedSpiffeId: SpiffeId): void {
    const expected = parseSpiffeId(expectedSpiffeId);
    const active = parseSpiffeId(this.getActiveBundle().x509Svid.spiffeId);
    if (
      expected.trustDomain !== active.trustDomain ||
      expected.path !== active.path
    ) {
      throw new SpireWorkloadApiError(
        `workload SPIFFE ID ${active.spiffeId} does not match required ${expectedSpiffeId}`,
      );
    }
  }

  /** mTLS client credentials derived from the active X.509-SVID. */
  createMtlsClientCredentials(): MtlsCredentials {
    const svid = this.getActiveBundle().x509Svid;
    return {
      spiffeId: svid.spiffeId,
      certChain: [...svid.certChain],
      privateKey: svid.privateKey,
      trustBundle: [...svid.bundle],
      expiresAt: svid.expiresAt,
    };
  }

  /** mTLS server credentials derived from the active X.509-SVID. */
  createMtlsServerCredentials(): MtlsCredentials {
    return this.createMtlsClientCredentials();
  }

  close(): void {
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = undefined;
    }
    this.rotationCallbacks.clear();
    this.activeBundle = undefined;
    this.activeJwt = undefined;
  }
}
