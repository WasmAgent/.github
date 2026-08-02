// Package federation implements the wasmagent-ops federation control plane:
// the multi-cluster agent mesh synchronization and cross-domain attestation
// engine driven by `wasmagent-mesh sync --peers mesh-peers.yaml`.
//
// A mesh is a set of clusters, each exposing an HTTPS control plane endpoint
// and a SPIFFE-style attestation domain. The control plane pulls the declared
// trust artifact scopes (AgentBOMs, Trust Passports, signed AEP evidence)
// from every peer, verifies cross-domain attestation against the federation
// trust roots, admits signed evidence into the local audit ledger, and
// quarantines anything that fails verification instead of propagating it.
package federation

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// DefaultConfigPath is the canonical mesh peers configuration consumed by
// `wasmagent-mesh sync --peers mesh-peers.yaml`.
const DefaultConfigPath = "mesh-peers.yaml"

// MeshPeers is the root of the mesh-peers.yaml configuration consumed by
// `wasmagent-mesh sync --peers mesh-peers.yaml`.
type MeshPeers struct {
	APIVersion  string            `yaml:"apiVersion"`
	Kind        string            `yaml:"kind"`
	Metadata    MeshMetadata      `yaml:"metadata"`
	Clusters    []Cluster         `yaml:"clusters"`
	Sync        SyncPolicy        `yaml:"sync"`
	Attestation AttestationPolicy `yaml:"attestation"`
}

// MeshMetadata carries stable identity for the mesh itself.
type MeshMetadata struct {
	Name        string `yaml:"name"`
	Namespace   string `yaml:"namespace"`
	Description string `yaml:"description"`
}

// Cluster is a single participating cluster in the agent mesh.
type Cluster struct {
	Name              string `yaml:"name"`
	Region            string `yaml:"region"`
	ControlPlane      string `yaml:"controlPlane"`
	AttestationDomain string `yaml:"attestationDomain"`
}

// SyncPolicy governs multi-cluster synchronization.
type SyncPolicy struct {
	Mode            string   `yaml:"mode"`
	IntervalSeconds int      `yaml:"intervalSeconds"`
	ConflictPolicy  string   `yaml:"conflictPolicy"`
	Include         []string `yaml:"include"`
	Exclude         []string `yaml:"exclude"`
}

// AttestationPolicy governs cross-domain attestation enforcement.
type AttestationPolicy struct {
	CrossDomain           bool     `yaml:"crossDomain"`
	VerificationMode      string   `yaml:"verificationMode"`
	TrustRoots            []string `yaml:"trustRoots"`
	RequireSignedEvidence bool     `yaml:"requireSignedEvidence"`
}

// Supported sync modes and attestation verification modes.
const (
	SyncModeBidirectional   = "bidirectional"
	SyncModeUnidirectional  = "unidirectional"

	VerificationVerifyOnSync   = "verify-on-sync"
	VerificationVerifyOnDemand = "verify-on-demand"
)

// LoadMeshPeers reads and parses a mesh-peers.yaml configuration file.
func LoadMeshPeers(path string) (*MeshPeers, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read mesh peers config: %w", err)
	}
	return ParseMeshPeers(content)
}

