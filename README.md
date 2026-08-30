# ZaraSourcing — AI-Powered Technical Hiring Platform

> **Built for the micro1 Hackathon** · Go + Next.js · AWS Bedrock Claude · AWS Polly · MediaPipe AR

ZaraSourcing is a full-stack SaaS hiring platform that replaces manual technical screening with an end-to-end AI pipeline. Companies post jobs, candidates apply and take a live AI voice interview, and the platform scores every answer — producing a ranked leaderboard with cited GitHub audit evidence.

---

## 🎯 The Problem We Solve

Resume inflation is at an all-time high. A candidate claims *"Expert in Go concurrency, built custom SQLite WAL wrappers, core open-source contributor"* — standard ATS tools score them 100/100 on keywords alone. Recruiters then spend hours manually browsing GitHub, reading code, and conducting phone screens just to find out the candidate copied everything from a tutorial.

**ZaraSourcing eliminates this entirely:**
- Audits GitHub code against resume claims automatically
- Conducts a live AI voice interview — no human interviewer needed
- Scores every spoken answer with **AWS Bedrock Claude** (Gemini fallback) and ranks candidates
- Shows the hiring team exactly who is a fit and why, in seconds

---

## 🏗️ Architecture — 3 User Roles

```
┌─────────────────────────────────────────────────────────┐
│                    ZaraSourcing Platform                 │
├──────────────────────┬──────────────────────────────────┤
│     Company          │           Candidate              │
│  /company/dashboard  │  /apply/[jobId]                  │
│  /company/login      │  /interview/[token]              │
│  /benchmark          │  Apply → private interview link  │
│  Create jobs         │  Hands-free AI voice interview   │
│  Set AI questions    │  Live score + feedback           │
│  Copy apply link     │                                  │
│  View leaderboard    │                                  │
│  Run GitHub audits   │                                  │
└──────────────────────┴──────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Go 1.21 · `net/http` · REST API |
| **Database** | SQLite with WAL mode (`modernc.org/sqlite`) |
| **Frontend** | Next.js 14 · TypeScript · Vanilla CSS |
| **AI Agent & Scoring** | AWS Bedrock Claude (primary) · Gemini 2.0 Flash (fallback) |
| **AI Voice** | AWS Polly (neural TTS) · browser `SpeechSynthesis` fallback |
| **Speech-to-Text** | Web Speech API (`SpeechRecognition`) — live transcription |
| **Face Tracking** | MediaPipe FaceLandmarker (WebAssembly) — AR overlay + gaze detection |
| **Video Recording** | MediaRecorder API — session archiving |
| **File Storage** | AWS S3 (resume + recording uploads, local fallback) |

---

## 🚀 Quick Start

### Prerequisites
- Go 1.21+
- Node.js v18+ & npm
- Google Gemini API Key
- AWS credentials (for Polly TTS + S3 — optional, fallback works without)

### 1. Clone & Configure

```bash
git clone https://github.com/Junnygram/micro1.git
cd micro1
cp .env.example .env
```

Open `.env` and fill in:

```env
GEMINI_API_KEY=your_gemini_key_here
LLM_PROVIDER=bedrock
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=your-bucket-name
AWS_S3_REGION=us-east-1
AWS_REGION=us-east-1
PORT=8080
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### 2. Run the Full Stack

```bash
make run
```

This starts the Go backend on `:8080` and the Next.js frontend on `:3000`.

### 3. Open the App

```
http://localhost:3000
```

---

## 🗺️ How to Use the Platform

### As a Company (Hiring Manager)

**1. Sign up / Log in**
```
http://localhost:3000/company/login
```
> Demo account: `demo@zarasourcing.com` / `demo123`

**2. Create a Job Opening**
- Click **+ New** in the sidebar
- Enter the job title and description
- Click **Create Job**

**3. Set AI Interview Questions**
- Select your job → click **⚙ Interview Questions**
- Add 3–5 role-specific questions (e.g. *"Explain how you handle race conditions in Go"*)
- Click **Save Questions** — the AI will ask these verbally to every candidate

**4. Share the Apply Link**
- Click **🔗 Copy Apply Link**
- Send it to candidates via email, LinkedIn, or job boards
- The link looks like: `https://yourdomain.com/apply/[job-id]`

**5. View Results**
- As candidates complete interviews, the **AI Interview Rankings** leaderboard populates automatically
- Each candidate shows: rank, score (0–100%), fit verdict (STRONG FIT / POSSIBLE FIT / NOT A FIT), and Gemini's written reasoning
- The **All Applicants** table shows everyone who applied with their interview status

---

### As a Candidate

**1. Apply**
- Open the apply link shared by the company
- Fill in: Full Name, Email, GitHub Username, select the role, upload your resume (PDF/DOCX)
- Click **Submit Application →**

**2. Take the AI Interview**
- After applying, you receive a unique interview link
- Open it in Chrome or Edge (required for Web Speech API)
- Read the pre-interview checklist and click **Start Interview →**

