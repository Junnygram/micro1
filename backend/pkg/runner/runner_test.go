package runner

import (
	"path/filepath"
	"testing"
)

func TestLoadDataset(t *testing.T) {
	// The dataset file resides in the root data directory relative to the workspace
	// Let's resolve the path relative to our current test folder location (backend/pkg/runner/)
	// Workspace is 2 directories up
	// Dataset lives under backend/data/ (WORKSPACE_DIR when server runs)
	workspaceDir, err := filepath.Abs("../../")
	if err != nil {
		t.Fatalf("failed to resolve absolute path of workspace: %v", err)
	}

	dataset, err := LoadDataset(workspaceDir)
	if err != nil {
		t.Fatalf("failed to load dataset: %v", err)
	}

	if len(dataset) != 10 {
		t.Errorf("expected 10 candidates in dataset, got %d", len(dataset))
	}

	// Verify we can retrieve junnygram (Olaleye Oyewunmi)
	found := false
	for _, c := range dataset {
		if c.GithubUsername == "junnygram" {
			found = true
			if c.Name != "Olaleye Oyewunmi" {
				t.Errorf("expected name 'Olaleye Oyewunmi', got %s", c.Name)
			}
			if len(c.GithubRepos) != 2 {
				t.Errorf("expected 2 repos for junnygram, got %d", len(c.GithubRepos))
			}
			break
		}
	}
	if !found {
		t.Errorf("expected to find junnygram in dataset")
	}

	// Verify GetCandidateByGithub
	c, err := GetCandidateByGithub(workspaceDir, "junnygram")
	if err != nil {
		t.Fatalf("failed to fetch junnygram by username: %v", err)
	}
	if c.Name != "Olaleye Oyewunmi" {
		t.Errorf("expected candidate name 'Olaleye Oyewunmi', got %s", c.Name)
	}
}