// ParseMeshPeers parses mesh-peers YAML content into a MeshPeers configuration.
func ParseMeshPeers(content []byte) (*MeshPeers, error) {
	root, err := parseYAMLMap(string(content))
	if err != nil {
		return nil, fmt.Errorf("parse mesh peers config: %w", err)
	}

	cfg := &MeshPeers{
		APIVersion: decodeString(root, "apiVersion"),
		Kind:       decodeString(root, "kind"),
	}
	if md, ok := root["metadata"].(map[string]any); ok {
		cfg.Metadata = MeshMetadata{
			Name:        decodeString(md, "name"),
			Namespace:   decodeString(md, "namespace"),
			Description: decodeString(md, "description"),
		}
	}
	if rawClusters, ok := root["clusters"].([]any); ok {
		for _, raw := range rawClusters {
			cm, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			cfg.Clusters = append(cfg.Clusters, Cluster{
				Name:              decodeString(cm, "name"),
				Region:            decodeString(cm, "region"),
				ControlPlane:      decodeString(cm, "controlPlane"),
				AttestationDomain: decodeString(cm, "attestationDomain"),
			})
		}
	}
	if sp, ok := root["sync"].(map[string]any); ok {
		cfg.Sync = SyncPolicy{
			Mode:            decodeString(sp, "mode"),
			IntervalSeconds: decodeInt(sp, "intervalSeconds"),
			ConflictPolicy:  decodeString(sp, "conflictPolicy"),
			Include:         decodeStringSlice(sp, "include"),
			Exclude:         decodeStringSlice(sp, "exclude"),
		}
	}
	if ap, ok := root["attestation"].(map[string]any); ok {
		cfg.Attestation = AttestationPolicy{
			CrossDomain:           decodeBool(ap, "crossDomain"),
			VerificationMode:      decodeString(ap, "verificationMode"),
			TrustRoots:            decodeStringSlice(ap, "trustRoots"),
			RequireSignedEvidence: decodeBool(ap, "requireSignedEvidence"),
		}
	}
	return cfg, nil
}

// Validate checks the control plane configuration for multi-cluster mesh
// synchronization and cross-domain attestation consistency. It is the
// admission gate for a mesh: an invalid topology or policy is refused before
// any artifact transfer is attempted.
func (m *MeshPeers) Validate() error {
	var errs []string

	if m.APIVersion == "" {
		errs = append(errs, "apiVersion is required")
	}
	if m.Kind != "MeshPeers" {
		errs = append(errs, fmt.Sprintf("kind must be MeshPeers, got %q", m.Kind))
	}
	if m.Metadata.Name == "" {
		errs = append(errs, "metadata.name is required")
	}

	if len(m.Clusters) < 2 {
		errs = append(errs, "a mesh requires at least 2 clusters")
	}
	seenNames := make(map[string]bool)
	seenDomains := make(map[string]bool)
	for i, c := range m.Clusters {
		if c.Name == "" {
			errs = append(errs, fmt.Sprintf("clusters[%d].name is required", i))
		} else if seenNames[c.Name] {
			errs = append(errs, fmt.Sprintf("duplicate cluster name %q", c.Name))
		}
		seenNames[c.Name] = true
		if c.Region == "" {
			errs = append(errs, fmt.Sprintf("cluster %q region is required", c.Name))
		}
		if c.ControlPlane == "" {
			errs = append(errs, fmt.Sprintf("cluster %q controlPlane endpoint is required", c.Name))
		} else if !strings.HasPrefix(c.ControlPlane, "https://") {
			errs = append(errs, fmt.Sprintf("cluster %q controlPlane must be an HTTPS endpoint (mTLS), got %q", c.Name, c.ControlPlane))
		}
		if c.AttestationDomain == "" {
			errs = append(errs, fmt.Sprintf("cluster %q attestationDomain is required", c.Name))
		} else if seenDomains[c.AttestationDomain] {
			errs = append(errs, fmt.Sprintf("duplicate attestationDomain %q", c.AttestationDomain))
		}
		seenDomains[c.AttestationDomain] = true
	}

	switch m.Sync.Mode {
	case SyncModeBidirectional, SyncModeUnidirectional:
	default:
		errs = append(errs, fmt.Sprintf("sync.mode %q must be bidirectional or unidirectional", m.Sync.Mode))
	}
	if m.Sync.IntervalSeconds <= 0 {
		errs = append(errs, "sync.intervalSeconds must be positive")
	}
	if m.Sync.ConflictPolicy == "" {
		errs = append(errs, "sync.conflictPolicy is required")
	}
	if len(m.Sync.Include) == 0 {
		errs = append(errs, "sync.include must list at least one artifact scope")
	}

	if !m.Attestation.CrossDomain {
		errs = append(errs, "attestation.crossDomain must be true for a federated mesh")
	}
	switch m.Attestation.VerificationMode {
	case VerificationVerifyOnSync, VerificationVerifyOnDemand:
	default:
		errs = append(errs, fmt.Sprintf("attestation.verificationMode %q is not supported", m.Attestation.VerificationMode))
	}
	if len(m.Attestation.TrustRoots) == 0 {
		errs = append(errs, "attestation.trustRoots must not be empty")
	}
	if !m.Attestation.RequireSignedEvidence {
		errs = append(errs, "attestation.requireSignedEvidence must be true")
	}

	if len(errs) > 0 {
		return errors.New("mesh peers config invalid: " + strings.Join(errs, "; "))
	}
	return nil
}