**3. The Interview Experience (hands-free)**
- Allow microphone and camera access when prompted
- The AI speaks each question (AWS Polly, or browser voice fallback)
- **Just speak your answer** — live transcription appears on screen
- After **~15 seconds of silence**, the AI asks: *"Are you done? Should I continue to the next question?"*
- Say **"yes"** or stay silent ~10s more to advance automatically — no button required
- Use **Chrome or Edge** (required for speech recognition)

**4. Get Your Score**
- Bedrock/Gemini scores all your answers (0–100%)
- You see your score immediately with written feedback
- The hiring team sees your ranking on their dashboard

**5. View agent benchmark (judges)**
```
http://localhost:3000/benchmark
```
Shows 60% baseline vs 70% agent accuracy and fraud detection (0/4 → 4/4).

---

### GitHub audit workspace (recruiters)

From the company dashboard, open any candidate → **Run GitHub Audit** to see the agent terminal, claim citations, and proctoring timeline.

**Best demo candidate:** Alex Rivera (`@riveradevops`) — inflated DevOps resume caught with evidence.

Demo login: `demo@zarasourcing.com` / `demo123`

## 🤖 AI Features Deep Dive

### AI Voice Interview
- AWS Polly speaks questions; fallback to browser `SpeechSynthesis`
- Web Speech API transcribes answers live (Chrome/Edge)
- **Hands-free flow:** silence detection → spoken prompt → auto-advance to next question
- Optional manual **Skip to next** if needed

### Interview Scoring
When a candidate finishes, answers are sent to **AWS Bedrock Claude** (or Gemini if Bedrock is unavailable):
```
Respond in JSON: { score, fit_summary, strengths, gaps }
```
Score and fit summary appear on the company leaderboard.

### AR Face Tracking (Proctoring)
- MediaPipe FaceLandmarker runs in WebAssembly
- Face mesh + bounding box overlay; `LOCKED ON` / `GAZE DEVIATION` labels
- Gaze deviation and tab-switch events logged to the database

### GitHub Code Auditing (ZaraSourcing Agent)
Tool-calling agent verifies resume claims against code evidence:
- `list_github_repos`, `list_repo_files`, `get_repo_file`, proctoring logs
- Evaluated on **10 seeded profiles** with ground-truth labels (`make evaluate`)
- **70% accuracy** vs **60%** text-only baseline; **4/4 fraud cases** caught
- Live audit workspace: `/candidate/[id]` (demo data seeded on first run)

## 📁 Project Structure

```
micro1/
├── backend/
│   ├── pkg/
│   │   ├── agent/          # GitHub audit agent + baseline
│   │   ├── awsbedrock/     # Bedrock Claude client
│   │   ├── trajectory/     # Trajectory markdown parser
│   │   ├── db/             # SQLite schema + queries
│   │   ├── runner/         # Benchmark dataset loader
│   │   └── server/         # REST API handlers
│   ├── data/
│   │   ├── candidates/     # dataset.json — 10 benchmark profiles
│   │   ├── benchmark_results.json
│   │   ├── resumes/        # Uploaded resume files
│   │   ├── recordumes/     # Interview recordings (local)
│   │   └── trajectories/   # Agent reasoning traces
│   └── main.go
├── frontend/
│   └── src/app/
│       ├── page.tsx                    # Landing page
│       ├── benchmark/page.tsx          # 60% vs 70% benchmark UI
│       ├── company/login/page.tsx      # Company auth
│       ├── company/dashboard/page.tsx  # Jobs + leaderboard + pipeline
│       ├── apply/[jobId]/page.tsx      # Candidate application
│       ├── interview/[token]/page.tsx  # AI voice interview room
│       └── candidate/[id]/page.tsx     # GitHub audit workspace
├── SUBMISSION.md           # Hackathon submission checklist
├── QUICKSTART.md           # Loom demo script
├── DEPLOY.md               # Railway deploy guide
├── CHANGELOG.md            # Agent improvement log
├── evaluate.py             # Benchmark runner
├── Makefile
└── docker-compose.yml
```

---

## 🗄️ Database Schema

| Table | Purpose |
|---|---|
| `companies` | Company accounts (bcrypt passwords) |
| `jobs` | Job openings per company |
| `candidates` | Applicants with resume URLs |
| `interview_questions` | Per-job AI interview questions set by company |
| `interview_sessions` | Per-candidate interview: token, answers (JSON), score, fit summary |
| `claims_audit` | GitHub code audit results per candidate |
| `steps` | Agent reasoning steps (terminal logs) |
| `proctoring_events` | Gaze deviation + tab-switch events |
| `sourcing_criteria` | Dynamic scoring weights per company |

---

## 🔌 API Reference

### Company Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/companies/register` | Register new company |
| `POST` | `/api/companies/login` | Login, returns company object |

