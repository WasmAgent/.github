// Package agentbom provides the reference implementation for the
// "agentbom/ — MCP Posture verification" milestone bullet
// (docs/15-milestones.md, Milestone 1):
//
//	verify-posture --manifest examples/manifest.yaml
//
// The package loads an agent manifest (YAML), checks the agent's declared MCP
// surface against the organization MCP Posture policy, and reports a PASS/FAIL
// result. The default policy mirrors the MCP Posture reference artifact in
// tests/e2e/fixtures/mcp-posture-sample.json.
package agentbom

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// Manifest is the agent manifest schema consumed by verify-posture.
type Manifest struct {
	Schema      string    `json:"$schema" yaml:"$schema"`
	SpecVersion string    `json:"specVersion" yaml:"specVersion"`
	Metadata    Metadata  `json:"metadata" yaml:"metadata"`
	MCP         MCPConfig `json:"mcp" yaml:"mcp"`
}

// Metadata identifies the agent declaring its MCP surface.
type Metadata struct {
	AgentID string `json:"agentId" yaml:"agentId"`
	Name    string `json:"name" yaml:"name"`
}

// MCPConfig is the agent's declared Model Context Protocol surface.
type MCPConfig struct {
	AuditLevel string   `json:"auditLevel" yaml:"auditLevel"`
	Servers    []Server `json:"servers" yaml:"servers"`
	Tools      []Tool   `json:"tools" yaml:"tools"`
}

// Server is a declared MCP server.
type Server struct {
	Name     string `json:"name" yaml:"name"`
	Endpoint string `json:"endpoint" yaml:"endpoint"`
}

// Tool is a declared MCP tool exposed by the agent.
type Tool struct {
	Name       string   `json:"name" yaml:"name"`
	Category   string   `json:"category" yaml:"category"`
	RiskLevel  string   `json:"riskLevel" yaml:"riskLevel"`
	Path       string   `json:"path,omitempty" yaml:"path"`
	Operations []string `json:"operations" yaml:"operations"`
}

// PosturePolicy is the MCP Posture policy an agent manifest is verified
// against.
type PosturePolicy struct {
	AllowedOperations []string `json:"allowedOperations"`
	MaxRiskLevel      string   `json:"maxRiskLevel"`
	RestrictedPaths   []string `json:"restrictedPaths"`
	AuditLevel        string   `json:"auditLevel"`
}

// PostureResult is the outcome of verifying a manifest against a posture
// policy.
type PostureResult struct {
	Pass        bool
	AgentID     string
	ServerCount int
	ToolCount   int
	Findings    []string
}

// DefaultPosturePolicy returns the organization MCP Posture policy, matching
// tests/e2e/fixtures/mcp-posture-sample.json.
func DefaultPosturePolicy() PosturePolicy {
	return PosturePolicy{
		AllowedOperations: []string{"read", "write", "execute"},
		MaxRiskLevel:      "medium",
		RestrictedPaths:   []string{"/etc", "/usr/bin"},
		AuditLevel:        "full",
	}
}

// LoadPolicyJSON loads a posture policy from a JSON file. Fields not present
// in the file retain their defaults.
func LoadPolicyJSON(path string) (*PosturePolicy, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read posture policy %s: %w", path, err)
	}
	policy := DefaultPosturePolicy()
	if err := json.Unmarshal(data, &policy); err != nil {
		return nil, fmt.Errorf("parse posture policy %s: %w", path, err)
	}
	return &policy, nil
}

// LoadManifest reads and parses an agent manifest (YAML subset) from path.
func LoadManifest(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read agent manifest %s: %w", path, err)
	}
	raw, err := parseYAML(string(data))
	if err != nil {
		return nil, fmt.Errorf("parse agent manifest %s: %w", path, err)
	}
	manifest, err := manifestFromMap(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid agent manifest %s: %w", path, err)
	}
	return manifest, nil
}

// VerifyPosture loads the manifest at manifestPath and verifies its declared
// MCP surface against policy.
func VerifyPosture(manifestPath string, policy PosturePolicy) (*PostureResult, error) {
	manifest, err := LoadManifest(manifestPath)
	if err != nil {
		return nil, err
	}
	return VerifyManifest(manifest, policy), nil
}

