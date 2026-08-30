package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"backend/pkg/db"
	"backend/pkg/runner"
	"backend/pkg/awsbedrock"
)

type BaselineAgent struct {
	DB           *db.DB
	WorkspaceDir string
	APIKey       string
}

func NewBaselineAgent(database *db.DB, workspaceDir, apiKey string) *BaselineAgent {
	return &BaselineAgent{
		DB:           database,
		WorkspaceDir: workspaceDir,
		APIKey:       apiKey,
	}
}

func (b *BaselineAgent) StartSession(candidateID, githubUsername string) error {
	mockCand, err := runner.GetCandidateByGithub(b.WorkspaceDir, githubUsername)
	if err != nil {
		return fmt.Errorf("failed to fetch mock data: %w", err)
	}

	_ = b.DB.ClearClaimsAudit(candidateID)

	_, _ = b.DB.AddStep(candidateID, "system", "Baseline text-only evaluation started.", "{}")

	prompt := fmt.Sprintf(`You are a technical recruiter. Review this candidate's resume and job description.
Do NOT search external sites. Score the candidate out of 100 based ENTIRELY on the text claims in their resume.
Identify key claims and write a short summary.

Job Description:
%s

Candidate Resume:
%s

You MUST format your output as follows:
[SCORE] <number out of 100>
[CLAIM] <Resume claim text>
[VERDICT] <verified|exaggerated|failed>
[EXPLANATION] <reasoning>

Since you have no access to their actual code, you must default to 'verified' for claims that read well on the resume.`, 
	mockCand.JD, mockCand.Resume)

	_, _ = b.DB.AddStep(candidateID, "user_feedback", "Baseline Request Sent to LLM", "{}")

	response, err := b.callLLM(prompt)
	if err != nil {
		_ = b.DB.UpdateCandidateScore(candidateID, 0, "failed")
		_, _ = b.DB.AddStep(candidateID, "system", fmt.Sprintf("Baseline call failed: %v", err), "{}")
		return err
	}

	_, _ = b.DB.AddStep(candidateID, "thought", response, "{}")

	score := b.parseScore(response)
	b.parseAndSaveClaims(candidateID, response)

	err = b.DB.UpdateCandidateScore(candidateID, score, "completed")
	if err != nil {
		return err
	}
	_, _ = b.DB.AddStep(candidateID, "system", fmt.Sprintf("Baseline audit complete! Score computed: %d/100", score), "{}")

	return nil
}

func (b *BaselineAgent) parseScore(text string) int {
	re := regexp.MustCompile(`\[SCORE\]\s*(\d+)`)
	matches := re.FindStringSubmatch(text)
	if len(matches) == 2 {
		if val, err := strconv.Atoi(matches[1]); err == nil {
			return val
		}
	}
	return 50
}

func (b *BaselineAgent) parseAndSaveClaims(candidateID, text string) {
	reClaim := regexp.MustCompile(`\[CLAIM\]\s*([^\n]+)`)
	reVerdict := regexp.MustCompile(`\[VERDICT\]\s*([^\n]+)`)
	reExplanation := regexp.MustCompile(`\[EXPLANATION\]\s*([^\n]+)`)

	claims := reClaim.FindAllStringSubmatch(text, -1)
	verdicts := reVerdict.FindAllStringSubmatch(text, -1)
	explanations := reExplanation.FindAllStringSubmatch(text, -1)

	n := len(claims)
	if len(verdicts) < n {
		n = len(verdicts)
	}
	if len(explanations) < n {
		n = len(explanations)
	}

	if n == 0 {
		_ = b.DB.SaveClaimAudit(candidateID, "Text claims listed on CV", "Matches standard Job Description keyword patterns.", "Resume Text", "verified", "none")
		return
	}

	for i := 0; i < n; i++ {
		claim := strings.TrimSpace(claims[i][1])
		verdict := strings.TrimSpace(verdicts[i][1])
		explanation := strings.TrimSpace(explanations[i][1])

		v := "verified"
		if strings.ToLower(verdict) == "exaggerated" {
			v = "exaggerated"
		} else if strings.ToLower(verdict) == "failed" {
			v = "failed"
		}

		_ = b.DB.SaveClaimAudit(candidateID, claim, explanation, "Resume Text", v, "none")
	}
}

var baselineApiClient = &http.Client{
	Timeout: 30 * time.Second,
}

func (b *BaselineAgent) callLLM(prompt string) (string, error) {
	br := awsbedrock.GetClient()
	if awsbedrock.PreferAWS() && br.Ready {
		text, err := br.Complete(
			"You are a technical recruiter. Review resumes against job descriptions. Output [SCORE], [CLAIM], [VERDICT], [EXPLANATION] blocks.",
			prompt,
			1500,
		)
		if err == nil && text != "" {
			log.Println("[AWS Bedrock] Baseline evaluation via Claude")
			return text, nil
		}
		log.Printf("[AWS Bedrock] Baseline failed: %v — trying Gemini", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=%s", b.APIKey)

	reqBody := GeminiRequest{
		Contents: []GeminiContent{
			{
				Role: "user",
				Parts: []GeminiPart{
					{Text: prompt},
				},
			},
		},
		GenerationConfig: GenerationConfig{
			Temperature: 0.1,
		},
	}

	reqBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	maxRetries := 5
	backoff := 5 * time.Second

	for attempt := 0; attempt < maxRetries; attempt++ {
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(reqBytes))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := baselineApiClient.Do(req)
		if err != nil {
			if attempt == maxRetries-1 {
				return "", err
			}
			log.Printf("[Connection Error] %v. Retrying in %v...", err, backoff)
			time.Sleep(backoff)
			backoff *= 2
			continue
		}

		respBytes, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return "", err
		}

		if resp.StatusCode == 429 {
			log.Printf("[429 Rate Limit] Exceeded quota. Retrying in %v (attempt %d/%d)...", backoff, attempt+1, maxRetries)
			time.Sleep(backoff)
			backoff *= 2
			continue
		}

		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("gemini API returned status %d: %s", resp.StatusCode, string(respBytes))
		}

		var geminiResp GeminiResponse
		if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
			return "", err
		}

		if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
			return "", fmt.Errorf("empty response candidates from Gemini")
		}

		return geminiResp.Candidates[0].Content.Parts[0].Text, nil
	}

	return "", fmt.Errorf("rate limit retry budget exceeded")
}
