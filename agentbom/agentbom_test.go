package agentbom

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestReferenceArtifactsValidate ensures all three code-generated reference
// artifacts (AgentBOM, MCP Posture, Trust Passport) are valid.
func TestReferenceArtifactsValidate(t *testing.T) {
	artifacts := []Artifact{
		NewReferenceAgentBOM(),
		NewReferenceMCPPosture(),
		NewReferenceTrustPassport(),
	}
	for _, artifact := range artifacts {
		if err := Validate(artifact); err != nil {
			t.Errorf("reference artifact failed validation: %v", err)
		}
	}
}

// TestReferenceArtifactsJSONRoundTrip verifies each artifact type survives a
// marshal → parse round trip against its reference schema.
func TestReferenceArtifactsJSONRoundTrip(t *testing.T) {
	tests := []struct {
		name     string
		artifact Artifact
		parse    func(data []byte) (Artifact, error)
	}{
		{
			name:     "AgentBOM",
			artifact: NewReferenceAgentBOM(),
			parse: func(data []byte) (Artifact, error) {
				return ParseAgentBOM(data)
			},
		},
		{
			name:     "MCPPosture",
			artifact: NewReferenceMCPPosture(),
			parse: func(data []byte) (Artifact, error) {
				return ParseMCPPosture(data)
			},
		},
		{
			name:     "TrustPassport",
			artifact: NewReferenceTrustPassport(),
			parse: func(data []byte) (Artifact, error) {
				return ParseTrustPassport(data)
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			data, err := json.Marshal(tc.artifact)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			if _, err := tc.parse(data); err != nil {
				t.Fatalf("parse round-trip: %v", err)
			}
		})
	}
}

// TestAgentBOMValidation exercises the AgentBOM reference schema rules.
func TestAgentBOMValidation(t *testing.T) {
	mutators := []struct {
		name   string
		mutate func(b *AgentBOM)
	}{
		{"missing schema", func(b *AgentBOM) { b.Schema = "" }},
		{"wrong bomFormat", func(b *AgentBOM) { b.BOMFormat = "SBOM" }},
		{"missing specVersion", func(b *AgentBOM) { b.SpecVersion = "" }},
		{"missing generated", func(b *AgentBOM) { b.Metadata.Generated = "" }},
		{"malformed generated", func(b *AgentBOM) { b.Metadata.Generated = "not-a-timestamp" }},
		{"missing repository", func(b *AgentBOM) { b.Metadata.Repository = "" }},
		{"empty components", func(b *AgentBOM) { b.Components = nil }},
		{"component missing version", func(b *AgentBOM) { b.Components[0].Version = "" }},
		{"component missing name", func(b *AgentBOM) { b.Components[0].Name = "" }},
		{"component missing type", func(b *AgentBOM) { b.Components[0].Type = "" }},
	}
	for _, tc := range mutators {
		t.Run(tc.name, func(t *testing.T) {
			bom := NewReferenceAgentBOM()
			tc.mutate(bom)
			if err := bom.Validate(); err == nil {
				t.Error("expected validation error, got nil")
			}
		})
	}
}