// VerifyManifest verifies a parsed manifest's declared MCP surface against
// policy. A manifest passes when every declared server and tool satisfies the
// posture policy and the audit level is met.
func VerifyManifest(manifest *Manifest, policy PosturePolicy) *PostureResult {
	result := &PostureResult{
		AgentID:     manifest.Metadata.AgentID,
		ServerCount: len(manifest.MCP.Servers),
		ToolCount:   len(manifest.MCP.Tools),
	}

	if result.ServerCount == 0 {
		result.Findings = append(result.Findings, "manifest declares no MCP servers")
	}
	if result.ToolCount == 0 {
		result.Findings = append(result.Findings, "manifest declares no MCP tools")
	}

	if policy.AuditLevel != "" && manifest.MCP.AuditLevel != policy.AuditLevel {
		result.Findings = append(result.Findings, fmt.Sprintf(
			"auditLevel %q does not meet required level %q",
			manifest.MCP.AuditLevel, policy.AuditLevel))
	}

	serverNames := make(map[string]bool)
	for _, server := range manifest.MCP.Servers {
		if server.Name == "" {
			result.Findings = append(result.Findings, "MCP server has empty name")
			continue
		}
		if server.Endpoint == "" {
			result.Findings = append(result.Findings, fmt.Sprintf("MCP server %q has empty endpoint", server.Name))
		}
		if serverNames[server.Name] {
			result.Findings = append(result.Findings, fmt.Sprintf("duplicate MCP server %q", server.Name))
		}
		serverNames[server.Name] = true
	}

	maxRisk := riskLevelRank(policy.MaxRiskLevel)
	allowedOps := make(map[string]bool)
	for _, op := range policy.AllowedOperations {
		allowedOps[op] = true
	}

	toolNames := make(map[string]bool)
	for _, tool := range manifest.MCP.Tools {
		if tool.Name == "" {
			result.Findings = append(result.Findings, "MCP tool has empty name")
			continue
		}
		if toolNames[tool.Name] {
			result.Findings = append(result.Findings, fmt.Sprintf("duplicate MCP tool %q", tool.Name))
		}
		toolNames[tool.Name] = true

		risk := riskLevelRank(tool.RiskLevel)
		if risk == 0 {
			result.Findings = append(result.Findings, fmt.Sprintf(
				"tool %q has unrecognized riskLevel %q", tool.Name, tool.RiskLevel))
		} else if maxRisk > 0 && risk > maxRisk {
			result.Findings = append(result.Findings, fmt.Sprintf(
				"tool %q riskLevel %q exceeds allowed max %q", tool.Name, tool.RiskLevel, policy.MaxRiskLevel))
		}

		if len(tool.Operations) == 0 {
			result.Findings = append(result.Findings, fmt.Sprintf("tool %q declares no operations", tool.Name))
		}
		for _, op := range tool.Operations {
			if !allowedOps[op] {
				result.Findings = append(result.Findings, fmt.Sprintf(
					"tool %q operation %q is not in allowed operations", tool.Name, op))
			}
		}

		if tool.Path != "" {
			for _, restricted := range policy.RestrictedPaths {
				if underRestrictedPath(tool.Path, restricted) {
					result.Findings = append(result.Findings, fmt.Sprintf(
						"tool %q path %q is under restricted path %q", tool.Name, tool.Path, restricted))
				}
			}
		}
	}

	result.Pass = len(result.Findings) == 0
	return result
}

// String renders the posture result as a machine-readable PASS/FAIL line.
func (r *PostureResult) String() string {
	if r.Pass {
		return fmt.Sprintf("PASS: MCP posture verified for agent %q (%d server(s), %d tool(s))",
			r.AgentID, r.ServerCount, r.ToolCount)
	}
	return fmt.Sprintf("FAIL: %d finding(s) for agent %q: %s",
		len(r.Findings), r.AgentID, strings.Join(r.Findings, "; "))
}

func riskLevelRank(level string) int {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "low":
		return 1
	case "medium":
		return 2
	case "high":
		return 3
	default:
		return 0
	}
}

func underRestrictedPath(path, restricted string) bool {
	if path == restricted {
		return true
	}
	prefix := strings.TrimRight(restricted, "/") + "/"
	return strings.HasPrefix(path, prefix)
}

// ---------------------------------------------------------------------------
// Minimal YAML subset parser
//
// The parser understands the block structure used by agent manifests: nested
// mappings, sequences of scalars, and sequences of mappings whose first key
// follows the dash on the same line. It intentionally does not implement the
// full YAML specification.
// ---------------------------------------------------------------------------

type yamlLine struct {
	indent int
	isDash bool
	rest   string
	raw    string
}

