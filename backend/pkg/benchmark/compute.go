package benchmark

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"backend/pkg/db"
	"backend/pkg/runner"
)

type Case struct {
	Name          string `json:"name"`
	Github        string `json:"github"`
	Role          string `json:"role"`
	Target        string `json:"target"`
	Baseline      string `json:"baseline"`
	Agent         string `json:"agent"`
	Score         string `json:"score,omitempty"`
	Correct       bool   `json:"correct"`
	Note          string `json:"note,omitempty"`
	Highlight     bool   `json:"highlight,omitempty"`
	CandidateID   string `json:"candidate_id,omitempty"`
	HasLiveAudits bool   `json:"has_live_audits"`
}

type Result struct {
	Source              string  `json:"source"`
	EvaluatedAt         string  `json:"evaluated_at,omitempty"`
	ComputedAt          string  `json:"computed_at"`
	BaselineAccuracyPct float64 `json:"baseline_accuracy_pct"`
	AgentAccuracyPct    float64 `json:"agent_accuracy_pct"`
	BaselineCorrect     int     `json:"baseline_correct"`
	AgentCorrect        int     `json:"agent_correct"`
	TotalCases          int     `json:"total_cases"`
	FraudCasesTotal     int     `json:"fraud_cases_total"`
	BaselineFraudCaught int     `json:"baseline_fraud_caught"`
	AgentFraudCaught    int     `json:"agent_fraud_caught"`
	LiveCases           int     `json:"live_cases"`
	BaselineSource      string  `json:"baseline_source"`
	ReproduceCmd        string  `json:"reproduce_cmd"`
	Cases               []Case  `json:"cases"`
}

// filePayload mirrors backend/data/benchmark_results.json written by evaluate.py.
type filePayload struct {
	Source              string  `json:"source"`
	EvaluatedAt         string  `json:"evaluated_at"`
	BaselineAccuracyPct float64 `json:"baseline_accuracy_pct"`
	AgentAccuracyPct    float64 `json:"agent_accuracy_pct"`
	BaselineCorrect     int     `json:"baseline_correct"`
	AgentCorrect        int     `json:"agent_correct"`
	TotalCases          int     `json:"total_cases"`
	FraudCasesTotal     int     `json:"fraud_cases_total"`
	BaselineFraudCaught int     `json:"baseline_fraud_caught"`
	AgentFraudCaught    int     `json:"agent_fraud_caught"`
	Cases               []Case  `json:"cases"`
}

func ResultsPath(workspaceDir string) string {
	return filepath.Join(workspaceDir, "data", "benchmark_results.json")
}

func findCanonicalCandidate(database *db.DB, github string) (*db.Candidate, bool) {
	all, err := database.ListCandidates()
	if err != nil {
		return nil, false
	}
	var best *db.Candidate
	bestScore := -1
	for i := range all {
		c := all[i]
		if c.GithubUsername != github {
			continue
		}
		score := 0
		if c.CompanyID == "demo_company" {
			score += 10
		}
		if c.Status == "completed" {
			score += 5
		}
		audits, _ := database.GetClaimsAudit(c.ID)
		score += len(audits)
		if score > bestScore {
			bestScore = score
			best = &c
		}
	}
	return best, best != nil
}

// Load reads canonical benchmark results from benchmark_results.json (output of `make evaluate`).
// DB is used only to attach report links — metrics always come from the file so judges match reproduce.
func Load(workspaceDir string, database *db.DB) (*Result, error) {
	path := ResultsPath(workspaceDir)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("benchmark_results.json not found — run `make evaluate` from repo root: %w", err)
	}

	var file filePayload
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("parse benchmark_results.json: %w", err)
	}
	if len(file.Cases) == 0 {
		return nil, fmt.Errorf("benchmark_results.json has no cases — run `make evaluate`")
	}

	// Verify dataset still has same profiles (reproducibility guard).
	dataset, _ := runner.LoadDataset(workspaceDir)
	datasetByGithub := map[string]bool{}
	for _, m := range dataset {
		datasetByGithub[m.GithubUsername] = true
	}

	liveCases := 0
	cases := make([]Case, len(file.Cases))
	for i, c := range file.Cases {
		cases[i] = c
		if !datasetByGithub[c.Github] {
			cases[i].Note = "Profile missing from dataset.json — re-run make evaluate"
		}
		if database != nil {
			if cand, ok := findCanonicalCandidate(database, c.Github); ok {
				cases[i].CandidateID = cand.ID
				audits, _ := database.GetClaimsAudit(cand.ID)
				cases[i].HasLiveAudits = len(audits) > 0
				if cases[i].HasLiveAudits {
					liveCases++
				}
			}
		}
	}

	// Recompute aggregates from cases and warn if file header drifts.
	recomputed := recomputeAggregates(cases)
	if file.BaselineCorrect != recomputed.baselineCorrect || file.AgentCorrect != recomputed.agentCorrect {
		file.BaselineCorrect = recomputed.baselineCorrect
		file.AgentCorrect = recomputed.agentCorrect
		file.BaselineAccuracyPct = recomputed.baselinePct
		file.AgentAccuracyPct = recomputed.agentPct
		file.FraudCasesTotal = recomputed.fraudTotal
		file.BaselineFraudCaught = recomputed.baselineFraudCaught
		file.AgentFraudCaught = recomputed.agentFraudCaught
	}

	source := file.Source
	if source == "" {
		source = "make evaluate"
	}

	return &Result{
		Source:              source,
		EvaluatedAt:         file.EvaluatedAt,
		ComputedAt:          time.Now().UTC().Format(time.RFC3339),
		BaselineAccuracyPct: round1(file.BaselineAccuracyPct),
		AgentAccuracyPct:    round1(file.AgentAccuracyPct),
		BaselineCorrect:     file.BaselineCorrect,
		AgentCorrect:        file.AgentCorrect,
		TotalCases:          len(cases),
		FraudCasesTotal:     file.FraudCasesTotal,
		BaselineFraudCaught: file.BaselineFraudCaught,
		AgentFraudCaught:    file.AgentFraudCaught,
		LiveCases:           liveCases,
		BaselineSource:      "make_evaluate",
		ReproduceCmd:        "make evaluate",
		Cases:               cases,
	}, nil
}

type aggregates struct {
	baselineCorrect, agentCorrect int
	baselinePct, agentPct         float64
	fraudTotal                    int
	baselineFraudCaught           int
	agentFraudCaught              int
}

func verdictMatchesTarget(target, verdict string) bool {
	if target == "verified" {
		return verdict == "verified"
	}
	return verdict != "verified"
}

func recomputeAggregates(cases []Case) aggregates {
	var a aggregates
	for _, c := range cases {
		if verdictMatchesTarget(c.Target, c.Baseline) {
			a.baselineCorrect++
		}
		if c.Correct {
			a.agentCorrect++
		}
		if c.Target != "verified" {
			a.fraudTotal++
			if c.Baseline != "verified" {
				a.baselineFraudCaught++
			}
			if c.Agent != "verified" {
				a.agentFraudCaught++
			}
		}
	}
	n := len(cases)
	if n > 0 {
		a.baselinePct = float64(a.baselineCorrect) / float64(n) * 100
		a.agentPct = float64(a.agentCorrect) / float64(n) * 100
	}
	return a
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}

// Compute is an alias for Load (canonical file-based benchmark).
func Compute(workspaceDir string, database *db.DB) (*Result, error) {
	return Load(workspaceDir, database)
}
