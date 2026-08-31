# ZaraSourcing — Evidence-Based Technical Hiring

> **Built for the micro1 Frontier Engineering Challenge 2026** · individual entry · Go + Next.js  
> **Coding agent used to build this:** Cursor. **Runtime agents:** Bedrock Claude + Gemini (see [AGENTS.md](./AGENTS.md)).

**Live demo:** https://micro1-production.up.railway.app/demo
**Judge login:** `demo@zarasourcing.com` / `demo123`

ZaraSourcing screens engineers on **evidence instead of keywords**. It reads a candidate's resume claims, then goes and reads their actual GitHub code to check whether those claims hold up. Candidates then sit a hands-free AI voice interview that is proctored server-side by Amazon Rekognition. The recruiter gets a ranked leaderboard where every verdict is backed by named evidence — the repo file the agent read, or an explicit note that the claimed work is absent from the account.

This maps to the hackathon’s **candidate evaluation** example: *should we hire this person?*

| Official question | This project |
|---|---|
| **01 Who has this problem?** | Recruiters and hiring managers screening technical applicants. |
| **02 What bottleneck makes it worth solving?** | Resume claims, GitHub, interviews, and proctoring sit in different places. A keyword ATS scores a well-written lie 100/100. Manual GitHub review takes ~15 minutes and is easy to skip. |
| **03 Does the agent solve it well?** | A tool-calling agent reads repo files, cites them, and flags contradictions. A text-only baseline on the **same 10 cases** gets 60% verdict accuracy and catches **1/5** frauds. The agent gets 70% and catches **5/5**. It over-flags 3 honest engineers — that cost is in the table, not hidden. A qualified recruiter still makes the hire. |
| **04 Can another person reproduce the result?** | Yes. `make verify-benchmark` (no key). `make evaluate` (Gemini key, ~2–5 min). Same cases in `backend/data/candidates/dataset.json`. Live walkthrough: `/demo`. |

**Judge packet:** [AGENTS.md](./AGENTS.md) (instructions + tool disclosure) · [CHANGELOG.md](./CHANGELOG.md) · [REPRODUCTION.md](./REPRODUCTION.md) · [SUBMISSION.md](./SUBMISSION.md) · [backend/data/trajectories/](./backend/data/trajectories/)

**Baseline vs advanced (required):** same 10 cases in `backend/data/candidates/dataset.json`. Baseline = one prompt, no tools. Advanced = tool loop. Compare with `make evaluate` or the frozen file `backend/data/benchmark_results.json` via `make verify-benchmark` (no API key). **Tests:** `make verify-benchmark` · `make test-proctor` · `go test ./pkg/benchmark/...`.

---

## The problem

Resume inflation is easy and checking it is expensive. A candidate writes *"Expert in Go concurrency, built custom SQLite WAL wrappers, core open-source contributor."* A keyword ATS scores that 100/100, because every keyword is present. A recruiter then spends an hour on GitHub to discover the repo is a tutorial fork with three commits.

ZaraSourcing closes that gap in three ways:

| | What it does | Why it is trustworthy |
|---|---|---|
| **Claim audit** | Tool-calling agent reads the candidate's real repo files and grades each resume claim | Every verdict cites the file it read |
| **Voice interview** | AI asks role-specific questions, candidate speaks, answers scored by Bedrock Claude | Full transcript + per-answer reasoning stored |
| **Proctoring** | Webcam frames analysed by Amazon Rekognition server-side | Verdict carries the AWS label + confidence |

---

## What is actually built

### 1. GitHub claim audit (the agent)

Two agents run over the same candidate so the difference is measurable:

- **Baseline** — a single text-only LLM call. Sees the resume, never sees the code.
- **ZaraSourcing agent** — a tool-calling loop with real GitHub access: `list_github_repos`, `list_repo_files`, `get_repo_file`, plus proctoring history.

The agent returns a verdict per claim (`verified` / `exaggerated` / `failed`), a composite score, and a citation for each verdict. Reasoning traces are written to `backend/data/trajectories/` so a judge can read exactly which files the agent opened and why it changed its mind.

