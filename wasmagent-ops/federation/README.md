# wasmagent-ops/federation — Multi-cluster agent mesh control plane

`wasmagent-ops/federation/` is the control plane for multi-cluster agent mesh
synchronization and cross-domain attestation. It owns the peer mesh topology
(`mesh-peers.yaml`) consumed by the `wasmagent-mesh` CLI, plus the
synchronization and cross-domain attestation semantics that every participating
WasmAgent cluster follows when exchanging trust artifacts.

## CLI

The control plane is driven through the `wasmagent-mesh` CLI:

```sh
wasmagent-mesh sync --peers mesh-peers.yaml
```

`mesh-peers.yaml` declares:

- the participating clusters (control-plane endpoints and attestation domains),
- the sync policy (mode, cadence, conflict resolution, artifact scopes), and
- the cross-domain attestation requirements (verification mode, trust roots,
  signed-evidence policy).

`wasmagent-mesh sync` connects to each peer control plane, pulls the declared
trust artifacts, verifies their signatures against the federation trust roots,
and admits the verified evidence into the local audit ledger. Artifacts that
fail cross-domain attestation are quarantined and reported instead of being
propagated.

## Mesh peer topology

A mesh is a set of clusters, each with:

- `name` — stable cluster identifier used in audit references,
- `region` — deployment region for operational routing,
- `controlPlane` — HTTPS endpoint of the cluster's mesh control plane, and
- `attestationDomain` — SPIFFE-style domain that anchors the cluster's
  attestation identity for cross-domain verification.

Peers must be reachable over mutually authenticated (mTLS) channels; the
control plane never falls back to plaintext sync.

## Synchronization

Sync is governed by a declarative policy in `mesh-peers.yaml`:

- `mode` — `bidirectional` (all peers exchange artifacts) or `unidirectional`
  (one-way propagation from a source mesh to consumers),
- `intervalSeconds` — synchronization cadence,
- `conflictPolicy` — conflict resolution rule when two peers publish divergent
  revisions of the same artifact,
- `include` / `exclude` — artifact scopes propagated across the mesh. Secrets
  and other sensitive payloads are always excluded from mesh propagation.

Every synced artifact must carry a signed AEP evidence envelope before it is
admitted into the receiving cluster's ledger.

## Cross-domain attestation

The control plane enforces cross-domain attestation on every sync:

- `crossDomain` — enables verification of attestation identities across
  cluster boundaries (must be `true` for a mesh),
- `verificationMode` — `verify-on-sync` verifies signatures and trust-root
  membership at admission time; other modes (e.g. `verify-on-demand`) defer
  verification to explicit queries,
- `trustRoots` — the federation trust roots that sign cluster attestation
  identities and trust artifacts,
- `requireSignedEvidence` — when `true`, unsigned evidence is rejected at
  admission and never propagated.

This gives operators a single control plane from which multi-cluster trust
synchronization and cross-domain attestation can be observed, audited, and
governed.