// TestMCPPostureValidation exercises the MCP Posture reference schema rules.
func TestMCPPostureValidation(t *testing.T) {
	mutators := []struct {
		name   string
		mutate func(p *MCPPosture)
	}{
		{"missing schema", func(p *MCPPosture) { p.Schema = "" }},
		{"wrong postureFormat", func(p *MCPPosture) { p.PostureFormat = "Posture" }},
		{"missing specVersion", func(p *MCPPosture) { p.SpecVersion = "" }},
		{"empty servers", func(p *MCPPosture) { p.DeclaredServers = nil }},
		{"server missing name", func(p *MCPPosture) { p.DeclaredServers[0].Name = "" }},
		{"server missing endpoint", func(p *MCPPosture) { p.DeclaredServers[0].Endpoint = "" }},
		{"empty tools", func(p *MCPPosture) { p.DeclaredTools = nil }},
		{"tool missing name", func(p *MCPPosture) { p.DeclaredTools[0].Name = "" }},
		{"tool missing category", func(p *MCPPosture) { p.DeclaredTools[0].Category = "" }},
		{"empty allowedOperations", func(p *MCPPosture) { p.Capabilities.AllowedOperations = nil }},
		{"missing auditLevel", func(p *MCPPosture) { p.Capabilities.AuditLevel = "" }},
	}
	for _, tc := range mutators {
		t.Run(tc.name, func(t *testing.T) {
			posture := NewReferenceMCPPosture()
			tc.mutate(posture)
			if err := posture.Validate(); err == nil {
				t.Error("expected validation error, got nil")
			}
		})
	}
}

// TestTrustPassportValidation exercises the Trust Passport reference schema
// rules.
func TestTrustPassportValidation(t *testing.T) {
	mutators := []struct {
		name   string
		mutate func(p *TrustPassport)
	}{
		{"missing schema", func(p *TrustPassport) { p.Schema = "" }},
		{"wrong passportFormat", func(p *TrustPassport) { p.PassportFormat = "Passport" }},
		{"missing specVersion", func(p *TrustPassport) { p.SpecVersion = "" }},
		{"missing agentId", func(p *TrustPassport) { p.Identity.AgentID = "" }},
		{"missing identity version", func(p *TrustPassport) { p.Identity.Version = "" }},
		{"missing timestamp", func(p *TrustPassport) { p.Identity.Timestamp = "" }},
		{"malformed timestamp", func(p *TrustPassport) { p.Identity.Timestamp = "yesterday" }},
		{"empty declaredTools", func(p *TrustPassport) { p.Posture.DeclaredTools = nil }},
		{"unrecognized complianceStatus", func(p *TrustPassport) { p.Posture.ComplianceStatus = "purple" }},
		{"empty evidence", func(p *TrustPassport) { p.Evidence = nil }},
		{"evidence missing type", func(p *TrustPassport) { p.Evidence[0].Type = "" }},
		{"evidence missing signature", func(p *TrustPassport) { p.Evidence[0].Signature = "" }},
		{"trustScore above 1", func(p *TrustPassport) { p.TrustScore = 1.5 }},
		{"trustScore negative", func(p *TrustPassport) { p.TrustScore = -0.1 }},
	}
	for _, tc := range mutators {
		t.Run(tc.name, func(t *testing.T) {
			passport := NewReferenceTrustPassport()
			tc.mutate(passport)
			if err := passport.Validate(); err == nil {
				t.Error("expected validation error, got nil")
			}
		})
	}
}

// TestCanonicalFixturesConform proves the reference implementation accepts
// the canonical fixtures shipped in tests/e2e/fixtures for all three artifact
// types.
func TestCanonicalFixturesConform(t *testing.T) {
	tests := []struct {
		name  string
		path  string
		parse func(data []byte) error
	}{
		{
			name: "AgentBOM",
			path: filepath.Join("..", "tests", "e2e", "fixtures", "agentbom-sample.json"),
			parse: func(data []byte) error {
				_, err := ParseAgentBOM(data)
				return err
			},
		},
		{
			name: "MCPPosture",
			path: filepath.Join("..", "tests", "e2e", "fixtures", "mcp-posture-sample.json"),
			parse: func(data []byte) error {
				_, err := ParseMCPPosture(data)
				return err
			},
		},
		{
			name: "TrustPassport",
			path: filepath.Join("..", "tests", "e2e", "fixtures", "trust-passport-sample.json"),
			parse: func(data []byte) error {
				_, err := ParseTrustPassport(data)
				return err
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			data, err := os.ReadFile(tc.path)
			if err != nil {
				t.Fatalf("fixture not found: %v", err)
			}
			if err := tc.parse(data); err != nil {
				t.Errorf("canonical fixture failed reference validation: %v", err)
			}
		})
	}
}

