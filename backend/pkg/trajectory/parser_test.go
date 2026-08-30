package trajectory

import "testing"

func TestParseMarkdown_AlexRivera(t *testing.T) {
	md := "### `[TOOL_CALL]` at time\n\nAgent requested tool: **`list_github_repos`** with arguments:\n```json\n{\"username\":\"riveradevops\"}\n```\n\n---\n\n### `[TOOL_RESULT]` at time\n\nTool `list_github_repos` returned result:\n```json\n[{\"name\":\"terraform-templates\"}]\n```\n"
	steps := ParseMarkdown(md)
	if len(steps) < 2 {
		t.Fatalf("expected 2 steps, got %d", len(steps))
	}
	if steps[0].Type != "tool_call" || steps[0].Content != "list_github_repos" {
		t.Errorf("unexpected tool_call: %+v", steps[0])
	}
	if steps[1].Type != "tool_result" {
		t.Errorf("expected tool_result, got %s", steps[1].Type)
	}
}
