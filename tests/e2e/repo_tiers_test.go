package e2e

import (
	"os"
	"strings"
	"testing"

	"github.com/WasmAgent/.github/pkg/docs"
)

// TestRepoCoreTierLabels exercises the org's "Core repos" vs
// "Research / Preview" tier split required by WasmAgent/.github#145, as
// realized by the current evidence-lifecycle profile layout:
//
//   - Core repos (wasmagent-js, wasmagent-protocol, agentbom) must be
//     labeled `focus: core-spine` in docs/project-index.json.
//   - symkernel must be labeled `focus: research-preview`. The ENUMERATED
//     Research / Preview repositories must never be labeled core-spine;
//     non-core research repos may carry finer-grained non-core focuses
//     (e.g. wasmagent-train-replay's `evidence-consumer`). Deriving the
//     research set from an authoritative maturity registry instead of this
//     hardcoded list is deferred to the pinned-CI round.
//   - In profile/README.md, every Projects-table row linking a research
//     repo and every Maintainers-wanted bullet mentioning one must carry
//     a "Research / Preview" qualifier — research repos are never
//     presented as core, shipping components.
func TestRepoCoreTierLabels(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	coreRepos := []string{"wasmagent-js", "wasmagent-protocol", "agentbom"}
	researchRepos := []string{"symkernel", "wasmagent-train-replay"}

	// Core repos must be labeled core-spine.
	for _, name := range coreRepos {
		repo, found := projectIndex.GetRepoByName(name)
		if !found {
			t.Errorf("Core repo %s missing from project index", name)
			continue
		}
		if repo.Focus != "core-spine" {
			t.Errorf("Core repo %s has focus %q, want %q", name, repo.Focus, "core-spine")
		}
	}

	// symkernel is the canonical research repo and must stay research-preview;
	// every ENUMERATED research repo must never be labeled core-spine.
	for _, name := range researchRepos {
		repo, found := projectIndex.GetRepoByName(name)
		if !found {
			t.Errorf("Research / Preview repo %s missing from project index", name)
			continue
		}
		if name == "symkernel" && repo.Focus != "research-preview" {
			t.Errorf("Research repo %s has focus %q, want %q", name, repo.Focus, "research-preview")
		}
		if repo.Focus == "core-spine" {
			t.Errorf("Research / Preview repo %s must not be labeled Core (focus=core-spine)", name)
		}
	}

	// The org profile must carry the same split under the evidence-lifecycle
	// layout: every Projects-table row linking an ENUMERATED research repo
	// and every Maintainers-wanted bullet mentioning one must carry a
	// "Research / Preview" qualifier.
	profile, err := os.ReadFile("../../profile/README.md")
	if err != nil {
		t.Fatalf("Failed to read profile/README.md: %v", err)
	}
	profileText := string(profile)

	projectsIdx := strings.Index(profileText, "## Projects")
	if projectsIdx < 0 {
		t.Fatal("profile/README.md has no '## Projects' section")
	}
	projectsEnd := strings.Index(profileText[projectsIdx:], "\n## ")
	if projectsEnd < 0 {
		projectsEnd = len(profileText) - projectsIdx
	}
	projects := profileText[projectsIdx : projectsIdx+projectsEnd]

	for _, name := range researchRepos {
		link := "https://github.com/WasmAgent/" + name
		for _, line := range strings.Split(projects, "\n") {
			if strings.Contains(line, link) && !strings.Contains(line, "Research / Preview") {
				t.Errorf("Projects-table row for %s lacks a Research / Preview qualifier: %q", name, line)
			}
		}
	}

	// Maintainers-wanted bullets must qualify both research repos.
	maintainersIdx := strings.Index(profileText, "## Maintainers wanted")
	if maintainersIdx < 0 {
		t.Fatal("profile/README.md has no '## Maintainers wanted' section")
	}
	maintainers := profileText[maintainersIdx:]
	for _, line := range strings.Split(maintainers, "\n") {
		if strings.Contains(line, "`symkernel`") && !strings.Contains(line, "Research / Preview") {
			t.Errorf("Maintainers-wanted bullet lists symkernel without a Research / Preview qualifier: %q", line)
		}
		if strings.Contains(line, "`wasmagent-train-replay`") && !strings.Contains(line, "Research / Preview") {
			t.Errorf("Maintainers-wanted bullet lists wasmagent-train-replay without a Research / Preview qualifier: %q", line)
		}
	}
}