### 2. Hands-free AI voice interview

- Questions are set per job by the recruiter, spoken with **AWS Polly** neural TTS (browser `SpeechSynthesis` fallback).
- The candidate just talks. The **Web Speech API** transcribes live.
- After a long pause the interviewer repeats the question and keeps listening. It does **not** skip ahead. The candidate says they are done, or presses **Next**.
- **AWS Bedrock Claude** scores the full transcript (Gemini fallback). Scores are visible to the hiring team on Admin, not on the candidate’s complete screen.

### 3. Proctoring decided by Amazon Rekognition

This is deliberately **not** a browser heuristic. The browser's only job is to capture a JPEG frame and POST it. The backend calls Rekognition and decides.

```
Browser  ──capture 480px JPEG──▶  POST /api/proctoring/analyze
                                        │
                                        ▼
                              Go backend (pkg/proctor)
                              ├─ Rekognition DetectLabels (MaxLabels 30, MinConfidence 60)
                              ├─ Rekognition DetectFaces  (Attributes: ALL → pose, eyes)
                              ├─ derives verdict
                              └─ writes finding to proctoring_events
                                        │
                                        ▼
                         Recruiter → candidate page → integrity timeline
```

| Verdict | Trigger |
|---|---|
| `ok` | one face, head pose within limits, nothing flagged |
| `device_detected` | phone / tablet / book / paper label above 60% (not the candidate’s own laptop) |
| `multiple_faces` | more than one face above 90% confidence |
| `no_face` | zero faces above 90% confidence |
| `gaze_away` | \|yaw\| > 42° or \|pitch\| > 38° |

Every flag stored on the candidate carries the Rekognition label and its confidence, so a recruiter can see *why* a session was flagged rather than trusting a boolean. MediaPipe still runs in the browser, but only to draw the live face mesh — it does not decide anything.

Full detail and verification steps: **[PROCTORING.md](./PROCTORING.md)**.

---

## Benchmark — and how to check it yourself

The agent was evaluated against 10 candidate profiles with hand-labelled ground truth verdicts. Both arms see the same 10 profiles and the same roles.

| Metric | Baseline (text-only) | ZaraSourcing agent |
|---|---|---|
| Accuracy | **60.0%** (6/10) | **70.0%** (7/10) |
| Resume fraud caught | **1 / 5** | **5 / 5** |

**What "correct" means here.** The task is a binary decision: *should a human look at this candidate more closely?* A case counts as correct when a `verified` target gets a `verified` verdict, or a non-`verified` target (`exaggerated` or `failed`) gets any non-`verified` verdict. Distinguishing `exaggerated` from `failed` is not scored, because both lead to the same recruiter action. The rule is one function, `verdictMatchesTarget` in `backend/pkg/benchmark/compute.go`, and the tests assert the published percentages against it.

**The honest reading of these numbers.** 70% versus 60% is a 1-case difference and on its own it would be noise. The fraud row is the real result, and the table below shows the actual trade the agent makes:

- The **baseline never falsely flags a good candidate** — it clears all 5 genuine engineers. But it also clears 4 of the 5 fraudulent ones, because an inflated resume is still a well-written resume. It catches fraud 1 time in 5.
- The **agent catches all 5 frauds** by reading the code, but it over-flags **3 genuine candidates** (`@junnygram`, `@emilycodes`, `@mikecode`) as `exaggerated`.

So the agent buys +4 fraud detections for 3 false positives. For screening that is a favourable trade — a false flag costs a recruiter one manual review, a missed fraud costs an onsite loop — but it is a real cost and the over-flagging is the clearest thing to improve next. Ten profiles is a small set; treat this as directional evidence, not a precise measurement.

`backend/data/benchmark_results.json` is the single source of truth. The `/benchmark` page, the README block below, and the API all read from that one file — nothing is hardcoded in the UI.

