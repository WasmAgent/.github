// Package agentbom provides a dependency-free reference implementation of the
// three WasmAgent trust artifact types:
//
//   - AgentBOM — a bill of materials for an agent: the versioned components
//     (runtime, tools, model, dependencies) an agent is built from, plus
//     provenance metadata.
//   - MCPPosture — the declared MCP surface and capability envelope of an
//     agent: MCP servers, declared tools, allowed operations, restricted
//     paths, and audit level.
//   - TrustPassport — a portable, verifiable bundle that binds agent
//     identity, a posture snapshot, signed evidence references, and a trust
//     score.
//
// The JSON shapes mirror the canonical fixtures shipped in
// tests/e2e/fixtures and the JSON Schemas referenced by their $schema fields
// (https://wasmagent.github.io/agent-trust-infra/schemas/). Every artifact
// type implements Validate, and the package additionally provides JSON parse
// helpers, code-generated reference samples, and a BuildTrustPassport helper
// that links an AgentBOM and MCP Posture into a Trust Passport — the
// reference chain between the three artifact types.
//
// The package has no external dependencies and is safe to embed in
// generators, CI gates, or downstream tooling.
package agentbom

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// ArtifactKind enumerates the three trust artifact types covered by this
// reference implementation.
type ArtifactKind string

const (
	// KindAgentBOM is an Agent Bill of Materials.
	KindAgentBOM ArtifactKind = "AgentBOM"
	// KindMCPPosture is an MCP Posture artifact.
	KindMCPPosture ArtifactKind = "MCPPosture"
	// KindTrustPassport is a Trust Passport artifact.
	KindTrustPassport ArtifactKind = "TrustPassport"
)

// Canonical JSON Schema URLs for each artifact type. These match the $schema
// values used by the canonical fixtures and are the machine-readable
// contracts the reference implementation validates against.
const (
	SchemaURLAgentBOM      = "https://wasmagent.github.io/agent-trust-infra/schemas/agentbom-1.json"
	SchemaURLMCPPosture    = "https://wasmagent.github.io/agent-trust-infra/schemas/mcp-posture-1.json"
	SchemaURLTrustPassport = "https://wasmagent.github.io/agent-trust-infra/schemas/trust-passport-1.json"
)

// Artifact is any of the three trust artifact types. Validate reports
// structural conformance against the reference schema.
type Artifact interface {
	Validate() error
}

// Metadata is the provenance block shared by every trust artifact type.
type Metadata struct {
	Generated  string `json:"generated"`
	Repository string `json:"repository"`
	Release    string `json:"release,omitempty"`
	Generator  string `json:"generator,omitempty"`
}

func (m *Metadata) validate(kind ArtifactKind) error {
	if strings.TrimSpace(m.Generated) == "" {
		return fmt.Errorf("%s: metadata.generated is required", kind)
	}
	if _, err := time.Parse(time.RFC3339, m.Generated); err != nil {
		return fmt.Errorf("%s: metadata.generated must be an RFC3339 timestamp: %v", kind, err)
	}
	if strings.TrimSpace(m.Repository) == "" {
		return fmt.Errorf("%s: metadata.repository is required", kind)
	}
	return nil
}

// Component is a single element of an AgentBOM (runtime, tool, model, ...).
type Component struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description,omitempty"`
}

// AgentBOM is the Agent Bill of Materials artifact: a versioned inventory of
// the components an agent is built from.
type AgentBOM struct {
	Schema      string      `json:"$schema"`
	BOMFormat   string      `json:"bomFormat"`
	SpecVersion string      `json:"specVersion"`
	Metadata    Metadata    `json:"metadata"`
	Components  []Component `json:"components"`
}

