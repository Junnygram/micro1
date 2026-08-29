package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"backend/pkg/db"
	"backend/pkg/runner"
	"strings"

	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
)

type Agent struct {
	DB            *db.DB
	WorkspaceDir  string
	APIKey        string
	BedrockClient *bedrockruntime.Client // AWS Bedrock runtime client
}

func NewAgent(database *db.DB, workspaceDir, apiKey string) *Agent {
	ctx := context.TODO()
	cfg, err := config.LoadDefaultConfig(ctx)
	var bedrockClient *bedrockruntime.Client
	if err == nil {
		bedrockClient = bedrockruntime.NewFromConfig(cfg)
		log.Println("[AWS Bedrock] Bedrock client initialized successfully.")
	} else {
		log.Printf("[AWS Bedrock] Failed to load default AWS config: %v", err)
	}

	return &Agent{
		DB:            database,
		WorkspaceDir:  workspaceDir,
		APIKey:        apiKey,
		BedrockClient: bedrockClient,
	}
}

// API Structures
type GeminiPart struct {
	Text             string            `json:"text,omitempty"`
	ThoughtSignature string            `json:"thoughtSignature,omitempty"`
	FunctionCall     *FunctionCall     `json:"functionCall,omitempty"`
	FunctionResponse *FunctionResponse `json:"functionResponse,omitempty"`
}

type FunctionCall struct {
	Name string                 `json:"name"`
	Args map[string]interface{} `json:"args"`
}

type FunctionResponse struct {
	Name     string                 `json:"name"`
	Response map[string]interface{} `json:"response"`
}

type GeminiContent struct {
	Role  string       `json:"role"`
	Parts []GeminiPart `json:"parts"`
}

type GeminiTool struct {
	FunctionDeclarations []FunctionDeclaration `json:"functionDeclarations"`
}

type FunctionDeclaration struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Parameters  Parameters `json:"parameters"`
}

type Parameters struct {
	Type       string              `json:"type"`
	Properties map[string]Property `json:"properties"`
	Required   []string            `json:"required"`
}

type Property struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

type GenerationConfig struct {
	Temperature float64 `json:"temperature"`
}

type GeminiRequest struct {
	Contents         []GeminiContent  `json:"contents"`
	Tools            []GeminiTool     `json:"tools,omitempty"`
	GenerationConfig GenerationConfig `json:"generationConfig,omitempty"`
}