```bash
make verify-benchmark   # no API key needed — checks the file is internally consistent
make evaluate           # re-runs both agents from scratch (Gemini key, ~2–5 min)
```

`make verify-benchmark` recomputes both percentages and the fraud counts from the per-case rows and fails if they disagree with the published headline, so an edited file will not pass.

<!-- BENCHMARK_START -->
### Vetting Benchmark Metrics
* **Baseline Accuracy (Text Match):** 60.0% — 6/10
* **ZaraSourcing Accuracy (Code Grounded):** 70.0% — 7/10
* **Resume fraud caught:** Baseline 1/5 · ZaraSourcing 5/5

| Candidate | GitHub | Vetting Role | Target | Baseline | ZaraSourcing | Baseline | Agent |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Jessica Taylor | @jesscloud | Cloud Infrastructure Engineer | `verified` | `verified` | `verified` | ✅ | ✅ |
| Carlos Gomez | @carlosfront | Next.js Tailwind Developer | `verified` | `verified` | `verified` | ✅ | ✅ |
| Olaleye Oyewunmi | @junnygram | Senior Full-Stack Engineer (Go/Next.js) | `verified` | `verified` | `exaggerated` | ✅ | ❌ over-flag |
| Emily Chen | @emilycodes | Senior Frontend Developer | `verified` | `verified` | `exaggerated` | ✅ | ❌ over-flag |
| Michael Chang | @mikecode | Full-Stack Node.js Developer | `verified` | `verified` | `exaggerated` | ✅ | ❌ over-flag |
| Alex Rivera | @riveradevops | DevOps & SRE Engineer | `exaggerated` | `verified` | `exaggerated` | ❌ missed | ✅ |
| Sarah Jenkins | @sarahml | Data Scientist & ML Engineer | `exaggerated` | `verified` | `failed` | ❌ missed | ✅ |
| David Kim | @davidsecurity | Security Engineer | `failed` | `verified` | `failed` | ❌ missed | ✅ |
| Amara Okafor | @amaracodes | Python Backend Developer | `failed` | `verified` | `failed` | ❌ missed | ✅ |
| Raj Patel | @rajconcurrency | Golang Backend Developer | `failed` | `failed` | `failed` | ✅ | ✅ |

<!-- BENCHMARK_END -->

Reproduction guide: **[REPRODUCTION.md](./REPRODUCTION.md)**

---

## Try it in 5 minutes

Start at **https://micro1-production.up.railway.app/demo** — a guided page that walks the whole product in order. Or go straight to a piece:

| What | Link |
|---|---|
| Guided demo walkthrough | `/demo` |
| Benchmark, live from the results file | `/benchmark` |
| Recruiter dashboard (`demo@zarasourcing.com` / `demo123`) | `/company/login` |
| Voice + AR interview | `/demo` → **Voice + AR demo** |
| Candidate apply flow | `/apply/devops_job` |

**Best single thing to look at:** the recruiter dashboard → **Alex Rivera** (`@riveradevops`), scored 45%. He claims *"Expert in writing multi-stage Docker builds and Helm charts"*; the agent read his repos and found no Dockerfiles or Helm templates at all, only empty READMEs. The text-only baseline scored him `verified` — the resume reads well — while the agent scored him `exaggerated`. That single row is the whole thesis.

Because Alex's finding is an *absence* of code, its citation reads `Resume Text` rather than a filename — there is no file to point at. For citations that name a specific file, open **David Kim** (`insecure-auth-demo/auth.py`), **Raj Patel** (`concurrent-ingestor/ingest.go`), or **Olaleye Oyewunmi** (`expense-insights/main.go`). Citations name a file, not a line range.

**For the voice interview:** use **Chrome or Edge** and allow camera + microphone. The 2-question demo takes about 2 minutes. Look away from the screen or switch tabs to see proctoring raise a flag.

---

## Run it locally

### Prerequisites
- Go 1.21+
- Node.js 18+ and npm
- AWS credentials (Bedrock + Polly + Rekognition + S3) — optional, everything degrades gracefully
- Google Gemini API key — only needed to re-run `make evaluate`