// Validate checks structural conformance of the AgentBOM against the
// reference schema.
func (b *AgentBOM) Validate() error {
	if b.Schema != SchemaURLAgentBOM {
		return fmt.Errorf("AgentBOM: $schema must be %q", SchemaURLAgentBOM)
	}
	if b.BOMFormat != string(KindAgentBOM) {
		return fmt.Errorf("AgentBOM: bomFormat must be %q", KindAgentBOM)
	}
	if strings.TrimSpace(b.SpecVersion) == "" {
		return fmt.Errorf("AgentBOM: specVersion is required")
	}
	if err := b.Metadata.validate(KindAgentBOM); err != nil {
		return err
	}
	if len(b.Components) == 0 {
		return fmt.Errorf("AgentBOM: components must contain at least one component")
	}
	for i, c := range b.Components {
		if strings.TrimSpace(c.Type) == "" {
			return fmt.Errorf("AgentBOM: components[%d].type is required", i)
		}
		if strings.TrimSpace(c.Name) == "" {
			return fmt.Errorf("AgentBOM: components[%d].name is required", i)
		}
		if strings.TrimSpace(c.Version) == "" {
			return fmt.Errorf("AgentBOM: components[%d].version is required", i)
		}
	}
	return nil
}

// MCPServer is a declared MCP server connection in an MCP Posture.
type MCPServer struct {
	Name         string   `json:"name"`
	Endpoint     string   `json:"endpoint"`
	Capabilities []string `json:"capabilities"`
}

// MCPTool is a declared tool exposed by an MCP server.
type MCPTool struct {
	Name      string `json:"name"`
	Category  string `json:"category"`
	RiskLevel string `json:"riskLevel,omitempty"`
}

// PostureCapabilities is the operational envelope declared by an MCP Posture.
type PostureCapabilities struct {
	AllowedOperations []string `json:"allowedOperations"`
	RestrictedPaths   []string `json:"restrictedPaths,omitempty"`
	AuditLevel        string   `json:"auditLevel"`
}

// MCPPosture is the MCP Posture artifact: the declared MCP surface and
// capability envelope of an agent.
type MCPPosture struct {
	Schema          string              `json:"$schema"`
	PostureFormat   string              `json:"postureFormat"`
	SpecVersion     string              `json:"specVersion"`
	Metadata        Metadata            `json:"metadata"`
	DeclaredServers []MCPServer         `json:"declaredServers"`
	DeclaredTools   []MCPTool           `json:"declaredTools"`
	Capabilities    PostureCapabilities `json:"capabilities"`
}

// Validate checks structural conformance of the MCP Posture against the
// reference schema.
func (p *MCPPosture) Validate() error {
	if p.Schema != SchemaURLMCPPosture {
		return fmt.Errorf("MCPPosture: $schema must be %q", SchemaURLMCPPosture)
	}
	if p.PostureFormat != string(KindMCPPosture) {
		return fmt.Errorf("MCPPosture: postureFormat must be %q", KindMCPPosture)
	}
	if strings.TrimSpace(p.SpecVersion) == "" {
		return fmt.Errorf("MCPPosture: specVersion is required")
	}
	if err := p.Metadata.validate(KindMCPPosture); err != nil {
		return err
	}
	if len(p.DeclaredServers) == 0 {
		return fmt.Errorf("MCPPosture: declaredServers must contain at least one server")
	}
	for i, s := range p.DeclaredServers {
		if strings.TrimSpace(s.Name) == "" {
			return fmt.Errorf("MCPPosture: declaredServers[%d].name is required", i)
		}
		if strings.TrimSpace(s.Endpoint) == "" {
			return fmt.Errorf("MCPPosture: declaredServers[%d].endpoint is required", i)
		}
	}
	if len(p.DeclaredTools) == 0 {
		return fmt.Errorf("MCPPosture: declaredTools must contain at least one tool")
	}
	for i, tool := range p.DeclaredTools {
		if strings.TrimSpace(tool.Name) == "" {
			return fmt.Errorf("MCPPosture: declaredTools[%d].name is required", i)
		}
		if strings.TrimSpace(tool.Category) == "" {
			return fmt.Errorf("MCPPosture: declaredTools[%d].category is required", i)
		}
	}
	if len(p.Capabilities.AllowedOperations) == 0 {
		return fmt.Errorf("MCPPosture: capabilities.allowedOperations must contain at least one operation")
	}
	if strings.TrimSpace(p.Capabilities.AuditLevel) == "" {
		return fmt.Errorf("MCPPosture: capabilities.auditLevel is required")
	}
	return nil
}

