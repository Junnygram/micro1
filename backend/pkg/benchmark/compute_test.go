package benchmark

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBenchmarkResultsConsistent(t *testing.T) {
	workspace := findWorkspace(t)
	result, err := Load(workspace, nil)
	if err != nil {
		t.Fatalf("load benchmark: %v", err)
	}
	if result.TotalCases < 10 {
		t.Fatalf("expected >= 10 cases, got %d", result.TotalCases)
	}
	agg := recomputeAggregates(result.Cases)
	if agg.baselineCorrect != result.BaselineCorrect {
		t.Errorf("baseline_correct mismatch: file=%d recomputed=%d", result.BaselineCorrect, agg.baselineCorrect)
	}
	if agg.agentCorrect != result.AgentCorrect {
		t.Errorf("agent_correct mismatch: file=%d recomputed=%d", result.AgentCorrect, agg.agentCorrect)
	}
	if agg.fraudTotal != result.FraudCasesTotal {
		t.Errorf("fraud_cases_total mismatch: file=%d recomputed=%d", result.FraudCasesTotal, agg.fraudTotal)
	}
}

// TestBenchmarkNotSelfScored guards against the benchmark being run against seeded
// demo audits instead of live agent output. That path returns dataset.json ground
// truth for both arms, so every row agrees with the target and with the other arm,
// and the file reports a meaningless 100%/100%.
func TestBenchmarkNotSelfScored(t *testing.T) {
	workspace := findWorkspace(t)
	result, err := Load(workspace, nil)
	if err != nil {
		t.Fatalf("load benchmark: %v", err)
	}

	identical := 0
	for _, c := range result.Cases {
		if c.Baseline == c.Agent {
			identical++
		}
	}
	if identical == len(result.Cases) {
		t.Errorf("baseline and agent agree on all %d cases — benchmark almost certainly read seeded ground truth instead of running the agents; re-run `make evaluate`", identical)
	}

	if result.BaselineAccuracyPct == 100 && result.AgentAccuracyPct == 100 {
		t.Errorf("both arms scored 100%% — this is the signature of a self-scored run, not a real evaluation")
	}

	if result.AgentFraudCaught == result.FraudCasesTotal && result.BaselineFraudCaught == result.FraudCasesTotal {
		t.Errorf("baseline caught every fraud case (%d/%d) — a text-only baseline should not, check for contaminated input", result.BaselineFraudCaught, result.FraudCasesTotal)
	}
}

func findWorkspace(t *testing.T) string {
	t.Helper()
	candidates := []string{
		".",
		"..",
		"../..",
		"../../..",
		"../../../backend",
		"backend",
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "data", "benchmark_results.json")); err == nil {
			return c
		}
	}
	t.Fatal("could not find workspace with benchmark_results.json")
	return ""
}

func TestBenchmarkJSONParse(t *testing.T) {
	workspace := findWorkspace(t)
	data, err := os.ReadFile(ResultsPath(workspace))
	if err != nil {
		t.Fatal(err)
	}
	var file filePayload
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatal(err)
	}
	if file.AgentAccuracyPct <= 0 || file.BaselineAccuracyPct <= 0 {
		t.Errorf("accuracy percentages must be > 0")
	}
}
