package runner

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type MockRepo struct {
	Name      string            `json:"name"`
	Stars     int               `json:"stars"`
	Languages []string          `json:"languages"`
	Files     map[string]string `json:"files"`
}

type ExpectedAudit struct {
	Claim    string `json:"claim"`
	Verdict  string `json:"verdict"` // "verified", "exaggerated", "failed"
	Evidence string `json:"evidence"`
}

type MockProctorLog struct {
	Timestamp string `json:"timestamp"`
	EventType string `json:"event_type"`
	Duration  int    `json:"duration"`
	Details   string `json:"details"`
}

type MockCandidate struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Email          string            `json:"email"`
	Role           string            `json:"role"`
	GithubUsername string            `json:"github_username"`
	Resume         string            `json:"resume"`
	JD             string            `json:"jd"`
	GithubRepos    []MockRepo        `json:"github_repos"`
	ProctoringLogs []MockProctorLog  `json:"proctoring_logs"`
	ExpectedAudit  []ExpectedAudit   `json:"expected_audit"`
}

func LoadDataset(workspaceDir string) ([]MockCandidate, error) {
	path := filepath.Join(workspaceDir, "data", "candidates", "dataset.json")
	fileBytes, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read dataset.json: %w", err)
	}

	var dataset []MockCandidate
	if err := json.Unmarshal(fileBytes, &dataset); err != nil {
		return nil, fmt.Errorf("failed to parse dataset.json: %w", err)
	}

	return dataset, nil
}

func GetCandidateByGithub(workspaceDir, githubUsername string) (*MockCandidate, error) {
	dataset, err := LoadDataset(workspaceDir)
	if err != nil {
		return nil, err
	}

	for i := range dataset {
		if dataset[i].GithubUsername == githubUsername {
			return &dataset[i], nil
		}
	}

	return nil, fmt.Errorf("candidate with GitHub username %s not found in dataset", githubUsername)
}
