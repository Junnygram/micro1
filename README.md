# ZaraSourcing — AI-Powered Technical Hiring Platform

> **Built for the micro1 Hackathon** · Go + Next.js · Gemini AI · AWS Polly · MediaPipe AR

ZaraSourcing is a full-stack SaaS hiring platform that replaces manual technical screening with an end-to-end AI pipeline. Companies post jobs, candidates apply and take a live AI voice interview, and Gemini scores every answer — producing a ranked leaderboard of who is the best fit for the role and exactly why.

---

## 🎯 The Problem We Solve

Resume inflation is at an all-time high. A candidate claims *"Expert in Go concurrency, built custom SQLite WAL wrappers, core open-source contributor"* — standard ATS tools score them 100/100 on keywords alone. Recruiters then spend hours manually browsing GitHub, reading code, and conducting phone screens just to find out the candidate copied everything from a tutorial.

**ZaraSourcing eliminates this entirely:**
- Audits GitHub code against resume claims automatically
- Conducts a live AI voice interview — no human interviewer needed
- Scores every spoken answer with Gemini and ranks all candidates
- Shows the hiring team exactly who is a fit and why, in seconds

---

## 🏗️ Architecture — 3 User Roles

```
┌─────────────────────────────────────────────────────────┐
│                    ZaraSourcing Platform                 │
├──────────────┬──────────────────────┬────────────────────┤
│  Super Admin │     Company          │     Candidate      │
│  /admin      │  /company/dashboard  │  /apply/[jobId]    │
│              │  /company/login      │  /interview/[token]│
│  Platform    │  Create jobs         │  Apply for role    │
│  analytics   │  Set AI questions    │  Take AI interview │
│  All companies│  Copy apply link    │  Get scored live   │
│  Total stats │  View leaderboard    │  See AI feedback   │
└──────────────┴──────────────────────┴────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Go 1.21 · `net/http` · REST API |
| **Database** | SQLite with WAL mode (`modernc.org/sqlite`) |
| **Frontend** | Next.js 14 · TypeScript · Vanilla CSS |
| **AI Scoring** | Google Gemini 1.5 Flash (interview scoring + fit analysis) |
| **AI Voice** | AWS Polly (Joanna voice — neural TTS for interview questions) |
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
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=your-bucket-name
AWS_S3_REGION=us-east-1
PORT=8080
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

**3. The Interview Experience**
- Allow microphone and camera access when prompted
- The AI (AWS Polly) speaks each question out loud
- After the question finishes, the mic **automatically activates** — just speak your answer naturally
- Your spoken words appear as live text on screen in real time
- Click **Next Question →** when done, or wait for the 30-second auto-advance
- After the final question, click **Submit Interview ✓**

**4. Get Your Score**
- Gemini AI scores all your answers (0–100%)
- You see your score immediately with written feedback: strengths, gaps, and overall fit assessment
- The hiring team sees your ranking on their dashboard

---

### As a Super Admin

```
http://localhost:3000/admin
```

View platform-wide analytics:
- Total companies registered
- Total job openings created
- Total candidates who applied
- Total completed AI interviews
- Full list of all companies with plan tier and join date

---

## 🤖 AI Features Deep Dive

### AI Voice Interview
- AWS Polly (neural `Joanna` voice) speaks each question
- Estimated speech duration is calculated (`phrase.length × 55ms`) so the mic activates automatically right after the AI finishes speaking
- No button to press — the interview flows like a real conversation
- Fallback: browser `SpeechSynthesis` if AWS Polly is unavailable

### Gemini Interview Scoring
When a candidate submits, all Q&A pairs are sent to Gemini with this prompt structure:
```
You are an expert technical interviewer for the role: "[role]".
Score this candidate's interview answers from 0-100 and give a fit summary.
Answers: [Q1: answer, Q2: answer, ...]
Respond in JSON: { score, fit_summary, strengths, gaps }
```
The score, fit summary, strengths, and gaps are stored and displayed on the company leaderboard.

### AR Face Tracking (Proctoring)
- MediaPipe FaceLandmarker runs locally in WebAssembly (no server calls)
- 478 facial landmarks tracked per frame at 30fps
- AR canvas overlay renders:
  - **Face mesh dots** — green when looking at screen, red when deviating
  - **Bounding box** — snaps around the face, color-coded by gaze status
  - **Gaze direction arrow** — shows where the head is pointing
  - **Status label** — `LOCKED ON` / `GAZE DEVIATION` stamped above the face
- Gaze deviation events are logged to the database with timestamp and duration
- Tab-switch events are also captured via `window.blur`

### GitHub Code Auditing (ZaraSourcing Agent)
The original agentic audit pipeline is still available for companies that want deep code verification:
- Clones candidate's public GitHub repositories
- Greps source files for claimed technologies
- Verifies resume claims against actual code (WAL mode, concurrency patterns, etc.)
- Flags exaggerations and failures with evidence citations
- Accessible via the legacy `/candidate/[id]` audit workspace

---

## 📁 Project Structure

```
micro1/
├── backend/
│   ├── pkg/
│   │   ├── agent/          # ZaraSourcing GitHub audit agent + baseline
│   │   ├── db/             # SQLite schema, migrations, all DB methods
│   │   ├── runner/         # Benchmark runner + dataset loader
│   │   └── server/         # All REST API handlers
│   ├── data/
│   │   ├── candidates/     # dataset.json — 10 seeded candidate profiles
│   │   ├── resumes/        # Uploaded resume files
│   │   ├── recordumes/     # Recorded interview videos
│   │   └── trajectories/   # Agent reasoning traces (markdown)
│   └── main.go
├── frontend/
│   └── src/app/
│       ├── page.tsx                    # Landing page
│       ├── company/
│       │   ├── login/page.tsx          # Company sign in / register
│       │   └── dashboard/page.tsx      # Job management + leaderboard
│       ├── apply/[jobId]/page.tsx      # Candidate application form
│       ├── interview/[token]/page.tsx  # AI audio interview room
│       ├── admin/page.tsx              # Super admin analytics
│       ├── candidate/[id]/page.tsx     # GitHub audit workspace (legacy)
│       ├── admindashboard/page.tsx     # Legacy recruiter dashboard
│       └── troubleshooting/page.tsx    # System diagnostics
├── traces/                 # AI agent execution traces (JSONL)
├── .env.example
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
| `POST` | `/api/interview/complete` | Score all answers via Gemini, save results |

