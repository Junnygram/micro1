# Submission — micro1 Agentic Workflows Hackathon

**Project:** ZaraSourcing  
**Live:** https://micro1-production.up.railway.app/demo  
**Login:** `demo@zarasourcing.com` / `demo123`  
**Repo:** https://github.com/Junnygram/micro1

This is the official Example 2: *Candidate evaluation — should we hire this person?*

---

## The four questions

**01 Who has this problem?**  
Recruiters and hiring managers who must decide if a technical candidate is real.

**02 What bottleneck makes it worth solving?**  
Evidence is split across the JD, the CV, GitHub, and the interview. A keyword ATS rewards a polished lie. Checking GitHub by hand takes about 15 minutes and is inconsistently done. A warning sign is not proof.

**03 Does the agent solve it well?**  
It pulls the same 10 synthetic cases the baseline sees, opens repo files, and cites them. Baseline: 60% accuracy, 1/5 frauds. Agent: 70%, 5/5 frauds, 3 false positives on honest engineers. The recommendation and the uncertainty stay visible. A person still hires or rejects.

**04 Can another person reproduce the result?**  
`make verify-benchmark` (no key). `make evaluate` (Gemini key). Cases in `backend/data/candidates/dataset.json`. Seeded live path at `/demo` without a live audit re-run.

---

## Four deliverables

| # | Required | Where |
|---|---|---|
| 01 | Code + improvement changelog | this repo + [CHANGELOG.md](./CHANGELOG.md) |
| 02 | Reproduction guide | [REPRODUCTION.md](./REPRODUCTION.md) |
| 03 | Solution video (≤ 5 min) | script below — record on the **Railway URL**, not localhost |
| 04 | Agent trajectories | [backend/data/trajectories/](./backend/data/trajectories/) — start with `baseline_trajectory.md`, `riveradevops_trajectory.md`, `emilycodes_trajectory.md` |

What existed before this competition: nothing in this repo. The product, agents, cases, and benchmark were built for this hackathon.

**Coding-agent disclosure (required):** the repo was built in **Cursor**. Runtime evaluation uses **Gemini** (`make evaluate`) and **AWS Bedrock Claude** when keys are set. Instructions: [AGENTS.md](./AGENTS.md).

### Qualification gate (official FAQ)

| Check | Status |
|---|---|
| Timely | Deadline **31 Aug 2026 18:00 UTC** — submit on HackerEarth before that |
| Repository | https://github.com/Junnygram/micro1 |
| README + changelog | README four questions + [CHANGELOG.md](./CHANGELOG.md) |
| Reproduction + tests | [REPRODUCTION.md](./REPRODUCTION.md) · `make verify-benchmark` · `make test-proctor` |
| Baseline + advanced | `baseline.go` vs `agent.go` · same 10 cases |
| Agent-use evidence | [AGENTS.md](./AGENTS.md) · `backend/data/trajectories/` |
| Demo | https://micro1-production.up.railway.app/demo |
| Video (you still record this) | ≤ 5 min · script below · Railway URL, not localhost |
| Secrets out | no `.env` in git · synthetic `dataset.json` |
| Human reviewer | recruiter decides the hire |

---

## Scorecard (self-check, 100 pts)

| Criterion | Pts | Where a judge should look |
|---|---|---|
| Problem & user value | 15 | README four questions; `/demo` step 1 |
| Agent solution & engineering | 30 | Tools in `backend/pkg/agent/agent.go`; Iter 1–2 in CHANGELOG |
| End-to-end quality | 20 | `/demo` → dashboard → Alex file → interview; recruiter decides |
| Measured improvement | 15 | CHANGELOG table; `/benchmark`; `benchmark_results.json` |
| Reproducibility | 15 | REPRODUCTION.md; `make verify-benchmark`; `make evaluate` |
| Hot take | 5 | CHANGELOG “Hot take”: tool errors that look like evidence |

---

## Video script (≤ 5 minutes)

Official order: problem → baseline → one realistic run → comparison → changelog → biggest keep → one removal.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:40 | `/` or `/demo` | “Recruiters have to decide if resume claims are real. ATS scores keywords. Checking GitHub by hand takes fifteen minutes. That is the bottleneck.” |
| 0:40–1:10 | `/benchmark` | “Baseline: one prompt, resume only, no tools. 60 percent. It clears four inflated resumes because they read well. That is today’s first pass.” |
| 1:10–2:40 | `/report/riveradevops` then dashboard → **Alex Rivera** (view seeded audit — do not re-run) | “Same case, agent. Alex claims Docker and Helm. The agent listed repos, opened `terraform-templates`, found only an empty README, marked exaggerated, 45 percent. Baseline said verified. The recruiter still decides.” |
| 2:40–3:20 | `/benchmark` table | “Ten cases, both arms. Agent 70 percent, fraud 5 of 5 versus 1 of 5. It also over-flagged three honest engineers. That trade is in the changelog.” |
| 3:20–4:10 | CHANGELOG on GitHub | “Iteration 1 added tools and caught the frauds. The failure: the agent guessed file paths, treated ‘not found’ as proof. Iteration 2 added `list_repo_files`. We removed a fake web-intel tool that never helped.” |
| 4:10–4:40 | `/demo` → Voice + AR **or** stop at reproduce | Optional 20s: Chrome, allow camera, first question is tell-me-about-yourself. Then: “Reproduce with `make verify-benchmark` or `make evaluate`. Trajectories are in the repo.” |
| 4:40–5:00 | GitHub REPRODUCTION.md | “A second person can run the same 10 cases from a clean clone.” |

**Do not say:** 2-question demo, 70% interview score, “the AI hires people.”  
**Do say:** the agent recommends; a person signs the hire.

---

## Ground rules (how we meet them)

| Rule | How |
|---|---|
| 02 What existed vs added | Entire stack is new for this hackathon |
| 04 Consequential actions | Hire is never automatic |
| 05 Qualified human | Recruiter dashboard / Admin |
| 07 Data | Synthetic candidates in `dataset.json` |
| 08 Secrets | `.env` is not in the submission; use `.env.example` |
| 09 Claims → evidence | Numbers only from `benchmark_results.json` |
| 10 Access | Live `/demo` + this repo |
