# ZaraSourcing — Video Walkthrough & Demo Script

> **One document.** Follow this bit by bit while recording.  
> **Record app on:** https://micro1-production.up.railway.app  
> **Record benchmark on:** terminal (`make evaluate`)  
> **Runtime:** ~5 minutes

---

## Before you record

Open tabs:

1. https://micro1-production.up.railway.app/
2. https://micro1-production.up.railway.app/benchmark
3. https://micro1-production.up.railway.app/report/riveradevops
4. https://micro1-production.up.railway.app/company/login (`demo@zarasourcing.com` / `demo123`)
5. Terminal in project folder

- [ ] Dashboard has 10 applicants, Alex **45%**
- [ ] `make verify-benchmark` passes (optional: `make evaluate` already run)

---

## Step 1 — Intro: Zara and the problem (0:00 · 45 sec)

**Screen:** Landing page `/`

**Say:**

> "Good [morning/afternoon]. I want to talk about **Zara** — micro1's AI interview agent. Zara runs voice interviews, asks technical questions, and scores candidates automatically. That part works well.
>
> But here's the gap: **Zara fails to verify whether a resume is actually true.** A candidate can claim DevOps expertise, Kubernetes, Terraform — Zara interviews them, they sound confident — and an ATS still gives them a high score because it only matches keywords. Nobody checked their **GitHub code**.
>
> Recruiters still spend fifteen minutes per candidate manually browsing repos — or they hire the wrong person. **That problem is what led to ZaraSourcing.**"

- [ ] Pause briefly, then continue to Step 2

---

## Step 2 — What ZaraSourcing does (0:45 · 60 sec)

**Screen:** Still on landing, or scroll features / `/demo`

**Say:**

> "**ZaraSourcing** wraps the full hiring pipeline around evidence — not guesswork.
>
> Here's the flow:
>
> 1. A **company creates a job** and sets AI interview questions on the dashboard.
> 2. **Candidates apply** with resume and GitHub — resumes go to **S3** (or local storage in dev).
> 3. Our **audit agent** — powered by **AWS Bedrock** and Gemini — reads their mock GitHub repos, lists files, reads code, and **cites evidence** for every resume claim.
> 4. The candidate gets a private link and is **interviewed by Zara** — AI voice via Polly/Bedrock, with **AR proctoring**: gaze tracking, tab-switch detection, multi-face and phone alerts via MediaPipe.
> 5. The **recruiter sees a ranked dashboard** — audit score, interview score, shortlist. The agent **recommends**; the **recruiter decides**.
>
> Because of time, I won't run a full live Zara interview in this video. I'll do a **short UI walkthrough**, then show the **benchmark** that proves the audit agent works."

- [ ] Click → **Company login** or go straight to quick UI tour (Step 3)

---

## Step 3 — Short UI review (1:45 · 90 sec)

### 3a. Dashboard (30 sec)

**Screen:** `/company/login` → dashboard

- [ ] Login: `demo@zarasourcing.com` / `demo123`

**Say:**

> "This is the company dashboard. Jobs, applicants, composite scores, shortlist. Ten seeded candidates — each with a completed GitHub audit."

- [ ] Point at **Alex Rivera** — **45%**, fraud signals
- [ ] Optional one line: Recruiter AI — *"Why is Alex ranked below Emily?"*

### 3b. Fraud report (30 sec)

**Screen:** `/report/riveradevops`

**Say:**

> "Public fraud report — no login. Alex claimed DevOps and cloud automation. The agent found empty repos — no Dockerfiles, no Helm. **Exaggerated**, with cited evidence. A text-only check would have passed him."

- [ ] Scroll claim + evidence panel

### 3c. Audit workspace (30 sec)

**Screen:** Dashboard → click Alex → `/candidate/{id}`

**Say:**

> "Every claim has evidence and a replay of the agent path — which repos and files it checked. Not a black-box score."

- [ ] Show claims list + **Replay saved audit** (10 sec)
- [ ] **Do NOT** click "Run GitHub Audit" on demo candidates

**Skip if short on time:** `/apply/devops_job` demo CV grid

---

## Step 4 — What benchmarking means (3:15 · 90 sec)

**Screen:** `/benchmark`

**Say:**