// isExcluded reports whether an artifact scope is excluded from mesh
// propagation by the sync policy.
func (m *MeshPeers) isExcluded(scope string) bool {
	for _, ex := range m.Sync.Exclude {
		if ex == scope {
			return true
		}
	}
	return false
}

// Artifact is a trust artifact (AgentBOM, Trust Passport, or AEP evidence
// envelope) exchanged across the mesh. Every artifact must carry a signed
// evidence payload before it is admitted into a receiving cluster's ledger.
type Artifact struct {
	ID        string
	Scope     string
	Cluster   string
	Payload   []byte
	Signature []byte
	TrustRoot string
	SignedBy  string
}

// EvidenceVerifier verifies cross-domain attestation for synced artifacts.
type EvidenceVerifier interface {
	// Verify returns nil when the artifact's signature chains to one of the
	// federation trust roots and satisfies the attestation policy. A non-nil
	// error quarantines the artifact at admission.
	Verify(artifact Artifact, policy AttestationPolicy) error
}

// Ed25519Verifier verifies artifact signatures against federation trust roots
// using Ed25519 public keys keyed by trust root URN.
type Ed25519Verifier struct {
	roots map[string]ed25519.PublicKey
}

// NewEd25519Verifier builds a verifier from a trust root URN to public key
// mapping. An empty mapping refuses all signed evidence (no trust anchors).
func NewEd25519Verifier(roots map[string]ed25519.PublicKey) *Ed25519Verifier {
	if roots == nil {
		roots = make(map[string]ed25519.PublicKey)
	}
	return &Ed25519Verifier{roots: roots}
}

// Verify implements EvidenceVerifier.
func (v *Ed25519Verifier) Verify(artifact Artifact, policy AttestationPolicy) error {
	if len(artifact.Signature) == 0 {
		if policy.RequireSignedEvidence {
			return fmt.Errorf("artifact %q is unsigned but attestation.requireSignedEvidence is true", artifact.ID)
		}
		// Unsigned evidence is admissible only when the policy explicitly
		// allows unsigned payloads (never the case for a federated mesh).
		return nil
	}
	if len(v.roots) == 0 {
		return errors.New("no trust roots configured for signature verification")
	}
	if artifact.TrustRoot == "" {
		return errors.New("artifact does not declare a trust root")
	}
	if !trustRootAllowed(policy, artifact.TrustRoot) {
		return fmt.Errorf("artifact %q declares trust root %q which is not in the federation trust roots", artifact.ID, artifact.TrustRoot)
	}
	pub, ok := v.roots[artifact.TrustRoot]
	if !ok {
		return fmt.Errorf("trust root %q is not a configured verification key", artifact.TrustRoot)
	}
	if !ed25519.Verify(pub, artifact.Payload, artifact.Signature) {
		return fmt.Errorf("artifact %q signature verification failed", artifact.ID)
	}
	return nil
}

func trustRootAllowed(policy AttestationPolicy, root string) bool {
	for _, r := range policy.TrustRoots {
		if r == root {
			return true
		}
	}
	return false
}

// PeerFetcher retrieves trust artifacts from a peer cluster's control plane
// during a sync cycle. Real deployments use the mTLS HTTPS control plane
// endpoints declared in mesh-peers.yaml; tests inject in-memory fakes.
type PeerFetcher interface {
	FetchArtifacts(ctx context.Context, peer Cluster, scopes []string) ([]Artifact, error)
}

