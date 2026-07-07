package docs

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// ProjectIndex represents the structure of docs/project-index.json
type ProjectIndex struct {
	SchemaVersion int             `json:"schema_version"`
	Org           string          `json:"org"`
	Description   string          `json:"description"`
	SourceURL     string          `json:"source_url"`
	LastReviewed  string          `json:"last_reviewed"`
	Consumers     []string        `json:"consumers"`
	StatusLegend  map[string]string `json:"status_legend"`
	Categories    map[string]string `json:"categories"`
	Repos         []ProjectRepo   `json:"repos"`
}

// ProjectRepo represents a single repository in the project index
type ProjectRepo struct {
	Name        string `json:"name"`
	Category    string `json:"category"`
	Role        string `json:"role"`
	Status      string `json:"status"`
	Visibility  string `json:"visibility"`
	InProfile   bool   `json:"in_profile"`
	Summary     string `json:"summary"`
	URL         string `json:"url"`
}

// LoadProjectIndex loads and parses the project-index.json file
func LoadProjectIndex() (*ProjectIndex, error) {
	// This package is imported from tests/e2e, so we need to navigate relative paths
	// tests/e2e -> docs/ directory is at ../../docs/project-index.json
	// pkg/docs -> docs/ directory is at ../docs/project-index.json

	// Try both paths to handle different call sites
	paths := []string{
		"../../docs/project-index.json",  // Called from tests/e2e
		"../docs/project-index.json",     // Called from pkg/docs
		"docs/project-index.json",         // Called from repo root
	}

	var lastErr error
	for _, path := range paths {
		content, err := os.ReadFile(path)
		if err == nil {
			var index ProjectIndex
			if err := json.Unmarshal(content, &index); err != nil {
				return nil, err
			}
			return &index, nil
		}
		lastErr = err
	}

	return nil, lastErr
}

// LoadProjectIndexFromPath loads the project index from a specific path
func LoadProjectIndexFromPath(path string) (*ProjectIndex, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, err
	}

	var index ProjectIndex
	if err := json.Unmarshal(content, &index); err != nil {
		return nil, err
	}

	return &index, nil
}

// GetReposByCategory returns all repositories matching a given category
func (pi *ProjectIndex) GetReposByCategory(category string) []ProjectRepo {
	var repos []ProjectRepo
	for _, repo := range pi.Repos {
		if repo.Category == category {
			repos = append(repos, repo)
		}
	}
	return repos
}

// GetRepoByName finds a repository by its name
func (pi *ProjectIndex) GetRepoByName(name string) (*ProjectRepo, bool) {
	for _, repo := range pi.Repos {
		if repo.Name == name {
			return &repo, true
		}
	}
	return nil, false
}

// Validate performs basic validation on the project index structure
func (pi *ProjectIndex) Validate() []string {
	var errors []string

	if pi.Org == "" {
		errors = append(errors, "org field is empty")
	}

	if pi.SchemaVersion < 1 {
		errors = append(errors, "schema_version should be at least 1")
	}

	if len(pi.Repos) == 0 {
		errors = append(errors, "repos list is empty")
	}

	for i, repo := range pi.Repos {
		if repo.Name == "" {
			errors = append(errors, fmt.Sprintf("repo at index %d has empty name", i))
		}
		if repo.Category == "" {
			errors = append(errors, fmt.Sprintf("repo %s has empty category", repo.Name))
		}
		if repo.Status == "" {
			errors = append(errors, fmt.Sprintf("repo %s has empty status", repo.Name))
		}
	}

	return errors
}