> "Now — **benchmarking**. This is how we prove the agent actually works, fairly.
>
> We built **ten synthetic candidates** in `dataset.json` — each with a resume, mock GitHub repos, and a **ground-truth verdict**: verified, exaggerated, or failed.
>
> We compare two approaches on the **same ten cases**:
>
> - **Baseline** — one LLM prompt, resume and job description only, **no tools**. Like a smart ATS. Result: **sixty percent** accuracy. It catches **one of five** discrepancy cases.
> - **Agent** — same LLM, plus GitHub tools: list repos, list files, read code. Result: **seventy percent**. It catches **all five** discrepancy cases — including Alex, who the baseline missed.
>
> These numbers live in `benchmark_results.json`, written by `make evaluate`. This page reads that file — judges can reproduce it locally."

- [ ] Point at stats: **60%** baseline, **70%** agent, fraud **1/5 → 5/5**
- [ ] Point at **Alex row**: baseline `verified`, agent `exaggerated` ✅

---

## Step 5 — `make evaluate` (4:45 · 45 sec)

**Screen:** Terminal

**Say:**

> "`make evaluate` automates that benchmark. It resets the database, runs baseline on all ten candidates, resets again, runs the agent, compares to ground truth, saves `benchmark_results.json`, and exports **agent trajectories** — step-by-step logs of every tool call.
>
> Same task, same cases, exported evidence. Anyone with a Gemini API key can re-run from a clean clone."

- [ ] Show terminal:
  ```bash
  make evaluate
  ```
  (Start it — cut to results if already run)

- [ ] Show result: terminal table OR `benchmark_results.json` OR `/benchmark` with same numbers

**If asked why not 100%:**

> "Three honest candidates got false positives in Iteration 1 — the agent guessed file paths. We fixed that with `list_repo_files` in Iteration 2. See CHANGELOG and the @emilycodes trajectory."

---

## Step 6 — Close (5:30 · 15 sec)

**Screen:** `/benchmark` or GitHub

**Say:**

> "Zara handles the interview. **ZaraSourcing** grounds hiring in code evidence — deployable SaaS, AR proctoring, reproducible benchmark. Demo, repo, and trajectories are in the submission. Thank you."

- [ ] Stop recording

---

## Timing cheat sheet

| Time | Section | Screen |
|------|---------|--------|
| 0:00 | Zara + problem | `/` |
| 0:45 | What ZaraSourcing does | landing / `/demo` |
| 1:45 | Short UI review | dashboard → report → Alex audit |
| 3:15 | Benchmark explained | `/benchmark` |
| 4:45 | `make evaluate` | terminal |
| 5:30 | Close | `/benchmark` or GitHub |

**Running long?** Skip audit replay. **Running short?** Add apply demo CV grid (10 sec).

---

## Architecture (reference if you forget)

```
Company → creates job + interview questions
     ↓
Candidate → applies (resume → S3, GitHub username)
     ↓
Audit agent → Bedrock/Gemini + GitHub tools → cited claims
     ↓
Zara interview → voice AI + AR proctoring (MediaPipe)
     ↓
Recruiter dashboard → scores, shortlist, human decision
     ↓
Benchmark → make evaluate (baseline vs agent, 10 cases)
```

---

## Links & credentials

| | |
|---|---|
| Live demo | https://micro1-production.up.railway.app/demo |
| Benchmark | https://micro1-production.up.railway.app/benchmark |
| Fraud report | https://micro1-production.up.railway.app/report/riveradevops |
| Login | `demo@zarasourcing.com` / `demo123` |
| GitHub | https://github.com/Junnygram/micro1 |
| Reproduce | `make evaluate` · verify with `make verify-benchmark` |

---

## Backup lines

| Issue | Say |
|-------|-----|
| Dashboard empty | "Seeded on deploy — fraud report still proves the agent" |
| No full Zara interview in video | "Interview flow is on `/apply` — AR proctoring runs in Chrome with mic/camera" |
| Benchmark mismatch | "Run `make evaluate` — same JSON file this page reads" |

---

## After recording

- [ ] Upload Loom to HackerEarth
- [ ] Submit demo URL + GitHub + link to `CHANGELOG.md`, `REPRODUCTION.md`, trajectories

See also: [PRE_SUBMIT.md](./PRE_SUBMIT.md)