func splitYAML(data string) []yamlLine {
	var lines []yamlLine
	for _, raw := range strings.Split(data, "\n") {
		line := strings.TrimRight(raw, " \t\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indent := 0
		for indent < len(line) && (line[indent] == ' ' || line[indent] == '\t') {
			indent++
		}
		content := line[indent:]
		isDash := strings.HasPrefix(content, "-")
		rest := strings.TrimSpace(strings.TrimPrefix(content, "-"))
		lines = append(lines, yamlLine{indent: indent, isDash: isDash, rest: rest, raw: content})
	}
	return lines
}

func parseYAML(data string) (map[string]any, error) {
	lines := splitYAML(data)
	if len(lines) == 0 {
		return map[string]any{}, nil
	}
	if lines[0].isDash {
		return nil, fmt.Errorf("top-level sequence is not supported in agent manifests")
	}
	root, _, err := parseMap(lines, 0, lines[0].indent)
	if err != nil {
		return nil, err
	}
	return root, nil
}

func parseMap(lines []yamlLine, i int, indent int) (map[string]any, int, error) {
	m := make(map[string]any)
	for i < len(lines) {
		line := lines[i]
		if line.indent < indent {
			break
		}
		if line.indent > indent || line.isDash {
			break
		}
		key, valueText := splitKeyValue(line.rest)
		if key == "" {
			return nil, i, fmt.Errorf("malformed mapping line at indent %d: %q", line.indent, line.raw)
		}
		i++
		if valueText != "" {
			m[key] = unquote(valueText)
			continue
		}
		if i >= len(lines) || lines[i].indent <= indent {
			m[key] = nil
			continue
		}
		var value any
		var next int
		var err error
		if lines[i].isDash {
			value, next, err = parseSeq(lines, i, lines[i].indent)
		} else {
			value, next, err = parseMap(lines, i, lines[i].indent)
		}
		if err != nil {
			return nil, i, err
		}
		m[key] = value
		i = next
	}
	return m, i, nil
}

func parseSeq(lines []yamlLine, i int, indent int) ([]any, int, error) {
	var seq []any
	for i < len(lines) {
		line := lines[i]
		if line.indent != indent || !line.isDash {
			break
		}
		rest := line.rest
		i++
		if rest == "" {
			seq = append(seq, nil)
			continue
		}
		key, valueText := splitKeyValue(rest)
		if key == "" {
			seq = append(seq, unquote(rest))
			continue
		}

		item := make(map[string]any)
		itemKeyIndent := indent + 2
		if valueText != "" {
			item[key] = unquote(valueText)
			itemMap, next, err := parseMap(lines, i, itemKeyIndent)
			if err != nil {
				return nil, i, err
			}
			mergeMaps(item, itemMap)
			i = next
		} else {
			if i < len(lines) && lines[i].indent > itemKeyIndent {
				value, next, err := parseValue(lines, i)
				if err != nil {
					return nil, i, err
				}
				item[key] = value
				i = next
			} else {
				item[key] = nil
			}
			itemMap, next, err := parseMap(lines, i, itemKeyIndent)
			if err != nil {
				return nil, i, err
			}
			mergeMaps(item, itemMap)
			i = next
		}
		seq = append(seq, item)
	}
	return seq, i, nil
}

func parseValue(lines []yamlLine, i int) (any, int, error) {
	if i >= len(lines) {
		return nil, i, nil
	}
	if lines[i].isDash {
		return parseSeq(lines, i, lines[i].indent)
	}
	return parseMap(lines, i, lines[i].indent)
}

func splitKeyValue(s string) (string, string) {
	idx := strings.Index(s, ":")
	if idx < 0 {
		return "", ""
	}
	return strings.TrimSpace(s[:idx]), strings.TrimSpace(s[idx+1:])
}

func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}

func mergeMaps(dst, src map[string]any) {
	for k, v := range src {
		dst[k] = v
	}
}

func manifestFromMap(raw map[string]any) (*Manifest, error) {
	manifest := &Manifest{}
	manifest.Schema = stringField(raw, "$schema")
	manifest.SpecVersion = stringField(raw, "specVersion")
	if meta, ok := raw["metadata"].(map[string]any); ok {
		manifest.Metadata.AgentID = stringField(meta, "agentId")
		manifest.Metadata.Name = stringField(meta, "name")
	}

	mcpRaw, ok := raw["mcp"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("missing 'mcp' section")
	}
	manifest.MCP.AuditLevel = stringField(mcpRaw, "auditLevel")

	if servers, ok := mcpRaw["servers"].([]any); ok {
		for _, entry := range servers {
			sm, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			manifest.MCP.Servers = append(manifest.MCP.Servers, Server{
				Name:     stringField(sm, "name"),
				Endpoint: stringField(sm, "endpoint"),
			})
		}
	}

	if tools, ok := mcpRaw["tools"].([]any); ok {
		for _, entry := range tools {
			tm, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			tool := Tool{
				Name:      stringField(tm, "name"),
				Category:  stringField(tm, "category"),
				RiskLevel: stringField(tm, "riskLevel"),
				Path:      stringField(tm, "path"),
			}
			if ops, ok := tm["operations"].([]any); ok {
				for _, op := range ops {
					if opText, ok := op.(string); ok {
						tool.Operations = append(tool.Operations, opText)
					}
				}
			}
			manifest.MCP.Tools = append(manifest.MCP.Tools, tool)
		}
	}

	if manifest.SpecVersion == "" {
		return nil, fmt.Errorf("missing 'specVersion'")
	}
	if manifest.Metadata.AgentID == "" {
		return nil, fmt.Errorf("missing 'metadata.agentId'")
	}
	return manifest, nil
}

func stringField(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
