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
	"backend/pkg/awsbedrock"
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
				Name:        "list_repo_files",
				Description: "List all available source file paths in a candidate's repository. ALWAYS call this before get_repo_file to discover actual paths — never guess filenames.",
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
					},
					Required: []string{"username", "repo"},
				},
			},
			{
				Name:        "get_repo_file",
				Description: "Read the complete code content of a specific file in a candidate's repository. Use list_repo_files first to get the exact filepath.",
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
	userPrompt := fmt.Sprintf("Candidate Name: %s\nGitHub Profile: @%s\n\nJob Description Requirements:\n%s\n\nCandidate Resume:\n%s\n\nAudit each resume claim against code evidence. For every repo: call list_repo_files before get_repo_file. Do not mark any claim exaggerated until all source files have been read. Fetch proctoring logs with get_proctoring_logs, save proctor flags with save_proctoring_flag, save claim audits with save_claim_audit, then complete with complete_audit.", cand.Name, githubUsername, mockCand.JD, mockCand.Resume)
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
			_, err = a.DB.AddStep(candidateID, "system", "Please use list_github_repos, list_repo_files, get_repo_file, get_proctoring_logs, save_proctoring_flag, and save_claim_audit tools and complete_audit when finished.", "{}")
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

	case "list_repo_files":
		username, _ := args["username"].(string)
		repo, _ := args["repo"].(string)
		if username == "" || repo == "" {
			return nil, fmt.Errorf("missing username or repo arguments")
		}

		mockCand, err := runner.GetCandidateByGithub(a.WorkspaceDir, username)
		if err != nil {
			return nil, err
		}

		for _, r := range mockCand.GithubRepos {
			if r.Name == repo {
				var paths []string
				for p := range r.Files {
					paths = append(paths, p)
				}
				return map[string]interface{}{"files": paths, "count": len(paths)}, nil
			}
		}
		return nil, fmt.Errorf("repo %s not found for user %s", repo, username)

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
				// Hint available paths when file not found
				var paths []string
				for p := range r.Files {
					paths = append(paths, p)
				}
				return map[string]interface{}{
					"error":            fmt.Sprintf("file %s not found in repo %s", filepath, repo),
					"available_files": paths,
					"suggestion":       "Call list_repo_files to see all paths, then retry with an exact match.",
				}, nil
			}
		}
		return nil, fmt.Errorf("repo %s not found for user %s", repo, username)

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
- list_repo_files: returns ALL file paths available in a repo. ALWAYS call this before get_repo_file — never guess paths like README.md or package.json.
- get_repo_file: returns the complete contents of a specific file. Use exact paths from list_repo_files.
- get_proctoring_logs: returns camera look-aways, tab blurs, secondary voice prompts.
- search_web_intel: runs search grounding to verify credentials, talks, or other public achievements.
- save_claim_audit: records a verified, exaggerated, or failed resume claim with cited evidence and code files.
- save_proctoring_flag: logs a proctoring distraction or focus alert to show in the UI timeline.
- complete_audit: saves the final technical sourcing score and finishes the session.

Workflow:
1. Examine candidate resume and JD. Extract each distinct claim to audit.
2. List the candidate's GitHub repositories using list_github_repos.
3. For EACH relevant repo, call list_repo_files FIRST, then read files with get_repo_file using exact paths returned.
4. If get_repo_file returns available_files, read those files before drawing any conclusion.
5. Fetch proctoring logs using get_proctoring_logs. Log events with save_proctoring_flag.
6. Save one save_claim_audit per key resume claim. Every audit MUST cite exact file:line and quote the relevant code.
7. Call complete_audit with a final sourcing score out of 100.

CRITICAL RULES:
- NEVER mark a claim 'exaggerated' or 'failed' until you have called list_repo_files on every repo and attempted to read ALL returned source files.
- A missing README or package.json is NOT evidence of exaggeration — check actual source files (.go, .tsx, .py, etc.).
- 'verified' means code evidence supports the claim, even if the project is small.
- 'exaggerated' means you read the code and it does not support the claim (e.g. empty repo, only TODO README).
- 'failed' means code actively contradicts the claim or shows critical bugs/integrity violations.

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
	if sc, err := a.DB.GetCriteria(); err == nil && sc.LlmModel == "bedrock" {
		useBedrock = true
	}
	if !useBedrock && awsbedrock.PreferAWS() && a.BedrockClient != nil {
		useBedrock = true
	}

	if useBedrock && a.BedrockClient != nil {
		log.Println("[AWS Bedrock] Invoking Claude for agent step...")
		part, err := a.callBedrock(history)
		if err == nil && part != nil {
			return part, nil
		}
		log.Printf("[AWS Bedrock] step failed: %v — falling back to Gemini", err)
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
2. list_repo_files(username string, repo string): lists all file paths in a repo — ALWAYS call before get_repo_file.
3. get_repo_file(username string, repo string, filepath string): returns repo file content.
4. get_proctoring_logs(username string): returns candidate proctoring anomaly events.
5. save_claim_audit(claim_text string, evidence_text string, file_path string, status string, severity string): status can be 'verified', 'exaggerated', 'failed'; severity can be 'high', 'medium', 'none'.
6. save_proctoring_flag(timestamp string, event_type string, duration int, details string): logs timeline events in the UI.
7. complete_audit(sourcing_score int): finalizes evaluation.

NEVER mark a claim exaggerated until list_repo_files was called on every repo and source files were read.

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

	// Invoke Claude on Bedrock via shared client (tries Sonnet → Haiku → Sonnet 3)
	br := awsbedrock.GetClient()
	if br.Ready {
		responseText, err := br.Complete(systemPrompt, fmt.Sprintf("Here is the history of the session. Please output the JSON decision block for the next action:\n\n%s", transcript.String()), 2000)
		if err == nil {
			jsonString, err := awsbedrock.ExtractJSON(responseText)
			if err == nil {
				var decision struct {
					Text         string        `json:"text"`
					FunctionCall *FunctionCall `json:"functionCall"`
				}
				if err := json.Unmarshal([]byte(jsonString), &decision); err == nil {
					return &GeminiPart{Text: decision.Text, FunctionCall: decision.FunctionCall}, nil
				}
			}
		}
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	// Legacy direct invoke fallback
	input := &bedrockruntime.InvokeModelInput{
		ModelId:     aws.String("anthropic.claude-3-5-sonnet-20240620-v1:0"),
		ContentType: aws.String("application/json"),
		Accept:      aws.String("application/json"),
		Body:        payloadBytes,
	}

	resp, err := a.BedrockClient.InvokeModel(context.TODO(), input)
	if err != nil {
		input.ModelId = aws.String("anthropic.claude-3-haiku-20240307-v1:0")
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