// PassportIdentity identifies an agent in a Trust Passport.
type PassportIdentity struct {
	AgentID   string `json:"agentId"`
	Version   string `json:"version"`
	Timestamp string `json:"timestamp"`
}

// PassportPosture is the posture snapshot embedded in a Trust Passport.
type PassportPosture struct {
	DeclaredTools        []string `json:"declaredTools"`
	ObservedCapabilities []string `json:"observedCapabilities"`
	ComplianceStatus     string   `json:"complianceStatus"`
}

// EvidenceRef points at signed evidence backing a Trust Passport.
type EvidenceRef struct {
	Type      string `json:"type"`
	Location  string `json:"location"`
	Signature string `json:"signature"`
}

// TrustPassport is the Trust Passport artifact: a portable, verifiable bundle
// of agent identity, posture snapshot, signed evidence references, and a
// trust score.
type TrustPassport struct {
	Schema         string           `json:"$schema"`
	PassportFormat string           `json:"passportFormat"`
	SpecVersion    string           `json:"specVersion"`
	Metadata       Metadata         `json:"metadata"`
	Identity       PassportIdentity `json:"identity"`
	Posture        PassportPosture  `json:"posture"`
	Evidence       []EvidenceRef    `json:"evidence"`
	TrustScore     float64          `json:"trustScore"`
}

// Validate checks structural conformance of the Trust Passport against the
// reference schema.
func (t *TrustPassport) Validate() error {
	if t.Schema != SchemaURLTrustPassport {
		return fmt.Errorf("TrustPassport: $schema must be %q", SchemaURLTrustPassport)
	}
	if t.PassportFormat != string(KindTrustPassport) {
		return fmt.Errorf("TrustPassport: passportFormat must be %q", KindTrustPassport)
	}
	if strings.TrimSpace(t.SpecVersion) == "" {
		return fmt.Errorf("TrustPassport: specVersion is required")
	}
	if err := t.Metadata.validate(KindTrustPassport); err != nil {
		return err
	}
	if strings.TrimSpace(t.Identity.AgentID) == "" {
		return fmt.Errorf("TrustPassport: identity.agentId is required")
	}
	if strings.TrimSpace(t.Identity.Version) == "" {
		return fmt.Errorf("TrustPassport: identity.version is required")
	}
	if strings.TrimSpace(t.Identity.Timestamp) == "" {
		return fmt.Errorf("TrustPassport: identity.timestamp is required")
	}
	if _, err := time.Parse(time.RFC3339, t.Identity.Timestamp); err != nil {
		return fmt.Errorf("TrustPassport: identity.timestamp must be an RFC3339 timestamp: %v", err)
	}
	if len(t.Posture.DeclaredTools) == 0 {
		return fmt.Errorf("TrustPassport: posture.declaredTools must contain at least one tool")
	}
	switch t.Posture.ComplianceStatus {
	case "compliant", "non-compliant", "unknown":
	default:
		return fmt.Errorf("TrustPassport: posture.complianceStatus %q is not recognized", t.Posture.ComplianceStatus)
	}
	if len(t.Evidence) == 0 {
		return fmt.Errorf("TrustPassport: evidence must contain at least one signed reference")
	}
	for i, e := range t.Evidence {
		if strings.TrimSpace(e.Type) == "" {
			return fmt.Errorf("TrustPassport: evidence[%d].type is required", i)
		}
		if strings.TrimSpace(e.Location) == "" {
			return fmt.Errorf("TrustPassport: evidence[%d].location is required", i)
		}
		if strings.TrimSpace(e.Signature) == "" {
			return fmt.Errorf("TrustPassport: evidence[%d].signature is required", i)
		}
	}
	if t.TrustScore < 0 || t.TrustScore > 1 {
		return fmt.Errorf("TrustPassport: trustScore must be in the range [0, 1], got %v", t.TrustScore)
	}
	return nil
}