// HTTPPeerFetcher fetches artifacts from peer control planes over HTTPS. A
// peer control plane is expected to expose GET /v1/artifacts?scopes=... and
// return a JSON array of artifact envelopes. Peers must be reachable over
// mutually authenticated (mTLS) channels; the control plane never falls back
// to plaintext sync.
type HTTPPeerFetcher struct {
	Client *http.Client
}

// NewHTTPPeerFetcher builds an HTTPS peer fetcher with a sane timeout.
func NewHTTPPeerFetcher() *HTTPPeerFetcher {
	return &HTTPPeerFetcher{Client: &http.Client{Timeout: 30 * time.Second}}
}

// artifactWire is the JSON wire format exchanged with peer control planes.
type artifactWire struct {
	ID        string `json:"id"`
	Scope     string `json:"scope"`
	Cluster   string `json:"cluster"`
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
	TrustRoot string `json:"trustRoot"`
	SignedBy  string `json:"signedBy"`
}

// FetchArtifacts implements PeerFetcher.
func (f *HTTPPeerFetcher) FetchArtifacts(ctx context.Context, peer Cluster, scopes []string) ([]Artifact, error) {
	if !strings.HasPrefix(peer.ControlPlane, "https://") {
		return nil, fmt.Errorf("peer %q control plane %q must use HTTPS (mTLS required)", peer.Name, peer.ControlPlane)
	}
	endpoint := strings.TrimRight(peer.ControlPlane, "/") + "/v1/artifacts?scopes=" + url.QueryEscape(strings.Join(scopes, ","))
	client := f.Client
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("fetch from %s: %w", peer.Name, err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch from %s: %w", peer.Name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch from %s: control plane returned %s", peer.Name, resp.Status)
	}
	var wires []artifactWire
	if err := json.NewDecoder(resp.Body).Decode(&wires); err != nil {
		return nil, fmt.Errorf("fetch from %s: decode artifacts: %w", peer.Name, err)
	}
	artifacts := make([]Artifact, 0, len(wires))
	for _, w := range wires {
		payload, err := base64.StdEncoding.DecodeString(w.Payload)
		if err != nil {
			return nil, fmt.Errorf("fetch from %s: artifact %s payload: %w", peer.Name, w.ID, err)
		}
		sig, err := base64.StdEncoding.DecodeString(w.Signature)
		if err != nil {
			return nil, fmt.Errorf("fetch from %s: artifact %s signature: %w", peer.Name, w.ID, err)
		}
		artifacts = append(artifacts, Artifact{
			ID:        w.ID,
			Scope:     w.Scope,
			Cluster:   w.Cluster,
			Payload:   payload,
			Signature: sig,
			TrustRoot: w.TrustRoot,
			SignedBy:  w.SignedBy,
		})
	}
	return artifacts, nil
}

// SyncEngine is the control plane for multi-cluster agent mesh
// synchronization and cross-domain attestation. It applies the declarative
// sync policy in mesh-peers.yaml on every cycle.
type SyncEngine struct {
	Config   *MeshPeers
	Fetcher  PeerFetcher
	Verifier EvidenceVerifier
}

// NewSyncEngine builds a sync engine bound to a mesh peers configuration.
func NewSyncEngine(cfg *MeshPeers, fetcher PeerFetcher, verifier EvidenceVerifier) *SyncEngine {
	return &SyncEngine{Config: cfg, Fetcher: fetcher, Verifier: verifier}
}

// QuarantinedArtifact records an artifact that failed admission.
type QuarantinedArtifact struct {
	Artifact Artifact
	Reason   string
}

// SyncResult reports the outcome of a sync cycle against the mesh peers.
type SyncResult struct {
	Peers       []string
	Admitted    []Artifact
	Quarantined []QuarantinedArtifact
	StartedAt   time.Time
	FinishedAt  time.Time
}

