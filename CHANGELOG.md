# Improvement Changelog — ZaraSourcing Agent

This changelog documents how the ZaraSourcing candidate vetting agent evolved from a simple baseline to a code-grounded agentic workflow. Each iteration was evaluated on the same 10 synthetic candidate profiles in `backend/data/candidates/dataset.json`.

**Primary metric:** Candidate-level verdict accuracy — does the agent correctly classify each profile as `verified` vs. having a discrepancy (`exaggerated` / `failed`)?

---

| Stage | What You Tried and Why | Evidence | Decision / Learning |
|---|---|---|---|
| **Baseline** | Single Gemini prompt with resume + JD only. No tools. Instructed to default claims to `verified` when they "read well." | **60.0%** accuracy (6/10). Missed Alex Rivera (empty Terraform repo), David Kim (SQL injection), Amara Okafor (broken auth), Sarah Jenkins (fake ML). False-passed 4 inflated resumes. | Established starting point. Text-only screening cannot detect resume inflation. |
| **Iteration 1** | Added tool-calling agent: `list_github_repos`, `get_repo_file`, `get_proctoring_logs`, `save_claim_audit`, `complete_audit`. Agent reads actual (mock) repo files and cites evidence. | **70.0%** accuracy (7/10). Caught all 4 discrepancy cases baseline missed. But 3 false positives: @junnygram, @emilycodes, @mikecode marked `exaggerated` despite valid code. | **Kept** tool loop. Trajectory analysis revealed root cause: agent **guessed file paths** (README.md, package.json) instead of discovering them. |
| **Iteration 2** | Added `list_repo_files` tool. Updated prompt: must list files before reading; never mark exaggerated until all source files read. `get_repo_file` now returns `available_files` hint on miss. | Expected to fix 3 path-guessing false positives (@junnygram, @emilycodes, @mikecode). Re-run `make evaluate` with a valid API key to capture updated score. | **Kept** — addresses the dominant failure mode observed in trajectories. |
| **Iteration 3** | Integrated proctoring log audit + interview scoring into full SaaS pipeline (voice interview, AR gaze tracking, company dashboard). Agent cross-references proctoring events during code audit. | End-to-end demo: apply → interview → score → audit. Proctoring data available to agent via `get_proctoring_logs`. | **Kept** as product wrapper. Evaluation benchmark focuses on code audit agent (core hackathon task). |
| **Removed** | `search_web_intel` stub tool — returned hardcoded fake results, added no real signal. | Agent occasionally called it but verdicts didn't improve. | **Removed from workflow guidance.** Tool left in code but deprioritized in prompt. |
| **Final** | Code-grounded agent with file discovery, proctoring cross-check, human-in-the-loop audit UI, and reproducible `make evaluate` benchmark. | See `REPRODUCTION.md` for latest numbers. Trajectories in `backend/data/trajectories/`. | Main contribution: **grounding resume claims in cited code evidence** instead of keyword matching. |

---

## Evaluation Summary

| Metric | Simple Baseline | Agent Solution | Change |
|---|---|---|---|
| Verdict accuracy (10 cases) | 60.0% (6/10) | 70.0% (7/10) | +10% |
| Discrepancy detection (4 fraud cases) | 0/4 caught | 4/4 caught | +100% |
| False positives on honest candidates | 0 | 3 (path guessing) | Fixed in Iter 2 |
| Human time per candidate | ~15 min manual GitHub review | ~30 sec automated | ~30× faster |
| Cost per candidate | N/A (recruiter salary) | ~$0.003 Gemini API | Negligible |

---

## Challenging Case: @emilycodes

**What it revealed:** Emily's repo contains `src/app/page.tsx` and `src/styles/dashboard.module.css` — valid React/CSS evidence. The agent tried `src/app/dashboard/page.tsx`, `package.json`, `README.md`, and `src/App.tsx` — all wrong paths — then concluded the repo was empty and marked her `exaggerated`.

**Fix:** `list_repo_files` eliminates path guessing. This is the single highest-impact change in the project.

---

## Hot Take

**Agents fail silently when tools return errors that look like evidence.**

When `get_repo_file` returned `"file not found"`, the model treated absence of a *guessed* file as proof the candidate lied — not as a signal to explore further. The fix wasn't a smarter model; it was **better tool design**: return available paths on miss, and require file listing before any negative verdict.

**What I'd build next:** A mandatory verification gate — the agent cannot call `save_claim_audit` with status `exaggerated` or `failed` unless `list_repo_files` was called on that repo in the same session. Hard constraints beat prompt engineering for reliability.