// Validate reports whether the given artifact conforms to its reference
// schema. It accepts any of the three artifact types and rejects nil values.
func Validate(a Artifact) error {
	if a == nil {
		return fmt.Errorf("agentbom: cannot validate a nil artifact")
	}
	switch v := a.(type) {
	case nil:
		return fmt.Errorf("agentbom: cannot validate a nil artifact")
	case *AgentBOM:
		if v == nil {
			return fmt.Errorf("agentbom: cannot validate a nil AgentBOM")
		}
	case *MCPPosture:
		if v == nil {
			return fmt.Errorf("agentbom: cannot validate a nil MCPPosture")
		}
	case *TrustPassport:
		if v == nil {
			return fmt.Errorf("agentbom: cannot validate a nil TrustPassport")
		}
	}
	return a.Validate()
}

// ParseAgentBOM parses a JSON AgentBOM document and validates it.
func ParseAgentBOM(data []byte) (*AgentBOM, error) {
	var b AgentBOM
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, fmt.Errorf("agentbom: parse AgentBOM: %w", err)
	}
	if err := b.Validate(); err != nil {
		return nil, err
	}
	return &b, nil
}

// ParseMCPPosture parses a JSON MCP Posture document and validates it.
func ParseMCPPosture(data []byte) (*MCPPosture, error) {
	var p MCPPosture
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("agentbom: parse MCPPosture: %w", err)
	}
	if err := p.Validate(); err != nil {
		return nil, err
	}
	return &p, nil
}

// ParseTrustPassport parses a JSON Trust Passport document and validates it.
func ParseTrustPassport(data []byte) (*TrustPassport, error) {
	var t TrustPassport
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("agentbom: parse TrustPassport: %w", err)
	}
	if err := t.Validate(); err != nil {
		return nil, err
	}
	return &t, nil
}

// NewReferenceAgentBOM returns a valid, code-generated reference AgentBOM for
// the WasmAgent Golden Path stack.
func NewReferenceAgentBOM() *AgentBOM {
	return &AgentBOM{
		Schema:      SchemaURLAgentBOM,
		BOMFormat:   string(KindAgentBOM),
		SpecVersion: "1.0",
		Metadata: Metadata{
			Generated:  time.Now().UTC().Format(time.RFC3339),
			Repository: "WasmAgent/.github",
			Release:    "v1.0.0",
			Generator:  "agentbom (reference implementation)",
		},
		Components: []Component{
			{Type: "runtime", Name: "wasmagent-js", Version: "3.1.1", Description: "WASM sandbox and MCP firewall"},
			{Type: "tool", Name: "file-system", Version: "1.0.0", Description: "File system access tool"},
			{Type: "tool", Name: "network", Version: "1.0.0", Description: "Read-only network tool"},
		},
	}
}

// NewReferenceMCPPosture returns a valid, code-generated reference MCP
// Posture describing the MCP surface of the reference agent.
func NewReferenceMCPPosture() *MCPPosture {
	return &MCPPosture{
		Schema:        SchemaURLMCPPosture,
		PostureFormat: string(KindMCPPosture),
		SpecVersion:   "1.0",
		Metadata: Metadata{
			Generated:  time.Now().UTC().Format(time.RFC3339),
			Repository: "WasmAgent/.github",
			Release:    "v1.0.0",
			Generator:  "agentbom (reference implementation)",
		},
		DeclaredServers: []MCPServer{
			{Name: "filesystem-server", Endpoint: "stdio", Capabilities: []string{"read", "write"}},
			{Name: "network-server", Endpoint: "http://127.0.0.1:8080", Capabilities: []string{"read"}},
		},
		DeclaredTools: []MCPTool{
			{Name: "read_file", Category: "file-system", RiskLevel: "low"},
			{Name: "write_file", Category: "file-system", RiskLevel: "medium"},
			{Name: "http_get", Category: "network", RiskLevel: "low"},
		},
		Capabilities: PostureCapabilities{
			AllowedOperations: []string{"read", "write", "execute"},
			RestrictedPaths:   []string{"/etc", "/usr/bin"},
			AuditLevel:        "full",
		},
	}
}

