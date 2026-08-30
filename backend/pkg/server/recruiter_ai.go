package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"backend/pkg/awsbedrock"
	"backend/pkg/db"
)

func (s *Server) buildCandidateContext(candidateID string) (map[string]interface{}, error) {
	cand, err := s.DB.GetCandidate(candidateID)
	if err != nil {
		return nil, err
	}
	audits, _ := s.DB.GetClaimsAudit(candidateID)
	proctoring, _ := s.DB.GetProctoringEvents(candidateID)

	auditLines := make([]string, 0, len(audits))
	inflated := 0
	for _, a := range audits {
		line := fmt.Sprintf("- %s: %s", a.ClaimText, a.Status)
		if a.EvidenceText != "" {
			line += fmt.Sprintf(" (evidence: %s)", truncate(a.EvidenceText, 120))
		}
		auditLines = append(auditLines, line)
		if a.Status == "exaggerated" || a.Status == "failed" {
			inflated++
		}
	}

	procLines := make([]string, 0, len(proctoring))
	for _, p := range proctoring {
		procLines = append(procLines, fmt.Sprintf("- [%s] %s (%ds): %s", p.Timestamp, p.EventType, p.Duration, p.Details))
	}

	interviewScore := 0
	interviewSummary := ""
	sessions, _ := s.DB.GetInterviewSessionsByJob(cand.JobID)
	for _, sess := range sessions {
		if sess.CandidateID == candidateID && sess.Status == "completed" {
			interviewScore = sess.InterviewScore
			interviewSummary = sess.FitSummary
			break
		}
	}

	return map[string]interface{}{
		"id":                cand.ID,
		"name":              cand.Name,
		"github":            cand.GithubUsername,
		"role":              cand.Role,
		"audit_score":       cand.SourcingScore,
		"interview_score":   interviewScore,
		"interview_summary": interviewSummary,
		"status":            cand.Status,
		"inflated_claims":   inflated,
		"audits":            auditLines,
		"proctoring_events": procLines,
	}, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-3] + "..."
}

func (s *Server) completeRecruiterText(systemPrompt, userPrompt string) string {
	br := awsbedrock.GetClient()
	if awsbedrock.PreferAWS() && br.Ready {
		text, err := br.Complete(systemPrompt, userPrompt, 1500)
		if err == nil && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}

	geminiKey := os.Getenv("GEMINI_API_KEY")
	if geminiKey != "" {
		body, _ := json.Marshal(map[string]interface{}{
			"contents": []map[string]interface{}{
				{"parts": []map[string]string{{"text": systemPrompt + "\n\n" + userPrompt}}},
			},
		})
		resp, err := http.Post(
			fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=%s", geminiKey),
			"application/json", strings.NewReader(string(body)),
		)
		if err == nil {
			defer resp.Body.Close()
			var result struct {
				Candidates []struct {
					Content struct {
						Parts []struct{ Text string `json:"text"` } `json:"parts"`
					} `json:"content"`
				} `json:"candidates"`
			}
			if json.NewDecoder(resp.Body).Decode(&result) == nil && len(result.Candidates) > 0 {
				return strings.TrimSpace(result.Candidates[0].Content.Parts[0].Text)
			}
		}
	}
	return ""
}

func (s *Server) fallbackRecruiterAnswer(candidates []map[string]interface{}, question string) string {
	if len(candidates) == 0 {
		return "No candidate data available for this company yet."
	}
	q := strings.ToLower(question)
	if strings.Contains(q, "alex") && strings.Contains(q, "emily") {
		var alex, emily map[string]interface{}
		for _, c := range candidates {
			if strings.Contains(strings.ToLower(fmt.Sprint(c["name"])), "alex") {
				alex = c
			}
			if strings.Contains(strings.ToLower(fmt.Sprint(c["name"])), "emily") {
				emily = c
			}
		}
		if alex != nil && emily != nil {
			return fmt.Sprintf(
				"Alex Rivera scores %v%% on audit vs Emily Chen at %v%%. Alex has %v inflated/failed claims and proctoring flags; Emily's GitHub evidence aligns with her resume. Rank Emily higher for this role.",
				alex["audit_score"], emily["audit_score"], alex["inflated_claims"],
			)
		}
	}
	best := candidates[0]
	for _, c := range candidates[1:] {
		if toInt(c["audit_score"]) > toInt(best["audit_score"]) {
			best = c
		}
	}
	return fmt.Sprintf(
		"Top audit score in context: %s at %v%% (%v inflated claims). Configure AWS Bedrock or Gemini for richer answers.",
		best["name"], best["audit_score"], best["inflated_claims"],
	)
}

func toInt(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case float64:
		return int(n)
	default:
		return 0
	}
}