// TestBuildTrustPassport verifies the reference chain that links an AgentBOM
// and an MCP Posture into a Trust Passport.
func TestBuildTrustPassport(t *testing.T) {
	bom := NewReferenceAgentBOM()
	posture := NewReferenceMCPPosture()
	identity := PassportIdentity{
		AgentID:   "github.com/WasmAgent/golden-path-agent",
		Version:   "1.0.0",
		Timestamp: "2026-07-07T00:00:00Z",
	}
	evidence := []EvidenceRef{
		{Type: "AEP", Location: "evidence/events.jsonl", Signature: "ed25519:test-signature"},
	}

	passport, err := BuildTrustPassport(identity, bom, posture, evidence, 0.95)
	if err != nil {
		t.Fatalf("BuildTrustPassport failed: %v", err)
	}
	if err := passport.Validate(); err != nil {
		t.Fatalf("built passport failed validation: %v", err)
	}
	if len(passport.Posture.DeclaredTools) != len(posture.DeclaredTools) {
		t.Errorf("declaredTools = %v, want %d tools", passport.Posture.DeclaredTools, len(posture.DeclaredTools))
	}
	if passport.TrustScore != 0.95 {
		t.Errorf("trustScore = %v, want 0.95", passport.TrustScore)
	}
	if passport.Posture.ComplianceStatus != "compliant" {
		t.Errorf("complianceStatus = %q, want compliant", passport.Posture.ComplianceStatus)
	}
	if !strings.Contains(passport.Metadata.Repository, "WasmAgent") {
		t.Errorf("metadata.repository = %q, want a WasmAgent repo", passport.Metadata.Repository)
	}
	if len(passport.Posture.ObservedCapabilities) == 0 {
		t.Error("observedCapabilities must be derived from the posture servers")
	}
}

// TestBuildTrustPassportRejectsInvalidInput ensures the reference chain fails
// closed on malformed input.
func TestBuildTrustPassportRejectsInvalidInput(t *testing.T) {
	identity := PassportIdentity{
		AgentID:   "github.com/WasmAgent/test-agent",
		Version:   "1.0.0",
		Timestamp: "2026-07-07T00:00:00Z",
	}
	evidence := []EvidenceRef{
		{Type: "AEP", Location: "evidence/events.jsonl", Signature: "ed25519:test"},
	}

	if _, err := BuildTrustPassport(identity, NewReferenceAgentBOM(), NewReferenceMCPPosture(), nil, 0.95); err == nil {
		t.Error("expected error for empty evidence, got nil")
	}
	if _, err := BuildTrustPassport(PassportIdentity{}, NewReferenceAgentBOM(), NewReferenceMCPPosture(), evidence, 0.95); err == nil {
		t.Error("expected error for empty identity, got nil")
	}
	badBOM := NewReferenceAgentBOM()
	badBOM.Components = nil
	if _, err := BuildTrustPassport(identity, badBOM, NewReferenceMCPPosture(), evidence, 0.95); err == nil {
		t.Error("expected error for invalid AgentBOM, got nil")
	}
	badPosture := NewReferenceMCPPosture()
	badPosture.DeclaredTools = nil
	if _, err := BuildTrustPassport(identity, NewReferenceAgentBOM(), badPosture, evidence, 0.95); err == nil {
		t.Error("expected error for invalid MCPPosture, got nil")
	}
}

// TestValidateNilArtifact ensures the Validate dispatcher rejects nil values.
func TestValidateNilArtifact(t *testing.T) {
	if err := Validate(nil); err == nil {
		t.Error("expected error for nil artifact, got nil")
	}
	var typedNil *AgentBOM
	if err := Validate(typedNil); err == nil {
		t.Error("expected error for typed-nil artifact, got nil")
	}
}