// NewReferenceTrustPassport returns a valid, code-generated reference Trust
// Passport for the reference agent.
func NewReferenceTrustPassport() *TrustPassport {
	return &TrustPassport{
		Schema:         SchemaURLTrustPassport,
		PassportFormat: string(KindTrustPassport),
		SpecVersion:    "1.0",
		Metadata: Metadata{
			Generated:  time.Now().UTC().Format(time.RFC3339),
			Repository: "WasmAgent/.github",
			Release:    "v1.0.0",
			Generator:  "agentbom (reference implementation)",
		},
		Identity: PassportIdentity{
			AgentID:   "github.com/WasmAgent/golden-path-agent",
			Version:   "1.0.0",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		},
		Posture: PassportPosture{
			DeclaredTools:        []string{"http_get", "read_file", "write_file"},
			ObservedCapabilities: []string{"file-system", "network"},
			ComplianceStatus:     "compliant",
		},
		Evidence: []EvidenceRef{
			{Type: "AEP", Location: "evidence/events.jsonl", Signature: "ed25519:reference-signature"},
		},
		TrustScore: 0.95,
	}
}

// BuildTrustPassport links an AgentBOM and an MCP Posture into a Trust
// Passport — the reference chain across all three artifact types. Declared
// tools and observed capabilities are derived from the posture so the
// passport is always consistent with the posture it is built from.
func BuildTrustPassport(identity PassportIdentity, bom *AgentBOM, posture *MCPPosture, evidence []EvidenceRef, trustScore float64) (*TrustPassport, error) {
	if err := bom.Validate(); err != nil {
		return nil, fmt.Errorf("agentbom: cannot build TrustPassport from invalid AgentBOM: %w", err)
	}
	if err := posture.Validate(); err != nil {
		return nil, fmt.Errorf("agentbom: cannot build TrustPassport from invalid MCPPosture: %w", err)
	}
	if strings.TrimSpace(identity.AgentID) == "" {
		return nil, fmt.Errorf("agentbom: TrustPassport requires a non-empty identity.agentId")
	}
	if len(evidence) == 0 {
		return nil, fmt.Errorf("agentbom: TrustPassport requires at least one signed evidence reference")
	}

	declaredTools := make([]string, 0, len(posture.DeclaredTools))
	for _, tool := range posture.DeclaredTools {
		declaredTools = append(declaredTools, tool.Name)
	}
	sort.Strings(declaredTools)

	observedSet := make(map[string]struct{})
	for _, server := range posture.DeclaredServers {
		for _, capability := range server.Capabilities {
			observedSet[capability] = struct{}{}
		}
	}
	observedCaps := make([]string, 0, len(observedSet))
	for capability := range observedSet {
		observedCaps = append(observedCaps, capability)
	}
	sort.Strings(observedCaps)

	if identity.Timestamp == "" {
		identity.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	passport := &TrustPassport{
		Schema:         SchemaURLTrustPassport,
		PassportFormat: string(KindTrustPassport),
		SpecVersion:    "1.0",
		Metadata: Metadata{
			Generated:  time.Now().UTC().Format(time.RFC3339),
			Repository: bom.Metadata.Repository,
			Release:    bom.Metadata.Release,
			Generator:  "agentbom (reference implementation)",
		},
		Identity: identity,
		Posture: PassportPosture{
			DeclaredTools:        declaredTools,
			ObservedCapabilities: observedCaps,
			ComplianceStatus:     "compliant",
		},
		Evidence:   evidence,
		TrustScore: trustScore,
	}
	if err := passport.Validate(); err != nil {
		return nil, fmt.Errorf("agentbom: generated TrustPassport failed validation: %w", err)
	}
	return passport, nil
}