### Jobs
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/jobs?company_id=` | List jobs for a company |
| `POST` | `/api/jobs` | Create a new job |

### Applications
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/apply` | Submit candidate application (multipart) |
| `GET` | `/api/candidates?company_id=&job_id=` | List candidates |

### AI Interview
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/interview/questions?job_id=` | Get questions for a job |
| `POST` | `/api/interview/questions` | Set questions for a job |
| `POST` | `/api/interview/start` | Create interview session, returns token |
| `GET` | `/api/interview/[token]` | Get session + candidate + questions |
| `POST` | `/api/interview/complete` | Score answers via Bedrock/Gemini |

### Agent & Benchmark
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/benchmark` | Canonical benchmark JSON |
| `GET` | `/api/trajectory/{github}` | Saved agent trajectory |
| `POST` | `/api/sessions` | Run GitHub audit agent |

### Voice
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/speak?text=` | AWS Polly TTS — returns MP3 |

### Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend ping (`{"status":"ok"}`) |

---

## 🧪 Benchmark Results

The GitHub audit agent was evaluated against 10 seeded candidate profiles with known ground-truth verdicts:

| Agent | Accuracy |
|---|---|
| Baseline (text-only keyword match) | **60.0%** |
| ZaraSourcing (code-grounded audit) | **70.0%** |
| Fraud detection (4 cases) | Baseline **0/4** → Agent **4/4** |

See live numbers: `http://localhost:3000/benchmark`

<!-- BENCHMARK_START -->
### Vetting Benchmark Metrics
* **Baseline Accuracy (Text Match):** 60.0%
* **ZaraSourcing Accuracy (Code Grounded):** 70.0%

| Candidate | GitHub | Vetting Role | Target Verdict | Baseline Verdict | ZaraSourcing Verdict | Final Match | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Jessica Taylor | @jesscloud | Cloud Infrastructure Engineer | `verified` | `verified` | `verified` | **95%** | ✅ SUCCESS |
| Carlos Gomez | @carlosfront | Next.js Tailwind Developer | `verified` | `verified` | `verified` | **90%** | ✅ SUCCESS |
| Olaleye Oyewunmi | @junnygram | Senior Full-Stack Engineer (Go/Next.js) | `verified` | `verified` | `exaggerated` | **89%** | ❌ MISSED |
| Emily Chen | @emilycodes | Senior Frontend Developer | `verified` | `verified` | `exaggerated` | **89%** | ❌ MISSED |
| Alex Rivera | @riveradevops | DevOps & SRE Engineer | `exaggerated` | `verified` | `exaggerated` | **79%** | ✅ SUCCESS |
| Michael Chang | @mikecode | Full-Stack Node.js Developer | `verified` | `verified` | `exaggerated` | **79%** | ❌ MISSED |
| Raj Patel | @rajconcurrency | Golang Backend Developer | `failed` | `failed` | `failed` | **75%** | ✅ SUCCESS |
| David Kim | @davidsecurity | Security Engineer | `failed` | `verified` | `failed` | **75%** | ✅ SUCCESS |
| Amara Okafor | @amaracodes | Python Backend Developer | `failed` | `verified` | `failed` | **75%** | ✅ SUCCESS |
| Sarah Jenkins | @sarahml | Data Scientist & ML Engineer | `exaggerated` | `verified` | `failed` | **60%** | ✅ SUCCESS |

<!-- BENCHMARK_END -->

Run the benchmark yourself:
```bash
make evaluate
```

---

## 🐳 Docker

```bash
docker-compose up --build
```

Starts both the Go backend and Next.js frontend in containers.

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Fallback | Google Gemini key (interview scoring + agent fallback) |
| `LLM_PROVIDER` | Optional | `bedrock` (default when AWS set) or `gemini` |
| `AWS_ACCESS_KEY_ID` | Recommended | Bedrock Claude + Polly TTS + S3 |
| `AWS_SECRET_ACCESS_KEY` | Recommended | AWS secret |
| `AWS_S3_BUCKET` | Optional | S3 bucket for resume/recording storage |
| `AWS_S3_REGION` / `AWS_REGION` | Optional | AWS region (default: `us-east-1`) |
| `PORT` | Optional | Backend port (default: `8080`) |
| `NEXT_PUBLIC_API_URL` | Deploy | Frontend → backend URL (set at build time on Railway) |

> **Without AWS:** Polly falls back to browser speech, agent uses Gemini, files save locally. Core interview + seeded audit demo still works.

---

## 📦 Hackathon submission

See **[SUBMISSION.md](./SUBMISSION.md)** for the judge checklist, Loom script, and deliverables.

**5-minute demo path:**
1. `/benchmark` — 60% vs 70%, fraud 0/4 → 4/4
2. `/company/login` — `demo@zarasourcing.com` / `demo123`
3. Dashboard → Alex Rivera → **Run GitHub Audit**
4. `/apply/devops_job` — optional voice interview snippet

## 👥 Built By

**Olaleye Oyewunmi** ([@junnygram](https://github.com/Junnygram)) — Built for the micro1 Hackathon.
