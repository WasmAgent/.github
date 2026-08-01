package e2e

import (
	"os"
	"strings"
	"testing"

	"github.com/WasmAgent/.github/pkg/docs"
)

// TestRepoCoreTierLabels exercises the org's "Core repos" vs
// "Research / Preview" tier split required by WasmAgent/.github#145:
//
//   - Core repos (wasmagent-js, wasmagent-protocol, agentbom) must be
//     labeled `focus: core-spine` in docs/project-index.json.
//   - symkernel and wasmagent-train-replay must be labeled
//     `focus: research-preview` — never core-spine.
//   - The org profile (profile/README.md) must not list the research repos
//     alongside Core repos without a Research / Preview qualifier — this
//     guards the Maintainers-wanted bullets from regressing.
func TestRepoCoreTierLabels(t *testing.T) {
	projectIndex, err := docs.LoadProjectIndex()
	if err != nil {
		t.Fatalf("Failed to load project index: %v", err)
	}

	coreRepos := []string{"wasmagent-js", "wasmagent-protocol", "agentbom"}
	researchRepos := []string{"symkernel", "wasmagent-train-replay"}

	focusByName := make(map[string]string)
	for _, repo := range projectIndex.Repos {
		focusByName[repo.Name] = repo.Focus
	}

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

	// Research / Preview repos must be labeled research-preview and must never
	// be labeled as part of the Core spine.
	for _, name := range researchRepos {
		repo, found := projectIndex.GetRepoByName(name)
		if !found {
			t.Errorf("Research / Preview repo %s missing from project index", name)
			continue
		}
		if repo.Focus != "research-preview" {
			t.Errorf("Research / Preview repo %s has focus %q, want %q", name, repo.Focus, "research-preview")
		}
		if focusByName[name] == "core-spine" {
			t.Errorf("Research / Preview repo %s must not be labeled Core (focus=core-spine)", name)
		}
	}

	// The org profile must carry the same split: research repos must appear in
	// the Research / Preview project table and every Maintainers-wanted bullet
	// mentioning them must carry a Research / Preview qualifier.
	profile, err := os.ReadFile("../../profile/README.md")
	if err != nil {
		t.Fatalf("Failed to read profile/README.md: %v", err)
	}
	profileText := string(profile)

	projectsIdx := strings.Index(profileText, "## Projects")
	if projectsIdx < 0 {
		t.Fatal("profile/README.md has no '## Projects' section")
	}
	projects := profileText[projectsIdx:]

	// Research repos must not appear in the Core project table.
	coreSection := projects
	if idx := strings.Index(projects, "### ⭐ Core"); idx >= 0 {
		coreSection = projects[idx:]
		if end := strings.Index(coreSection, "\n### "); end >= 0 {
			coreSection = coreSection[:end]
		}
	}
	for _, name := range researchRepos {
		if strings.Contains(coreSection, "https://github.com/WasmAgent/"+name) {
			t.Errorf("Research / Preview repo %s is listed in the Core section of profile/README.md", name)
		}
	}

	// Research repos must appear under the Research / Preview project table.
	researchSection := ""
	if idx := strings.Index(projects, "### 🧪 Research / Preview"); idx >= 0 {
		researchSection = projects[idx:]
		if end := strings.Index(researchSection, "\n### "); end >= 0 {
			researchSection = researchSection[:end]
		}
	}
	for _, name := range researchRepos {
		if !strings.Contains(researchSection, "https://github.com/WasmAgent/"+name) {
			t.Errorf("Research / Preview repo %s is missing from the Research / Preview section of profile/README.md", name)
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