### Voice
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/speak?text=` | AWS Polly TTS — returns MP3 audio stream |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/stats` | Platform-wide counts |
| `GET` | `/api/admin/companies` | All registered companies |

---

## 🧪 Benchmark Results

The GitHub audit agent was evaluated against 10 seeded candidate profiles with known ground-truth verdicts:

| Agent | Accuracy |
|---|---|
| Baseline (text-only keyword match) | **60.0%** |
| ZaraSourcing (code-grounded audit) | **70.0%** |

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

| Candidate | Role | Target | ZaraSourcing | Result |
|---|---|---|---|---|
| Jessica Taylor | Cloud Infrastructure Engineer | `verified` | `verified` | ✅ |
| Carlos Gomez | Next.js Tailwind Developer | `verified` | `verified` | ✅ |
| Olaleye Oyewunmi | Senior Full-Stack (Go/Next.js) | `verified` | `exaggerated` | ❌ |
| Emily Chen | Senior Frontend Developer | `verified` | `exaggerated` | ❌ |
| Alex Rivera | DevOps & SRE Engineer | `exaggerated` | `exaggerated` | ✅ |
| Michael Chang | Full-Stack Node.js Developer | `verified` | `exaggerated` | ❌ |
| Raj Patel | Golang Backend Developer | `failed` | `failed` | ✅ |
| David Kim | Security Engineer | `failed` | `failed` | ✅ |
| Amara Okafor | Python Backend Developer | `failed` | `failed` | ✅ |
| Sarah Jenkins | Data Scientist & ML Engineer | `exaggerated` | `failed` | ✅ |

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
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for interview scoring |
| `AWS_ACCESS_KEY_ID` | Optional | AWS credentials for Polly TTS + S3 |
| `AWS_SECRET_ACCESS_KEY` | Optional | AWS secret |
| `AWS_S3_BUCKET` | Optional | S3 bucket for resume/recording storage |
| `AWS_S3_REGION` | Optional | AWS region (default: `us-east-1`) |
| `PORT` | Optional | Backend port (default: `8080`) |
| `NEXT_PUBLIC_API_URL` | Optional | Frontend API base URL (default: `http://localhost:8080`) |

> **Without AWS credentials:** Polly falls back to browser `SpeechSynthesis`, S3 uploads fall back to local disk storage. The core AI interview and scoring still works fully.

---

## 👥 Built By

**Olaleye Oyewunmi** ([@junnygram](https://github.com/Junnygram)) — Built for the micro1 Hackathon.
