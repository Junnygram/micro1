# Improvement Changelog — ZaraSourcing

Official hackathon structure. Same 10 cases, same labels, same primary metric throughout.

**User:** a recruiter deciding whether a technical candidate’s resume claims are real.  
**Primary metric:** verdict accuracy — `verified` target must get `verified`; `exaggerated` / `failed` must get any non-`verified` verdict (`verdictMatchesTarget` in `backend/pkg/benchmark/compute.go`).  
**Cases:** `backend/data/candidates/dataset.json` (10 synthetic profiles).  
**Source of published numbers:** `backend/data/benchmark_results.json`.

---

| Stage | What you tried and why | Evidence | Decision / learning |
|---|---|---|---|
| **Baseline** | One Gemini prompt. Resume + job description only. No tools. Default to `verified` when the resume “reads well.” This is the keyword-ATS / first-pass recruiter. | **60.0%** (6/10). Fraud caught **1/5**. Cleared Alex (empty Terraform repo), David (SQL injection), Amara (broken auth), Sarah (fake ML). Zero false positives on honest engineers. | Starting point. Text-only screening cannot detect resume inflation. A well-written lie looks like a good resume. |
| **Iteration 1** | Tool-calling agent: `list_github_repos`, `get_repo_file`, `get_proctoring_logs`, `save_claim_audit`, `complete_audit`. Agent must cite a file it read. | **70.0%** (7/10). Fraud caught **5/5**. Three honest candidates flagged (`@junnygram`, `@emilycodes`, `@mikecode`). Trajectories showed the agent **guessed** `README.md` / `package.json` / `src/App.tsx`, got “file not found,” and treated that as proof the candidate lied. | **Kept** the tool loop. The +4 fraud catches are the product. The 3 false positives are the failure mode. |
| **Iteration 2** | Added `list_repo_files`. Prompt: list files before reading; do not mark `exaggerated` until source files are read. `get_repo_file` returns `available_files` on a miss. | Shipped in `backend/pkg/agent/agent.go`. The **published** `make evaluate` file is still the Iteration 1 run (3 over-flags remain). Re-run `make evaluate` with a live key to measure Iter 2. | **Kept.** Highest-leverage change: tool design, not a smarter model. Published score stays honest — we do not claim 100% after a tool we have not re-measured. |
| **Iteration 3** | Wrapped the agent in a hiring desk: voice interview, Rekognition proctoring, human-in-the-loop dashboard. Agent can read proctoring events. Recruiter, not the agent, makes the hire (ground rule 05). | Product path: `/demo` → login → Alex Rivera audit → interview. Not scored in the 10-case table. | **Kept** as the end-to-end artifact. The scored workflow is still the claim audit. |
| **Removed** | `search_web_intel` — stub that returned hardcoded “intel.” | Agent called it; verdicts did not change. | **Removed** from the workflow prompt. Fake tools teach the model to trust empty evidence. |
| **Final** | Code-grounded agent + file discovery + recruiter approval + frozen benchmark file. | Baseline 60% / 1/5 fraud. Agent 70% / 5/5 fraud. 3 false positives disclosed. | Main contribution: **ground claims in files the agent opened.** The trade is more fraud caught, some honest engineers over-flagged. |

---

## Evaluation (same cases, both arms)

| Metric | Simple baseline | Agent solution | Change |
|---|---|---|---|
| Primary: verdict accuracy | 60.0% (6/10) | 70.0% (7/10) | +10 pp |
| Fraud / discrepancy caught | 1/5 | 5/5 | +4 cases |
| False positives (honest candidates) | 0 | 3 | cost of the agent |
| Human time per candidate (GitHub review) | ~15 min | ~30 s + recruiter skim | ~30× |
| Cost per candidate | recruiter time | ~$0.003 API | negligible |

Ten cases is a small set. The fraud row is the result that matters; the +10% headline is a one-case difference.

---

## Challenging case: @emilycodes

Emily’s repo has `src/app/page.tsx` and `src/styles/dashboard.module.css`. The Iteration 1 agent requested `src/app/dashboard/page.tsx`, `package.json`, `README.md`, then marked her `exaggerated`. Target: `verified`.

**What it revealed:** a tool error that looks like evidence (`file not found`) is more dangerous than no tool.  
**What we did:** `list_repo_files` + `available_files` on miss.  
**See:** `backend/data/trajectories/emilycodes_trajectory.md`

---

## Hot take

**Agents fail silently when tools return errors that look like evidence.**

`get_repo_file` → “file not found” was treated as “the candidate has no code,” not “you guessed the path.” The fix was not a better prompt. It was returning the real file list on miss, and requiring a list before a negative verdict.

**What I would build next:** a hard gate — `save_claim_audit(status=exaggerated|failed)` is rejected unless `list_repo_files` ran on that repo in the same session.