```bash
git clone https://github.com/Junnygram/micro1.git
cd micro1
cp .env.example .env   # fill in the values below
make run               # backend :8080, frontend :3000
```

Open http://localhost:3000.

```env
LLM_PROVIDER=bedrock
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
GEMINI_API_KEY=your_gemini_key      # fallback + benchmark
PORT=8080
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Running without AWS keys

Nothing hard-fails. Polly falls back to browser speech, Bedrock falls back to Gemini, S3 falls back to local disk, and Rekognition proctoring returns `{"provider":"unavailable","verdict":"skipped"}` while the MediaPipe overlay, gaze tracking and tab-switch detection keep working. Set `PROCTOR_PROVIDER=local` to force that path deliberately.

---

## Validation

Everything load-bearing has a command that checks it.

```bash
make verify-benchmark   # benchmark file is internally consistent (no key needed)
make test-proctor       # 7 tests over every Rekognition verdict rule (no AWS needed)
make verify-proctor FRAMES="clean.jpg phone.jpg two_people.jpg"
make evaluate           # full benchmark re-run (Gemini key, ~2–5 min)
```

`make verify-proctor` sends your own photos through the real AWS API and prints the verdict, face count, head pose, latency, flagged labels with confidences, and the full raw Rekognition response — so you can see the evidence behind a decision rather than taking the verdict on faith.

Check a deployment's proctoring status directly:

```bash
curl -s https://zarasourcing-production.up.railway.app/api/health
```

```json
{
  "status": "ok",
  "proctoring": {
    "provider": "aws_rekognition",
    "ready": true,
    "checks": ["phone_detected", "multiple_faces", "look_away", "no_face"]
  }
}
```

`ready: false` means AWS credentials or IAM permissions are missing on that deployment and proctoring is running in MediaPipe-only fallback.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Go 1.21 · `net/http` · REST |
| Database | SQLite, WAL mode (`modernc.org/sqlite`) |
| Frontend | Next.js 14 · TypeScript · vanilla CSS |
| Audit agent & scoring | AWS Bedrock Claude (primary) · Gemini Flash (fallback) |
| Interview voice | AWS Polly neural TTS · browser `SpeechSynthesis` fallback |
| Speech-to-text | Web Speech API (`SpeechRecognition`) |
| Proctoring decisions | **Amazon Rekognition** `DetectLabels` + `DetectFaces` |
| Face mesh overlay | MediaPipe FaceLandmarker (WebAssembly) — visual only |
| Recording | MediaRecorder API |
| Storage | AWS S3, local disk fallback |
| Deploy | Railway (two services) · Docker Compose for local |

---

## Project layout

```
micro1/
├── backend/
│   ├── pkg/
│   │   ├── agent/          # audit agent + text-only baseline
│   │   ├── proctor/        # Amazon Rekognition integrity analysis (+ tests)
│   │   ├── awsbedrock/     # Bedrock Claude client
│   │   ├── benchmark/      # benchmark file loader + consistency tests
│   │   ├── trajectory/     # reasoning-trace parser
│   │   ├── db/             # SQLite schema + queries
│   │   ├── runner/         # benchmark dataset loader
│   │   └── server/         # REST handlers
│   ├── cmd/proctorcheck/   # make verify-proctor CLI
│   ├── data/
│   │   ├── candidates/dataset.json      # 10 labelled profiles
│   │   ├── benchmark_results.json       # single source of benchmark truth
│   │   ├── trajectories/                # agent reasoning traces
│   │   └── resumes/ recordings/
│   └── main.go
├── frontend/src/app/
│   ├── page.tsx                    # landing
│   ├── demo/page.tsx               # guided judge walkthrough
│   ├── benchmark/page.tsx          # reads benchmark_results.json
│   ├── company/dashboard/page.tsx  # jobs, leaderboard, pipeline
│   ├── apply/[jobId]/page.tsx      # candidate application
│   ├── interview/[token]/page.tsx  # voice interview + proctoring
│   ├── candidate/[id]/page.tsx     # audit workspace + citations
│   └── report/[github]/page.tsx    # public fraud report
├── PROCTORING.md      # how proctoring works + how to verify it
├── REPRODUCTION.md    # reproduce the benchmark
├── WALKTHROUGH.md     # demo video script
├── DEPLOY.md          # Railway deploy guide
├── evaluate.py        # benchmark runner
└── Makefile
```

---

## API reference

### Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Ping + live proctoring provider status |

### Company auth & jobs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/companies/register` | Register a company |
| `POST` | `/api/companies/login` | Log in |
| `GET` | `/api/jobs?company_id=` | List jobs |
| `POST` | `/api/jobs` | Create a job |