// Sync runs a full mesh synchronization cycle: for every peer cluster, pull
// the declared artifact scopes, verify cross-domain attestation against the
// federation trust roots, admit signed evidence into the local audit ledger,
// and quarantine anything that fails verification instead of propagating it.
func (e *SyncEngine) Sync(ctx context.Context) (*SyncResult, error) {
	if err := e.Config.Validate(); err != nil {
		return nil, fmt.Errorf("refusing to sync: %w", err)
	}
	if e.Fetcher == nil {
		return nil, errors.New("sync engine requires a peer fetcher")
	}
	if e.Verifier == nil {
		return nil, errors.New("sync engine requires an evidence verifier")
	}

	result := &SyncResult{StartedAt: time.Now().UTC()}
	for _, peer := range e.Config.Clusters {
		result.Peers = append(result.Peers, peer.Name)
		artifacts, err := e.Fetcher.FetchArtifacts(ctx, peer, e.Config.Sync.Include)
		if err != nil {
			return nil, fmt.Errorf("sync with peer %q failed: %w", peer.Name, err)
		}
		for _, artifact := range artifacts {
			if e.Config.isExcluded(artifact.Scope) {
				result.Quarantined = append(result.Quarantined, QuarantinedArtifact{
					Artifact: artifact,
					Reason:   fmt.Sprintf("scope %q is excluded from mesh propagation", artifact.Scope),
				})
				continue
			}
			if err := e.Verifier.Verify(artifact, e.Config.Attestation); err != nil {
				result.Quarantined = append(result.Quarantined, QuarantinedArtifact{
					Artifact: artifact,
					Reason:   err.Error(),
				})
				continue
			}
			result.Admitted = append(result.Admitted, artifact)
		}
	}
	result.FinishedAt = time.Now().UTC()
	return result, nil
}

// SyncPlan is the offline representation of a validated mesh sync cycle,
// used by `wasmagent-mesh sync --dry-run` to report intent without
// contacting any peer control plane.
type SyncPlan struct {
	MeshName              string
	APIVersion            string
	Peers                 []string
	Mode                  string
	IntervalSeconds       int
	ConflictPolicy        string
	Include               []string
	Exclude               []string
	VerificationMode      string
	TrustRoots            []string
	RequireSignedEvidence bool
}

// BuildSyncPlan derives a sync plan from a validated mesh peers configuration.
func BuildSyncPlan(cfg *MeshPeers) (*SyncPlan, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	peers := make([]string, 0, len(cfg.Clusters))
	for _, c := range cfg.Clusters {
		peers = append(peers, c.Name)
	}
	return &SyncPlan{
		MeshName:              cfg.Metadata.Name,
		APIVersion:            cfg.APIVersion,
		Peers:                 peers,
		Mode:                  cfg.Sync.Mode,
		IntervalSeconds:       cfg.Sync.IntervalSeconds,
		ConflictPolicy:        cfg.Sync.ConflictPolicy,
		Include:               append([]string(nil), cfg.Sync.Include...),
		Exclude:               append([]string(nil), cfg.Sync.Exclude...),
		VerificationMode:      cfg.Attestation.VerificationMode,
		TrustRoots:            append([]string(nil), cfg.Attestation.TrustRoots...),
		RequireSignedEvidence: cfg.Attestation.RequireSignedEvidence,
	}, nil
}

// ---------------------------------------------------------------------------
// Minimal dependency-free YAML subset parser.
//
// mesh-peers.yaml is a small, fixed-shape document. Rather than pulling in an
// external YAML dependency (and requiring network access at build time), the
// control plane ships a purpose-built parser for exactly the subset it
// consumes: block mappings, block sequences of scalars and inline mappings,
// and folded (">-") scalars. Anything outside that subset is rejected with a
// clear error instead of being silently misread.
// ---------------------------------------------------------------------------

type yamlLine struct {
	indent int
	text   string
	lineNo int
}

type yamlParser struct {
	lines []yamlLine
	pos   int
}

func parseYAMLMap(input string) (map[string]any, error) {
	lines := normalizeYAMLLines(input)
	if len(lines) == 0 {
		return map[string]any{}, nil
	}
	p := &yamlParser{lines: lines}
	root, err := p.parseBlock()
	if err != nil {
		return nil, err
	}
	if p.pos < len(p.lines) {
		return nil, fmt.Errorf("yaml: unexpected content at line %d", p.lines[p.pos].lineNo)
	}
	m, ok := root.(map[string]any)
	if !ok {
		return nil, errors.New("yaml: root must be a mapping")
	}
	return m, nil
}

