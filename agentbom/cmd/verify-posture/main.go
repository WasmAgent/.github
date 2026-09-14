// Command verify-posture verifies an agent manifest's declared MCP surface
// against the organization MCP Posture policy.
//
// Usage:
//
//	verify-posture --manifest examples/manifest.yaml
//
// The command exits 0 on a passing posture and 1 on a failing posture or an
// unreadable/invalid manifest.
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/WasmAgent/.github/agentbom"
)

func main() {
	manifestPath := flag.String("manifest", "", "path to the agent manifest (YAML)")
	policyPath := flag.String("policy", "", "optional path to a posture policy JSON file")
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "Usage: verify-posture --manifest <manifest.yaml> [--policy <policy.json>]\n")
		flag.PrintDefaults()
	}
	flag.Parse()

	if *manifestPath == "" {
		fmt.Fprintln(os.Stderr, "error: --manifest is required (e.g. verify-posture --manifest examples/manifest.yaml)")
		flag.Usage()
		os.Exit(2)
	}

	policy := agentbom.DefaultPosturePolicy()
	if *policyPath != "" {
		loaded, err := agentbom.LoadPolicyJSON(*policyPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(2)
		}
		policy = *loaded
	}

	result, err := agentbom.VerifyPosture(*manifestPath, policy)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(result.String())
	if !result.Pass {
		os.Exit(1)
	}
}