### Applications
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/apply` | Submit application (multipart, resume upload) |
| `GET` | `/api/candidates?company_id=&job_id=` | List candidates |

### Interview
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/interview/questions?job_id=` | Get a job's questions |
| `POST` | `/api/interview/questions` | Set a job's questions |
| `POST` | `/api/interview/start` | Create a session, returns token |
| `GET` | `/api/interview/{token}` | Session + candidate + questions |
| `POST` | `/api/interview/complete` | Score answers via Bedrock/Gemini |
| `GET` | `/api/speak?text=` | Polly TTS, returns MP3 |

### Proctoring
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/proctoring/analyze` | Frame → Rekognition verdict + audit log entry |

### Agent & benchmark
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/sessions` | Run the audit agent (`mode: baseline \| advanced`) |
| `GET` | `/api/benchmark` | Canonical benchmark JSON |
| `GET` | `/api/trajectory/{github}` | Saved reasoning trace |

### Demo
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/demo/status` | Demo-readiness self-check |
| `POST` | `/api/demo/interview` | Provision the 2-question proctored interview |

---

## Database schema

| Table | Purpose |
|---|---|
| `companies` | Company accounts, bcrypt passwords |
| `jobs` | Job openings per company |
| `candidates` | Applicants, resume URLs, scores |
| `interview_questions` | Per-job AI questions |
| `interview_sessions` | Token, answers JSON, score, fit summary |
| `claims_audit` | Per-claim GitHub audit verdicts + citations |
| `steps` | Agent reasoning steps (terminal log) |
| `proctoring_events` | Rekognition findings, gaze and tab-switch events |
| `sourcing_criteria` | Per-company scoring weights |

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | Recommended | Bedrock + Polly + **Rekognition** + S3 |
| `AWS_SECRET_ACCESS_KEY` | Recommended | AWS secret |
| `AWS_REGION` / `AWS_S3_REGION` | Optional | Region, default `us-east-1` |
| `AWS_S3_BUCKET` | Optional | Resume and recording storage |
| `LLM_PROVIDER` | Optional | `bedrock` (default when AWS set) or `gemini` |
| `GEMINI_API_KEY` | Fallback | Scoring fallback + `make evaluate` |
| `PROCTOR_PROVIDER` | Optional | Set `local` to force MediaPipe-only proctoring |
| `PORT` | Optional | Backend port, default `8080` |
| `NEXT_PUBLIC_API_URL` | Deploy | Frontend → backend URL, baked at build time |

IAM permissions needed for proctoring: `rekognition:DetectLabels`, `rekognition:DetectFaces`.

---

## Docker

```bash
docker-compose up --build
```

---

## Hackathon submission

- **[WALKTHROUGH.md](./WALKTHROUGH.md)** — the demo video script
- **[PROCTORING.md](./PROCTORING.md)** — proctoring internals and verification
- **[REPRODUCTION.md](./REPRODUCTION.md)** — reproduce the benchmark
- **[SUBMISSION.md](./SUBMISSION.md)** — judge checklist

## Built by

**Olaleye Oyewunmi** ([@junnygram](https://github.com/Junnygram)) — for the micro1 Hackathon.