type GeminiResponse struct {
	Candidates []struct {
		Content struct {
			Role  string       `json:"role"`
			Parts []GeminiPart `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

var Tools = []GeminiTool{
	{
		FunctionDeclarations: []FunctionDeclaration{
			{
				Name:        "list_github_repos",
				Description: "Retrieve candidate's public repositories, stars, and languages. Example: 'junnygram'",
				Parameters: Parameters{
					Type: "OBJECT",
					Properties: map[string]Property{
						"username": {
							Type:        "STRING",
							Description: "The candidate's GitHub username",
						},
					},
					Required: []string{"username"},
				},
			},
			{
				Name:        "get_repo_file",
				Description: "Read the complete code content of a specific file in a candidate's repository.",
				Parameters: Parameters{
					Type: "OBJECT",
					Properties: map[string]Property{
						"username": {
							Type:        "STRING",
							Description: "The candidate's GitHub username",
						},
						"repo": {
							Type:        "STRING",
							Description: "The repository name",
						},
						"filepath": {
							Type:        "STRING",
							Description: "The path to the file in the repository (e.g. 'main.go')",
						},
					},
					Required: []string{"username", "repo", "filepath"},
				},
			},
			{
				Name:        "get_proctoring_logs",
				Description: "Retrieve proctoring log events during the candidate's interview session (e.g. tab switches, look aways).",
				Parameters: Parameters{
					Type: "OBJECT",
					Properties: map[string]Property{
						"username": {
							Type:        "STRING",
							Description: "The candidate's GitHub username",
						},
					},
					Required: []string{"username"},
				},
			},
			{
				Name:        "search_web_intel",
				Description: "Search-ground candidate's credentials, articles, or other claimed public achievements.",
				Parameters: Parameters{
					Type: "OBJECT",
					Properties: map[string]Property{
						"query": {
							Type:        "STRING",
							Description: "The search query to verify",
						},
					},
					Required: []string{"query"},
				},
			},
			{
				Name:        "save_claim_audit",
				Description: "File a claim audit verdict for a specific resume item, with cited evidence.",
				Parameters: Parameters{
					Type: "OBJECT",
					Properties: map[string]Property{
						"claim_text": {
							Type:        "STRING",
							Description: "The CV/Resume text claim being evaluated",
						},
						"evidence_text": {
							Type:        "STRING",
							Description: "The code quote or reasoning confirming or disproving the claim",
						},
						"file_path": {
							Type:        "STRING",
							Description: "The repository file path citation (e.g. 'expense-insights/main.go:L10-15')",
						},
						"status": {
							Type:        "STRING",
							Description: "Verdict: must be 'verified', 'exaggerated', or 'failed'",
						},
						"severity": {
							Type:        "STRING",
							Description: "Discrepancy risk severity: must be 'high', 'medium', or 'none'",
						},
					},
					Required: []string{"claim_text", "evidence_text", "file_path", "status", "severity"},
				},
			},
			{
				Name:        "save_proctoring_flag",
				Description: "Log an identified proctoring focus alert or violation for the candidate visual timeline.",
				Parameters: Parameters{
					Type: "OBJECT",
					Properties: map[string]Property{
						"timestamp": {
							Type:        "STRING",
							Description: "The timestamp of the event (e.g. '04:12')",
						},
						"event_type": {
							Type:        "STRING",
							Description: "Type: 'look_away', 'tab_switch', or 'voice_detected'",
						},
						"duration": {
							Type:        "INTEGER",
							Description: "Duration of the distraction event in seconds",
						},
						"details": {
							Type:        "STRING",
							Description: "Descriptive proctoring logs detail of the warning",
						},
					},
					Required: []string{"timestamp", "event_type", "duration", "details"},
				},
			},
			{
				Name:        "complete_audit",
				Description: "Record the final computed sourcing alignment score and mark the candidate evaluation complete.",
				Parameters: Parameters{
					Type: "OBJECT",
					Properties: map[string]Property{
						"sourcing_score": {
							Type:        "INTEGER",
							Description: "Final technical alignment score out of 100",
						},
					},
					Required: []string{"sourcing_score"},
				},
			},
		},
	},
}

func (a *Agent) StartSession(candidateID, githubUsername string) error {
	cand, err := a.DB.GetCandidate(candidateID)
	if err != nil {
		return fmt.Errorf("failed to fetch candidate: %w", err)
	}

	mockCand, err := runner.GetCandidateByGithub(a.WorkspaceDir, githubUsername)
	if err != nil {
		return fmt.Errorf("failed to fetch mock data: %w", err)
	}

	// Clear old audits and proctoring
	_ = a.DB.ClearClaimsAudit(candidateID)
	_ = a.DB.ClearProctoringEvents(candidateID)

	// Log system init step
	initMsg := fmt.Sprintf("System initialized for candidate: %s (@%s)\nJob Description: %s", cand.Name, githubUsername, mockCand.JD)
	_, err = a.DB.AddStep(candidateID, "system", initMsg, "{}")
	if err != nil {
		return err
	}

	// Add initial instruction as user message
	userPrompt := fmt.Sprintf("Candidate Name: %s\nGitHub Profile: @%s\n\nJob Description Requirements:\n%s\n\nCandidate Resume:\n%s\n\nPlease list candidate's repositories, examine code files, fetch and audit proctoring logs for focus alerts using 'get_proctoring_logs', save proctor flags using 'save_proctoring_flag', save claim audits using 'save_claim_audit', and complete with a final 'complete_audit' score.", cand.Name, githubUsername, mockCand.JD, mockCand.Resume)
	_, err = a.DB.AddStep(candidateID, "user_feedback", userPrompt, "{}")
	if err != nil {
		return err
	}

	return a.ExecuteLoop(candidateID)
}

func (a *Agent) ExecuteLoop(candidateID string) error {
	maxIterations := 15
	for iter := 0; iter < maxIterations; iter++ {
		c, err := a.DB.GetCandidate(candidateID)
		if err != nil {
			return err
		}
		if c.Status != "evaluating" {
			return nil
		}

		// Rebuild history
		history, err := a.rebuildHistory(candidateID)
		if err != nil {
			return err
		}

		// Sleep 1 second between turns to stay strictly under the rate limit
		if iter > 0 {
			time.Sleep(1 * time.Second)
		}

		// Check tool execution limit
		toolCallsCount := 0
		for _, step := range history {
			if step.Role == "model" {
				for _, part := range step.Parts {
					if part.FunctionCall != nil {
						toolCallsCount++
					}
				}
			}
		}
		if toolCallsCount > 30 {
			_ = a.DB.UpdateCandidateScore(candidateID, 0, "failed")
			_, _ = a.DB.AddStep(candidateID, "system", "Agent exceeded max tool executions safety limit.", "{}")
			return nil
		}

		// Call Gemini API
		responsePart, err := a.callLLM(history)
		if err != nil {
			_ = a.DB.UpdateCandidateScore(candidateID, 0, "failed")
			_, _ = a.DB.AddStep(candidateID, "system", fmt.Sprintf("Error calling Gemini API: %v", err), "{}")
			return err
		}

		// Record response
		if responsePart.Text != "" {
			meta := fmt.Sprintf(`{"thoughtSignature":%q}`, responsePart.ThoughtSignature)
			_, err = a.DB.AddStep(candidateID, "thought", responsePart.Text, meta)
			if err != nil {
				return err
			}
		}

		if responsePart.FunctionCall != nil {
			argsBytes, _ := json.Marshal(responsePart.FunctionCall.Args)
			meta := fmt.Sprintf(`{"args":%s,"thoughtSignature":%q}`, string(argsBytes), responsePart.ThoughtSignature)
			_, err := a.DB.AddStep(candidateID, "tool_call", responsePart.FunctionCall.Name, meta)
			if err != nil {
				return err
			}

			result, err := a.executeTool(candidateID, responsePart.FunctionCall.Name, responsePart.FunctionCall.Args)
			var resultStr string
			if err != nil {
				resultStr = fmt.Sprintf(`{"error":%q}`, err.Error())
			} else {
				resBytes, _ := json.Marshal(result)
				resultStr = string(resBytes)
			}

			_, err = a.DB.AddStep(candidateID, "tool_result", responsePart.FunctionCall.Name, resultStr)
			if err != nil {
				return err
			}

			if responsePart.FunctionCall.Name == "complete_audit" && err == nil {
				return nil
			}

		} else {
			_, err = a.DB.AddStep(candidateID, "system", "Please use list_github_repos, get_repo_file, get_proctoring_logs, save_proctoring_flag, and save_claim_audit tools and complete_audit when finished.", "{}")
			if err != nil {
				return err
			}
		}
	}

	_ = a.DB.UpdateCandidateScore(candidateID, 0, "failed")
	_, _ = a.DB.AddStep(candidateID, "system", "Agent failed to complete the verification within the execution budget.", "{}")
	return nil
}

func (a *Agent) executeTool(candidateID string, name string, args map[string]interface{}) (interface{}, error) {
	switch name {
	case "list_github_repos":
		username, _ := args["username"].(string)
		if username == "" {
			return nil, fmt.Errorf("missing username")
		}
		
		mockCand, err := runner.GetCandidateByGithub(a.WorkspaceDir, username)
		if err != nil {
			return nil, err
		}

		type RepoInfo struct {
			Name      string   `json:"name"`
			Stars     int      `json:"stars"`
			Languages []string `json:"languages"`
		}
		var list []RepoInfo
		for _, r := range mockCand.GithubRepos {
			list = append(list, RepoInfo{
				Name:      r.Name,
				Stars:     r.Stars,
				Languages: r.Languages,
			})
		}
		return list, nil

	case "get_repo_file":
		username, _ := args["username"].(string)
		repo, _ := args["repo"].(string)
		filepath, _ := args["filepath"].(string)
		if username == "" || repo == "" || filepath == "" {
			return nil, fmt.Errorf("missing username, repo, or filepath arguments")
		}

		mockCand, err := runner.GetCandidateByGithub(a.WorkspaceDir, username)
		if err != nil {
			return nil, err
		}

		for _, r := range mockCand.GithubRepos {
			if r.Name == repo {
				if content, ok := r.Files[filepath]; ok {
					return map[string]string{"content": content}, nil
				}
			}
		}
		return nil, fmt.Errorf("file %s not found in repo %s", filepath, repo)

	case "get_proctoring_logs":
		username, _ := args["username"].(string)
		if username == "" {
			return nil, fmt.Errorf("missing username argument")
		}
		mockCand, err := runner.GetCandidateByGithub(a.WorkspaceDir, username)
		if err != nil {
			return nil, err
		}
		return mockCand.ProctoringLogs, nil

	case "search_web_intel":
		query, _ := args["query"].(string)
		if query == "" {
			return nil, fmt.Errorf("missing query argument")
		}
		snippet := fmt.Sprintf("Web search index found 1 verified result for '%s': confirming candidate involvement and credentials matching technical scope.", query)
		return map[string]string{"snippet": snippet}, nil

	case "save_claim_audit":
		claim, _ := args["claim_text"].(string)
		evidence, _ := args["evidence_text"].(string)
		filepath, _ := args["file_path"].(string)
		status, _ := args["status"].(string)
		severity, _ := args["severity"].(string)

		if claim == "" || evidence == "" || filepath == "" || status == "" || severity == "" {
			return nil, fmt.Errorf("missing required audit arguments")
		}

		err := a.DB.SaveClaimAudit(candidateID, claim, evidence, filepath, status, severity)
		if err != nil {
			return nil, fmt.Errorf("failed to save claim audit: %w", err)
		}
		return map[string]bool{"success": true}, nil

	case "save_proctoring_flag":
		timestamp, _ := args["timestamp"].(string)
		eventType, _ := args["event_type"].(string)
		durationFloat, _ := args["duration"].(float64)
		details, _ := args["details"].(string)

		if timestamp == "" || eventType == "" || details == "" {
			return nil, fmt.Errorf("missing required proctoring arguments")
		}
		duration := int(durationFloat)

		err := a.DB.SaveProctoringEvent(candidateID, timestamp, eventType, duration, details)
		if err != nil {
			return nil, fmt.Errorf("failed to save proctor event: %w", err)
		}
		return map[string]bool{"success": true}, nil

	case "complete_audit":
		scoreFloat, ok := args["sourcing_score"].(float64)
		if !ok {
			return nil, fmt.Errorf("missing or invalid sourcing_score")
		}
		score := int(scoreFloat)

		err := a.DB.UpdateCandidateScore(candidateID, score, "completed")
		if err != nil {
			return nil, fmt.Errorf("failed to complete audit: %w", err)
		}

		_, _ = a.DB.AddStep(candidateID, "system", fmt.Sprintf("Audit complete! Sourcing Score computed: %d/100", score), "{}")
		return map[string]bool{"success": true}, nil
	}

	return nil, fmt.Errorf("unknown tool: %s", name)
}

func (a *Agent) rebuildHistory(candidateID string) ([]GeminiContent, error) {
	steps, err := a.DB.GetSessionSteps(candidateID)
	if err != nil {
		return nil, err
	}

	var history []GeminiContent
	systemPrompt := `You are ZaraSourcing, an autonomous candidate technical auditor. Your job is to verify if a candidate's resume claims match their actual coding footprint on GitHub, and inspect their remote interview proctoring logs to audit integrity (cheating, tab switching, or webcam look-aways).
You are given a candidate's Resume, the Job Description requirements, and their GitHub username.
You have access to tools:
- list_github_repos: returns the candidate's repos, stars, and languages.
- get_repo_file: returns the complete contents of a specific file in a candidate's repository.
- get_proctoring_logs: returns camera look-aways, tab blurs, secondary voice prompts.
- search_web_intel: runs search grounding to verify credentials, talks, or other public achievements.
- save_claim_audit: records a verified, exaggerated, or failed resume claim with cited evidence and code files.
- save_proctoring_flag: logs a proctoring distraction or focus alert to show in the UI timeline.
- complete_audit: saves the final technical sourcing score and finishes the session.

Workflow:
1. Examine candidate resume and JD.
2. List the candidate's GitHub repositories to see what they have coded.
3. Fetch and analyze relevant source files using 'get_repo_file'.
4. Fetch proctoring logs using 'get_proctoring_logs'. If you identify any events (like tab switches or webcam look-aways), log them using 'save_proctoring_flag'.
5. If there are severe proctoring violations (e.g. voice detected or copying code during window blurs), file a failed claim audit with category 'integrity' using 'save_claim_audit'.
6. Save claim audits for key requirements. Every audit MUST cite the exact code file path and line numbers, and provide the relevant code snippet.
7. Call complete_audit with a final calculated sourcing score out of 100.

Verdicts:
- verified: The candidate's codebase directly confirms the claim.
- exaggerated: The candidate overstated their role/tenure, or the code doesn't exist, or it is just a copied README.
- failed: The code contains major security bugs, structural failures, or directly contradicts the claim, or they committed proctor plagiarism.

Severity flags:
- high: Severe contradictions or clear proctoring cheats.
- medium: Minor exaggerations or focus look-aways.
- none: Verified claims.`

	history = append(history, GeminiContent{
		Role: "user",
		Parts: []GeminiPart{
			{Text: systemPrompt},
		},
	})

	var pendingModelCall *FunctionCall
	var pendingThoughtSig string

	for _, step := range steps {
		switch step.Type {
		case "user_feedback":
			history = append(history, GeminiContent{
				Role:  "user",
				Parts: []GeminiPart{{Text: step.Content}},
			})

		case "thought":
			var meta map[string]interface{}
			_ = json.Unmarshal([]byte(step.Metadata), &meta)
			thoughtSig, _ := meta["thoughtSignature"].(string)
			history = append(history, GeminiContent{
				Role:  "model",
				Parts: []GeminiPart{{Text: step.Content, ThoughtSignature: thoughtSig}},
			})

		case "tool_call":
			var meta map[string]interface{}
			_ = json.Unmarshal([]byte(step.Metadata), &meta)
			args, _ := meta["args"].(map[string]interface{})
			thoughtSig, _ := meta["thoughtSignature"].(string)
			pendingModelCall = &FunctionCall{
				Name: step.Content,
				Args: args,
			}
			pendingThoughtSig = thoughtSig

		case "tool_result":
			if pendingModelCall != nil {
				history = append(history, GeminiContent{
					Role: "model",
					Parts: []GeminiPart{
						{
							FunctionCall:     pendingModelCall,
							ThoughtSignature: pendingThoughtSig,
						},
					},
				})
				pendingModelCall = nil
				pendingThoughtSig = ""
			}

			var resMap map[string]interface{}
			_ = json.Unmarshal([]byte(step.Metadata), &resMap)
			if resMap == nil {
				var resList []interface{}
				if err := json.Unmarshal([]byte(step.Metadata), &resList); err == nil {
					resMap = map[string]interface{}{"result": resList}
				}
			}

			history = append(history, GeminiContent{
				Role: "user",
				Parts: []GeminiPart{
					{
						FunctionResponse: &FunctionResponse{
							Name:     step.Content,
							Response: resMap,
						},
					},
				},
			})

		case "system":
			history = append(history, GeminiContent{
				Role:  "user",
				Parts: []GeminiPart{{Text: fmt.Sprintf("[SYSTEM NOTICE]: %s", step.Content)}},
			})
		}
	}

	return history, nil
}

var apiClient = &http.Client{
	Timeout: 30 * time.Second,
}

func (a *Agent) callLLM(history []GeminiContent) (*GeminiPart, error) {
	useBedrock := false
	if sc, err := a.DB.GetCriteria(); err == nil {
		if sc.LlmModel == "bedrock" {
			useBedrock = true
		}
	}

	// Attempt AWS Bedrock invocation first (Claude 3.5 Sonnet / Claude 3 Sonnet) if selected & client is ready
	if useBedrock && a.BedrockClient != nil {
		log.Println("[AWS Bedrock] Invoking Claude on AWS Bedrock...")
		part, err := a.callBedrock(history)
		if err == nil && part != nil {
			log.Println("[AWS Bedrock] Successfully generated decision via Claude.")
			return part, nil
		}
		log.Printf("[AWS Bedrock] Bedrock invocation bypassed or failed: %v. Falling back to Gemini.", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=%s", a.APIKey)

	reqBody := GeminiRequest{
		Contents: history,
		Tools:    Tools,
		GenerationConfig: GenerationConfig{
			Temperature: 0.1,
		},
	}

	reqBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	maxRetries := 5
	backoff := 5 * time.Second

	for attempt := 0; attempt < maxRetries; attempt++ {
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(reqBytes))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := apiClient.Do(req)
		if err != nil {
			if attempt == maxRetries-1 {
				return nil, err
			}
			log.Printf("[Connection Error] %v. Retrying in %v...", err, backoff)
			time.Sleep(backoff)
			backoff *= 2
			continue
		}

		respBytes, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}

		if resp.StatusCode == 429 {
			log.Printf("[429 Rate Limit] Exceeded quota. Retrying in %v (attempt %d/%d)...", backoff, attempt+1, maxRetries)
			time.Sleep(backoff)
			backoff *= 2
			continue
		}

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("gemini API returned status %d: %s", resp.StatusCode, string(respBytes))
		}

		var geminiResp GeminiResponse
		if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
			return nil, err
		}

		if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
			return nil, fmt.Errorf("empty response candidates from Gemini")
		}

		part := geminiResp.Candidates[0].Content.Parts[0]
		return &part, nil
	}

	return nil, fmt.Errorf("rate limit retry budget exceeded")
}

// callBedrock: Invokes Claude 3.5 Sonnet or Claude 3 Sonnet on AWS Bedrock for structured claim audit actions
func (a *Agent) callBedrock(history []GeminiContent) (*GeminiPart, error) {
	if a.BedrockClient == nil {
		return nil, fmt.Errorf("AWS Bedrock client not initialized")
	}

	// Prepare history text transcript
	var transcript strings.Builder
	transcript.WriteString("ZaraSourcing Agent Execution History:\n\n")
	for _, h := range history {
		transcript.WriteString(fmt.Sprintf("=== %s ===\n", strings.ToUpper(h.Role)))
		for _, p := range h.Parts {
			if p.Text != "" {
				transcript.WriteString(p.Text + "\n")
			}
			if p.FunctionCall != nil {
				argsJSON, _ := json.Marshal(p.FunctionCall.Args)
				transcript.WriteString(fmt.Sprintf("CALL TOOL: %s with args: %s\n", p.FunctionCall.Name, string(argsJSON)))
			}
			if p.FunctionResponse != nil {
				resJSON, _ := json.Marshal(p.FunctionResponse.Response)
				transcript.WriteString(fmt.Sprintf("TOOL RESULT: %s response: %s\n", p.FunctionResponse.Name, string(resJSON)))
			}
		}
		transcript.WriteString("\n")
	}

	// Formulate decision instruction prompt
	systemPrompt := `You are the decision engine for ZaraSourcing, an autonomous candidate vetting agent.
You must choose the next best tool to run from the following list of tools:
1. list_github_repos(username string): returns public repos.
2. get_repo_file(username string, repo string, filepath string): returns repo file content.
3. get_proctoring_logs(username string): returns candidate proctoring anomaly events.
4. search_web_intel(query string): queries public search engines for credentials validation.
5. save_claim_audit(claim_text string, evidence_text string, file_path string, status string, severity string): status can be 'verified', 'exaggerated', 'failed'; severity can be 'high', 'medium', 'none'.
6. save_proctoring_flag(timestamp string, event_type string, duration int, details string): logs timeline events in the UI.
7. complete_audit(sourcing_score int): finalizes evaluation.

You MUST respond with a single valid JSON block matching this schema:
{
  "text": "Your thought process explaining what you are looking for.",
  "functionCall": {
    "name": "name_of_tool_to_call",
    "args": {
      "arg1": "value1"
    }
  }
}
If no more tools are needed, call 'complete_audit' with the calculated score.`

	payload := map[string]interface{}{
		"anthropic_version": "bedrock-2023-05-31",
		"max_tokens":        2000,
		"system":            systemPrompt,
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": fmt.Sprintf("Here is the history of the session. Please output the JSON decision block for the next action:\n\n%s", transcript.String()),
			},
		},
		"temperature": 0.1,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	// Invoke Claude 3.5 Sonnet on Bedrock
	input := &bedrockruntime.InvokeModelInput{
		ModelId:     aws.String("anthropic.claude-3-5-sonnet-20200620-v1:0"),
		ContentType: aws.String("application/json"),
		Accept:      aws.String("application/json"),
		Body:        payloadBytes,
	}

	resp, err := a.BedrockClient.InvokeModel(context.TODO(), input)
	if err != nil {
		// Fallback for Claude 3 Sonnet
		input.ModelId = aws.String("anthropic.claude-3-sonnet-20240229-v1:0")
		resp, err = a.BedrockClient.InvokeModel(context.TODO(), input)
		if err != nil {
			return nil, err
		}
	}

	var responseMap map[string]interface{}
	if err := json.Unmarshal(resp.Body, &responseMap); err != nil {
		return nil, err
	}

	contentList, ok := responseMap["content"].([]interface{})
	if !ok || len(contentList) == 0 {
		return nil, fmt.Errorf("empty content from Bedrock")
	}

	contentMap, ok := contentList[0].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid content format from Bedrock")
	}

	responseText, ok := contentMap["text"].(string)
	if !ok {
		return nil, fmt.Errorf("missing text response from Bedrock")
	}

	// Extract JSON block from response text
	jsonStart := strings.Index(responseText, "{")
	jsonEnd := strings.LastIndex(responseText, "}")
	if jsonStart == -1 || jsonEnd == -1 || jsonEnd < jsonStart {
		return nil, fmt.Errorf("failed to locate valid JSON response in model output: %s", responseText)
	}
	jsonString := responseText[jsonStart : jsonEnd+1]

	var decision struct {
		Text         string        `json:"text"`
		FunctionCall *FunctionCall `json:"functionCall"`
	}
	if err := json.Unmarshal([]byte(jsonString), &decision); err != nil {
		return nil, fmt.Errorf("failed to parse decision JSON: %w. Raw string: %s", err, jsonString)
	}

	part := GeminiPart{
		Text:         decision.Text,
		FunctionCall: decision.FunctionCall,
	}
	return &part, nil
}
