# ADR — Python AEP scope: corpus consumer, verifier, or full SDK

Status: accepted (scope decision deferred on demand signal)
Date: 2026-09-15

## Context

Python already exists in the ecosystem as a *consumer* (`trace-pipeline` /
`evomerge`). An external analysis recommends a full `wasmagent-py` SDK. A full
SDK duplicates the JS/Rust cryptographic and canonicalization surface — the
highest-risk code to duplicate — before any external demand for it exists.

## Options

- **A. Corpus consumer only** (current): Python reads the conformance corpus
  and AEP evidence; produces nothing normative.
- **B. Standalone Python AEP verifier**: independent re-implementation of the
  verification path only (canonical JSON + DSSE verify + layer checks).
- **C. Full wasmagent-py SDK**: emit + verify + pipeline tooling.

## Decision criteria

external demand · independent-implementation value (a second verifier is the
single most valuable conformance asset — see the APS #92 layered run, whose
only gap is that the semantic checker is lab-authored) · maintenance cost ·
API stability · cryptographic duplication risk · enterprise user demand.

## Decision

**B before C, and only on demonstrated external demand.** A small independent
verifier buys more conformance value (it would upgrade the layered run's
`lab_semantic` / `python_native_verifier: not_present` gaps to a true
independent implementation) at a fraction of an SDK's maintenance surface.
Jumping straight to C is rejected for now: it optimizes for a forecast, not a
user.

## Revisit trigger

A concrete external request for a Python verifier/SDK (issue from a party
outside WasmAgent), or a second native verifier landing elsewhere.