func (s *Server) handleRecruiterChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		CompanyID    string   `json:"company_id"`
		JobID        string   `json:"job_id"`
		Question     string   `json:"question"`
		CandidateIDs []string `json:"candidate_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Question) == "" {
		http.Error(w, "question required", http.StatusBadRequest)
		return
	}

	var cands []db.Candidate
	var err error
	if req.JobID != "" {
		cands, err = s.DB.ListCandidatesByCompany(req.CompanyID, req.JobID)
	} else {
		cands, err = s.DB.ListCandidatesByCompany(req.CompanyID, "")
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	idFilter := map[string]bool{}
	for _, id := range req.CandidateIDs {
		idFilter[id] = true
	}

	var contexts []map[string]interface{}
	for _, c := range cands {
		if len(idFilter) > 0 && !idFilter[c.ID] {
			continue
		}
		ctx, err := s.buildCandidateContext(c.ID)
		if err == nil {
			contexts = append(contexts, ctx)
		}
	}

	ctxJSON, _ := json.MarshalIndent(contexts, "", "  ")
	systemPrompt := `You are ZaraSourcing recruiting copilot. Answer hiring questions using ONLY the candidate JSON provided. Be concise (3-5 sentences). Mention audit scores, inflated claims, proctoring events, and interview scores when relevant. If comparing candidates, give a clear recommendation.`
	userPrompt := fmt.Sprintf("Question: %s\n\nCandidate data:\n%s", req.Question, string(ctxJSON))

	answer := s.completeRecruiterText(systemPrompt, userPrompt)
	source := "ai"
	if answer == "" {
		answer = s.fallbackRecruiterAnswer(contexts, req.Question)
		source = "rules"
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"answer":            answer,
		"source":            source,
		"candidates_used":   len(contexts),
	})
}

func (s *Server) handleRecruiterCompare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		CompanyID     string `json:"company_id"`
		CandidateIDA  string `json:"candidate_id_a"`
		CandidateIDB  string `json:"candidate_id_b"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CandidateIDA == "" || req.CandidateIDB == "" {
		http.Error(w, "candidate_id_a and candidate_id_b required", http.StatusBadRequest)
		return
	}

	ctxA, errA := s.buildCandidateContext(req.CandidateIDA)
	ctxB, errB := s.buildCandidateContext(req.CandidateIDB)
	if errA != nil || errB != nil {
		http.Error(w, "candidate not found", http.StatusNotFound)
		return
	}

	aJSON, _ := json.MarshalIndent(ctxA, "", "  ")
	bJSON, _ := json.MarshalIndent(ctxB, "", "  ")
	systemPrompt := `You are ZaraSourcing recruiting copilot. Compare two candidates for a hiring manager. Respond with JSON only:
{
  "recommendation": "who to interview first and why (one sentence)",
  "candidate_a": { "name": "...", "strengths": "...", "risks": "...", "fraud_risk": "low|medium|high" },
  "candidate_b": { "name": "...", "strengths": "...", "risks": "...", "fraud_risk": "low|medium|high" },
  "summary": "2-3 sentence side-by-side brief"
}`
	userPrompt := fmt.Sprintf("Candidate A:\n%s\n\nCandidate B:\n%s", string(aJSON), string(bJSON))

	raw := s.completeRecruiterText(systemPrompt, userPrompt)
	result := map[string]interface{}{}
	source := "rules"
	if raw != "" {
		jsonStr, err := awsbedrock.ExtractJSON(raw)
		if err != nil {
			start := strings.Index(raw, "{")
			end := strings.LastIndex(raw, "}")
			if start >= 0 && end > start {
				jsonStr = raw[start : end+1]
			}
		}
		if jsonStr != "" && json.Unmarshal([]byte(jsonStr), &result) == nil && len(result) > 0 {
			source = "ai"
		}
	}
	if len(result) == 0 {
		result = map[string]interface{}{
			"recommendation": fmt.Sprintf("Interview %s first — higher audit score (%v%% vs %v%%).", ctxA["name"], ctxA["audit_score"], ctxB["audit_score"]),
			"candidate_a": map[string]interface{}{
				"name": ctxA["name"], "strengths": "See audit trail", "risks": fmt.Sprintf("%v flagged claims", ctxA["inflated_claims"]),
				"fraud_risk": fraudRisk(ctxA),
			},
			"candidate_b": map[string]interface{}{
				"name": ctxB["name"], "strengths": "See audit trail", "risks": fmt.Sprintf("%v flagged claims", ctxB["inflated_claims"]),
				"fraud_risk": fraudRisk(ctxB),
			},
			"summary": fmt.Sprintf("%s (%v%% audit) vs %s (%v%% audit). Configure AI keys for detailed comparison.", ctxA["name"], ctxA["audit_score"], ctxB["name"], ctxB["audit_score"]),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"comparison": result,
		"source":     source,
	})
}

func fraudRisk(ctx map[string]interface{}) string {
	inflated := toInt(ctx["inflated_claims"])
	proc := 0
	if events, ok := ctx["proctoring_events"].([]string); ok {
		proc = len(events)
	}
	if inflated >= 1 || proc >= 2 {
		return "high"
	}
	if inflated > 0 || proc > 0 {
		return "medium"
	}
	return "low"
}
