package trajectory

import (
	"regexp"
	"strings"
)

// ReplayStep is a normalized agent step for frontend animation.
type ReplayStep struct {
	Type     string `json:"type"`
	Content  string `json:"content"`
	Metadata string `json:"metadata,omitempty"`
}

var sectionRe = regexp.MustCompile(`(?s)### ` + "`" + `\[(SYSTEM|USER_FEEDBACK|THOUGHT|TOOL_CALL|TOOL_RESULT)\]` + "`" + `[^\n]*\n\n`)

func ParseMarkdown(md string) []ReplayStep {
	parts := sectionRe.Split(md, -1)
	matches := sectionRe.FindAllStringSubmatch(md, -1)
	if len(matches) == 0 {
		return nil
	}

	var steps []ReplayStep
	for i, m := range matches {
		if i+1 >= len(parts) {
			break
		}
		rawType := strings.ToLower(m[1])
		body := strings.TrimSpace(parts[i+1])
		// Trim trailing --- separators
		if idx := strings.Index(body, "\n\n---"); idx >= 0 {
			body = strings.TrimSpace(body[:idx])
		}

		stepType := rawType
		if rawType == "user_feedback" {
			stepType = "user_feedback"
		}

		content := body
		metadata := ""

		if rawType == "tool_call" {
			if name := extractToolName(body); name != "" {
				content = name
			}
			if args := extractJSONBlock(body); args != "" {
				metadata = args
			}
		} else if rawType == "tool_result" {
			if name := extractBacktickName(body); name != "" {
				content = name
			}
			if res := extractJSONBlock(body); res != "" {
				metadata = res
			}
		} else if rawType == "thought" {
			content = strings.TrimPrefix(body, "> ")
			content = strings.TrimSpace(content)
		}

		steps = append(steps, ReplayStep{
			Type:     stepType,
			Content:  content,
			Metadata: metadata,
		})
	}
	return steps
}

func extractToolName(body string) string {
	re := regexp.MustCompile("Agent requested tool: \\*\\*`([^`]+)`\\*\\*")
	if m := re.FindStringSubmatch(body); len(m) > 1 {
		return m[1]
	}
	return ""
}

func extractBacktickName(body string) string {
	re := regexp.MustCompile("Tool `([^`]+)` returned")
	if m := re.FindStringSubmatch(body); len(m) > 1 {
		return m[1]
	}
	return ""
}

func extractJSONBlock(body string) string {
	start := strings.Index(body, "```json")
	if start == -1 {
		start = strings.Index(body, "```")
		if start == -1 {
			return ""
		}
	}
	start = strings.Index(body[start:], "\n")
	if start == -1 {
		return ""
	}
	rest := body[start+1:]
	end := strings.Index(rest, "```")
	if end == -1 {
		return strings.TrimSpace(rest)
	}
	return strings.TrimSpace(rest[:end])
}