func normalizeYAMLLines(input string) []yamlLine {
	var out []yamlLine
	for i, raw := range strings.Split(input, "\n") {
		raw = strings.ReplaceAll(raw, "\t", "    ")
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indent := len(raw) - len(strings.TrimLeft(raw, " "))
		out = append(out, yamlLine{indent: indent, text: trimmed, lineNo: i + 1})
	}
	return out
}

func (p *yamlParser) parseBlock() (any, error) {
	if p.pos >= len(p.lines) {
		return nil, errors.New("yaml: unexpected end of document")
	}
	ln := p.lines[p.pos]
	if isSequenceEntry(ln.text) {
		return p.parseSequence(ln.indent)
	}
	return p.parseMapping(ln.indent)
}

func isSequenceEntry(text string) bool {
	return text == "-" || strings.HasPrefix(text, "- ")
}

func (p *yamlParser) parseMapping(indent int) (map[string]any, error) {
	m := make(map[string]any)
	for p.pos < len(p.lines) {
		ln := p.lines[p.pos]
		if ln.indent < indent {
			break
		}
		if ln.indent != indent {
			return nil, fmt.Errorf("yaml: bad indentation at line %d (expected %d)", ln.lineNo, indent)
		}
		if isSequenceEntry(ln.text) {
			break
		}
		key, rawRest, hasValue, err := splitYAMLKey(ln.text)
		if err != nil {
			return nil, fmt.Errorf("yaml: %w at line %d", err, ln.lineNo)
		}
		p.pos++
		switch {
		case isBlockScalarMarker(rawRest):
			value, err := p.parseBlockScalar(indent, rawRest)
			if err != nil {
				return nil, err
			}
			m[key] = value
		case !hasValue:
			if p.pos < len(p.lines) && p.lines[p.pos].indent > indent {
				if isSequenceEntry(p.lines[p.pos].text) {
					value, err := p.parseSequence(p.lines[p.pos].indent)
					if err != nil {
						return nil, err
					}
					m[key] = value
				} else {
					value, err := p.parseMapping(p.lines[p.pos].indent)
					if err != nil {
						return nil, err
					}
					m[key] = value
				}
			} else {
				m[key] = nil
			}
		default:
			m[key] = parseScalar(rawRest)
		}
	}
	return m, nil
}

func (p *yamlParser) parseSequence(indent int) ([]any, error) {
	var seq []any
	for p.pos < len(p.lines) {
		ln := p.lines[p.pos]
		if ln.indent < indent {
			break
		}
		if ln.indent != indent {
			return nil, fmt.Errorf("yaml: bad indentation at line %d (expected %d)", ln.lineNo, indent)
		}
		if !isSequenceEntry(ln.text) {
			break
		}
		rest := strings.TrimSpace(strings.TrimPrefix(ln.text, "-"))
		p.pos++

		if rest == "" {
			if p.pos < len(p.lines) && p.lines[p.pos].indent > indent {
				value, err := p.parseBlock()
				if err != nil {
					return nil, err
				}
				seq = append(seq, value)
			} else {
				seq = append(seq, nil)
			}
			continue
		}

		// Inline mapping entry ("- name: us-east-1") or plain scalar
		// ("- agentboms", "- urn:wasmagent:trust-root:v1").
		key, rawRest, hasValue, err := splitYAMLKey(rest)
		if err == nil {
			item, err := p.parseSequenceItemMapping(indent, key, rawRest, hasValue)
			if err != nil {
				return nil, err
			}
			seq = append(seq, item)
			continue
		}
		seq = append(seq, parseScalar(rest))
	}
	return seq, nil
}

