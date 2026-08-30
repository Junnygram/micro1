package awsbedrock

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
)

var (
	defaultClient *Client
	initOnce      sync.Once
)

// Client wraps AWS Bedrock Runtime for Claude invocations.
type Client struct {
	Runtime *bedrockruntime.Client
	Ready   bool
}

// Model IDs tried in order (newer Sonnet first, then Haiku for speed/cost).
var modelIDs = []string{
	"anthropic.claude-3-5-sonnet-20240620-v1:0",
	"anthropic.claude-3-haiku-20240307-v1:0",
	"anthropic.claude-3-sonnet-20240229-v1:0",
}

func GetClient() *Client {
	initOnce.Do(func() {
		defaultClient = NewClient()
	})
	return defaultClient
}

func NewClient() *Client {
	ctx := context.TODO()
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(getRegion()))
	if err != nil {
		log.Printf("[AWS Bedrock] config load failed: %v", err)
		return &Client{Ready: false}
	}
	log.Println("[AWS Bedrock] Runtime client ready")
	return &Client{
		Runtime: bedrockruntime.NewFromConfig(cfg),
		Ready:   true,
	}
}

func getRegion() string {
	if r := os.Getenv("AWS_REGION"); r != "" {
		return r
	}
	if r := os.Getenv("AWS_S3_REGION"); r != "" {
		return r
	}
	return "us-east-1"
}

// PreferAWS returns true when Bedrock should be used before Gemini.
func PreferAWS() bool {
	if os.Getenv("LLM_PROVIDER") == "gemini" {
		return false
	}
	if os.Getenv("LLM_PROVIDER") == "bedrock" {
		return true
	}
	// Default: use AWS when credentials exist
	return os.Getenv("AWS_ACCESS_KEY_ID") != "" || os.Getenv("AWS_PROFILE") != ""
}

// Complete sends a system + user prompt and returns Claude's text response.
func (c *Client) Complete(systemPrompt, userPrompt string, maxTokens int) (string, error) {
	if c == nil || !c.Ready || c.Runtime == nil {
		return "", fmt.Errorf("bedrock client not ready")
	}
	if maxTokens <= 0 {
		maxTokens = 2000
	}

	payload := map[string]interface{}{
		"anthropic_version": "bedrock-2023-05-31",
		"max_tokens":        maxTokens,
		"system":            systemPrompt,
		"messages": []map[string]interface{}{
			{"role": "user", "content": userPrompt},
		},
		"temperature": 0.1,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	var lastErr error
	for _, modelID := range modelIDs {
		input := &bedrockruntime.InvokeModelInput{
			ModelId:     aws.String(modelID),
			ContentType: aws.String("application/json"),
			Accept:      aws.String("application/json"),
			Body:        payloadBytes,
		}
		resp, err := c.Runtime.InvokeModel(context.TODO(), input)
		if err != nil {
			lastErr = err
			log.Printf("[AWS Bedrock] model %s failed: %v", modelID, err)
			continue
		}
		text, err := extractText(resp.Body)
		if err != nil {
			lastErr = err
			continue
		}
		log.Printf("[AWS Bedrock] success via %s", modelID)
		return text, nil
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("all bedrock models failed")
}

func extractText(body []byte) (string, error) {
	var responseMap map[string]interface{}
	if err := json.Unmarshal(body, &responseMap); err != nil {
		return "", err
	}
	contentList, ok := responseMap["content"].([]interface{})
	if !ok || len(contentList) == 0 {
		return "", fmt.Errorf("empty bedrock response")
	}
	contentMap, ok := contentList[0].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid bedrock content")
	}
	text, ok := contentMap["text"].(string)
	if !ok {
		return "", fmt.Errorf("missing text in bedrock response")
	}
	return text, nil
}

// ExtractJSON pulls the first JSON object from a model response.
func ExtractJSON(responseText string) (string, error) {
	start := strings.Index(responseText, "{")
	end := strings.LastIndex(responseText, "}")
	if start == -1 || end == -1 || end < start {
		return "", fmt.Errorf("no JSON object in response")
	}
	return responseText[start : end+1], nil
}

// Ping verifies Bedrock is callable (lightweight haiku call).
func (c *Client) Ping() error {
	_, err := c.Complete("Reply with OK only.", "ping", 16)
	return err
}
