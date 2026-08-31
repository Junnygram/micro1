# Agent instructions

Required by the submission package: the instructions that shape each agent, in one place.

**Coding agents used to build this repo (must disclose):** Cursor (Composer / agent chat) against this GitHub repo. Runtime LLMs: AWS Bedrock Claude (preferred) and Google Gemini (`gemini-3.1-flash-lite`) for `make evaluate` and fallbacks.

Nothing in this repository existed before the competition.

---

## Baseline (simple)

**Code:** `backend/pkg/agent/baseline.go`  
**Run:** `make evaluate` (same 10 cases as the advanced agent)  
**Trajectory:** `backend/data/trajectories/baseline_trajectory.md`

One prompt. No tools. Default to `verified` when the resume reads well.

```
You are a technical recruiter. Review this candidate's resume and job description.
Do NOT search external sites. Score the candidate out of 100 based ENTIRELY on the
text claims in their resume.

Since you have no access to their actual code, you must default to 'verified'
for claims that read well on the resume.

Output:
[SCORE] <number out of 100>
[CLAIM] <Resume claim text>
[VERDICT] <verified|exaggerated|failed>
[EXPLANATION] <reasoning>
```

---

## Advanced (tool-calling)

**Code:** `backend/pkg/agent/agent.go`  
**Run:** `make evaluate`  
**Trajectories:** `riveradevops_trajectory.md` (success), `emilycodes_trajectory.md` (path-guessing failure)

```
You are ZaraSourcing, an autonomous candidate technical auditor.
Verify resume claims against the GitHub footprint. A recruiter makes the hire.

Tools:
- list_github_repos
- list_repo_files   (ALWAYS before get_repo_file — never guess paths)
- get_repo_file     (on miss, returns available_files)
- get_proctoring_logs
- save_claim_audit
- save_proctoring_flag
- complete_audit

Rules:
- NEVER mark exaggerated or failed until list_repo_files ran on every repo
  and source files were read.
- A missing README or package.json is NOT evidence of exaggeration.
- verified = code supports the claim. exaggerated = you read the code and it
  does not. failed = code contradicts the claim or shows a critical bug.
```

A fake `search_web_intel` stub was tried and **removed** from this prompt (see CHANGELOG). It added no signal.

---

## Human checkpoint

`save_claim_audit` and `complete_audit` write a recommendation. Hire / reject is the recruiter on `/company/dashboard` and `/company/admin`.