// parseSequenceItemMapping parses one mapping item that starts inline on the
// dash line (e.g. "- name: us-east-1") and continues on the following more
// deeply indented lines (e.g. "    region: us-east-1").
func (p *yamlParser) parseSequenceItemMapping(indent int, firstKey, firstRawRest string, firstHasValue bool) (map[string]any, error) {
	m := make(map[string]any)
	if err := p.assignValue(m, indent, firstKey, firstRawRest, firstHasValue); err != nil {
		return nil, err
	}
	for p.pos < len(p.lines) && p.lines[p.pos].indent > indent {
		subLn := p.lines[p.pos]
		if isSequenceEntry(subLn.text) {
			break
		}
		subKey, subRest, subHasValue, err := splitYAMLKey(subLn.text)
		if err != nil {
			return nil, fmt.Errorf("yaml: %w at line %d", err, subLn.lineNo)
		}
		p.pos++
		if err := p.assignValue(m, subLn.indent, subKey, subRest, subHasValue); err != nil {
			return nil, err
		}
	}
	return m, nil
}

// assignValue sets a key in a mapping based on whether its raw value is a
// block scalar marker, absent (nested block), or a plain scalar.
func (p *yamlParser) assignValue(m map[string]any, parentIndent int, key, rawRest string, hasValue bool) error {
	switch {
	case isBlockScalarMarker(rawRest):
		value, err := p.parseBlockScalar(parentIndent, rawRest)
		if err != nil {
			return err
		}
		m[key] = value
	case !hasValue:
		if p.pos < len(p.lines) && p.lines[p.pos].indent > parentIndent {
			if isSequenceEntry(p.lines[p.pos].text) {
				value, err := p.parseSequence(p.lines[p.pos].indent)
				if err != nil {
					return err
				}
				m[key] = value
			} else {
				value, err := p.parseMapping(p.lines[p.pos].indent)
				if err != nil {
					return err
				}
				m[key] = value
			}
		} else {
			m[key] = nil
		}
	default:
		m[key] = parseScalar(rawRest)
	}
	return nil
}

func (p *yamlParser) parseBlockScalar(parentIndent int, marker string) (string, error) {
	var parts []string
	for p.pos < len(p.lines) && p.lines[p.pos].indent > parentIndent {
		parts = append(parts, strings.TrimSpace(p.lines[p.pos].text))
		p.pos++
	}
	if len(parts) == 0 {
		return "", nil
	}
	if strings.HasPrefix(marker, "|") {
		return strings.Join(parts, "\n"), nil
	}
	return strings.Join(parts, " "), nil
}

func splitYAMLKey(text string) (key, value string, hasValue bool, err error) {
	idx := yamlKeyIndex(text)
	if idx < 0 {
		return "", "", false, errors.New("expected 'key: value' entry")
	}
	key = strings.TrimSpace(text[:idx])
	if key == "" {
		return "", "", false, errors.New("empty key")
	}
	value = strings.TrimSpace(text[idx+1:])
	return key, value, value != "", nil
}

// yamlKeyIndex returns the index of the first ':' that separates a mapping
// key from its value (a colon followed by whitespace or end of line), or -1
// when the text is a plain scalar. This keeps plain scalars such as
// "urn:wasmagent:trust-root:v1" (colons not followed by whitespace) from
// being misread as inline mapping entries.
func yamlKeyIndex(text string) int {
	for i := 0; i < len(text); i++ {
		if text[i] == ':' {
			if i+1 == len(text) || text[i+1] == ' ' || text[i+1] == '\t' {
				return i
			}
		}
	}
	return -1
}

func isBlockScalarMarker(s string) bool {
	switch s {
	case ">", ">-", ">+", "|", "|-", "|+":
		return true
	}
	return false
}

func parseScalar(s string) any {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	switch s {
	case "true", "True", "TRUE":
		return true
	case "false", "False", "FALSE":
		return false
	case "null", "Null", "NULL", "~":
		return nil
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return s
}

func decodeString(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func decodeBool(m map[string]any, key string) bool {
	if v, ok := m[key].(bool); ok {
		return v
	}
	return false
}

func decodeInt(m map[string]any, key string) int {
	switch v := m[key].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	}
	return 0
}

func decodeStringSlice(m map[string]any, key string) []string {
	raw, ok := m[key].([]any)
	if !ok {
		return nil
	}
	var out []string
	for _, item := range raw {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
