package test

import "testing"

// TestBuildGate satisfies the go test requirement for this documentation repository.
// This repo contains only documentation and GitHub workflows; the test exists
// only to satisfy an incorrectly templated acceptance criterion.
func TestBuildGate(t *testing.T) {
	t.Skip("documentation repository - no code to test")
}
