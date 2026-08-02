// Command wasmagent-mesh is the control plane CLI for multi-cluster agent
// mesh synchronization and cross-domain attestation.
//
// Usage:
//
//	wasmagent-mesh sync --peers mesh-peers.yaml [--dry-run] [--verbose]
//
// The canonical peer mesh configuration lives in wasmagent-ops/federation/
// and is declared in mesh-peers.yaml. A sync cycle pulls the configured
// artifact scopes from every peer control plane, verifies cross-domain
// attestation against the federation trust roots, admits signed evidence
// into the local audit ledger, and quarantines anything that fails.
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/WasmAgent/.github/wasmagent-ops/federation"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		usage(stderr)
		return 2
	}
	switch args[0] {
	case "sync":
		return runSync(args[1:], stdout, stderr)
	case "help", "-h", "--help":
		usage(stdout)
		return 0
	default:
		fmt.Fprintf(stderr, "wasmagent-mesh: unknown command %q\n\n", args[0])
		usage(stderr)
		return 2
	}
}

func usage(w io.Writer) {
	fmt.Fprintln(w, "wasmagent-mesh — control plane for multi-cluster agent mesh synchronization and cross-domain attestation")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Usage:")
	fmt.Fprintln(w, "  wasmagent-mesh sync --peers mesh-peers.yaml [--dry-run] [--verbose]")
}

func runSync(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("wasmagent-mesh sync", flag.ContinueOnError)
	fs.SetOutput(stderr)
	peersPath := fs.String("peers", federation.DefaultConfigPath, "path to the mesh peers configuration (mesh-peers.yaml)")
	dryRun := fs.Bool("dry-run", false, "validate the mesh configuration and print the sync plan without contacting peer control planes")
	trustRootsPath := fs.String("trust-roots", "", "path to a JSON file mapping trust root URNs to base64 Ed25519 public keys (optional; evidence is quarantined when omitted)")
	verbose := fs.Bool("verbose", false, "print per-artifact sync decisions")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if fs.NArg() > 0 {
		fmt.Fprintf(stderr, "wasmagent-mesh sync: unexpected arguments: %v\n", fs.Args())
		return 2
	}

	cfg, err := federation.LoadMeshPeers(*peersPath)
	if err != nil {
		fmt.Fprintf(stderr, "wasmagent-mesh sync: %v\n", err)
		return 1
	}
	if err := cfg.Validate(); err != nil {
		fmt.Fprintf(stderr, "wasmagent-mesh sync: %v\n", err)
		return 1
	}

	if *dryRun {
		plan, err := federation.BuildSyncPlan(cfg)
		if err != nil {
			fmt.Fprintf(stderr, "wasmagent-mesh sync: %v\n", err)
			return 1
		}
		printSyncPlan(plan, stdout)
		return 0
	}

	trustRoots, err := loadTrustRoots(*trustRootsPath)
	if err != nil {
		fmt.Fprintf(stderr, "wasmagent-mesh sync: %v\n", err)
		return 1
	}

	engine := federation.NewSyncEngine(cfg, federation.NewHTTPPeerFetcher(), federation.NewEd25519Verifier(trustRoots))
	result, err := engine.Sync(context.Background())
	if err != nil {
		fmt.Fprintf(stderr, "wasmagent-mesh sync: %v\n", err)
		return 1
	}

	fmt.Fprintf(stdout, "mesh %s sync complete: %d peer(s), %d admitted, %d quarantined\n",
		cfg.Metadata.Name, len(result.Peers), len(result.Admitted), len(result.Quarantined))
	if *verbose {
		for _, admitted := range result.Admitted {
			fmt.Fprintf(stdout, "  admitted %s scope=%s from=%s trustRoot=%s\n", admitted.ID, admitted.Scope, admitted.Cluster, admitted.TrustRoot)
		}
		for _, q := range result.Quarantined {
			fmt.Fprintf(stdout, "  quarantined %s scope=%s from=%s reason=%s\n", q.Artifact.ID, q.Artifact.Scope, q.Artifact.Cluster, q.Reason)
		}
	}
	if len(result.Quarantined) > 0 {
		return 1
	}
	return 0
}

func printSyncPlan(plan *federation.SyncPlan, w io.Writer) {
	fmt.Fprintf(w, "mesh %s (%s) — dry-run sync plan\n", plan.MeshName, plan.APIVersion)
	fmt.Fprintf(w, "peers: %d (%s)\n", len(plan.Peers), strings.Join(plan.Peers, ", "))
	fmt.Fprintf(w, "sync mode: %s (interval %ds, conflict policy %s)\n", plan.Mode, plan.IntervalSeconds, plan.ConflictPolicy)
	fmt.Fprintf(w, "artifact scopes: %s\n", strings.Join(plan.Include, ", "))
	fmt.Fprintf(w, "excluded scopes: %s\n", strings.Join(plan.Exclude, ", "))
	fmt.Fprintf(w, "cross-domain attestation: mode=%s trustRoots=%d requireSignedEvidence=%v\n",
		plan.VerificationMode, len(plan.TrustRoots), plan.RequireSignedEvidence)
	fmt.Fprintln(w, "sync plan validated — no artifacts transferred (dry-run)")
}

// loadTrustRoots reads a JSON file mapping trust root URNs to base64-encoded
// Ed25519 public keys. An empty path yields no trust anchors, which quarantines
// all evidence (safe default: a federated mesh never admits unsigned evidence).
func loadTrustRoots(path string) (map[string]ed25519.PublicKey, error) {
	if path == "" {
		return map[string]ed25519.PublicKey{}, nil
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read trust roots: %w", err)
	}
	var raw map[string]string
	if err := json.Unmarshal(content, &raw); err != nil {
		return nil, fmt.Errorf("parse trust roots: %w", err)
	}
	roots := make(map[string]ed25519.PublicKey, len(raw))
	for urn, b64 := range raw {
		keyBytes, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return nil, fmt.Errorf("trust root %q: %w", urn, err)
		}
		if len(keyBytes) != ed25519.PublicKeySize {
			return nil, fmt.Errorf("trust root %q: expected %d-byte Ed25519 public key, got %d", urn, ed25519.PublicKeySize, len(keyBytes))
		}
		roots[urn] = ed25519.PublicKey(keyBytes)
	}
	return roots, nil
}
