# ZaraSourcing: Grounded Developer Sourcing & GitHub Code Auditor

ZaraSourcing is an agentic candidate sourcing and verification assistant designed for micro1's talent pipeline. It ingests a Job Description and a Candidate Profile (Resume + GitHub username), then uses code-auditing tools to verify the resume's claims against the candidate's actual public coding footprint on GitHub. 

It flags mismatches (e.g. CV claims "expert Golang concurrency developer" but their public GitHub repositories contain no Go files, or only contain basic tutorials or forked repositories), cites matching source code blocks, and scores technical alignment.

---

## 👥 Who Has the Problem & Why Does It Matter?

* **Who has the problem:** Technical recruiters and hiring managers sourcing developers on platforms like **micro1**.
* **The Bottleneck:** Resume inflation is at an all-time high. A resume might claim *"Expert in Go concurrency, built custom SQLite WAL connection wrappers, core contributor to open-source"*. Standard ATS tools score this candidate 100/100 based on keywords. Recruiters must then manually browse GitHub, check repo file contents, and trace commit histories to verify if the candidate actually wrote the code, which is a massive manual bottleneck.
* **The Solution:** ZaraSourcing automates this validation. It indexes the candidate's public repositories, greps source files, and verifies technical claims in a stateful reasoning loop. It outputs a grounded scorecard linking resume claims directly to matching lines of code or flagging critical empty/plagiarized repositories.

---

## 🛠️ Tech Stack & Architecture

ZaraSourcing uses a highly optimized, stateful architecture:
* **Go Backend:** Written in Go using `net/http` to serve REST endpoints and manage the agentic routing loop.
* **Database & Persistence:** SQLite (via pure-Go `modernc.org/sqlite` package) to log candidate scorecards, verified claims, and agent execution steps.
* **Next.js Frontend:** A premium dark-themed dashboard built with Next.js and custom Vanilla CSS, featuring:
  - **Sourcing Levers Panel:** Sliders to adjust criteria weights (Open Source, Code Quality, Experience) that dynamically re-rank candidates on the fly via the Go database.
  - **Evidence Auditor Board:** Side-by-side cards linking the **Resume Claim** on the left to the **Verified GitHub File** and citation line numbers on the right.
  - **Live Audit Terminal:** Animated console displaying the agent's real-time thoughts and search/grep tool calls.
* **LLM Integration:** Direct REST requests to the Google Gemini API (`gemini-1.5-pro` model), maintaining state statelessly by rebuilding conversation history directly from SQLite logs on each turn.

---

## 📈 Improvement Changelog

ZaraSourcing was developed iteratively, moving from text-only keyword matching to active code auditing:

| Stage | What We Tried & Why | Evidence / Quantitative Results | Decision / Learning |
| :--- | :--- | :--- | :--- |
| **Baseline** | **Text-Only Match:** Evaluated the candidate's resume text against the Job Description in a single LLM prompt, without tool access or GitHub audits. | **Always scored inflated resumes highly** (e.g. rating a candidate 95% fit even if their GitHub repositories were empty). Fails to catch discrepancies. | **Starting point.** Traditional resume parsers are easily fooled by buzzwords. |
| **Iteration 1** | **Active GitHub Tool Auditing:** Added tools to list repositories, query file paths, and read code contents. The agent validates claims against the code. | **Accurately flagged exaggerations and bugs** (e.g. identifying a race condition in a candidate's Go code when they claimed to write thread-safe systems). | **Kept.** Grounding claims in source code is the only way to verify true candidate capabilities. |
| **Iteration 2** | **Weighted Sourcing Levers (HITL):** Enabled recruiters to adjust criteria weighting (Open Source stars, Code Quality, Experience) to recalculate scores dynamically. | **Allowed flexible sourcing criteria** (e.g. prioritizing open-source contributors for community roles, or SRE code quality for infra roles). | **Kept.** Dynamic recalculation empowers hiring teams to customize evaluation metrics. |

---

## 🚀 Quick Start & Setup

### Prerequisites
* Go 1.21+
* Node.js v18+ & npm
* A Google Gemini API Key

### Installation & Run
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and paste your `GEMINI_API_KEY`.
3. Start the entire application:
   ```bash
   make run
   ```
4. Access the vetting workspace at [http://localhost:3000](http://localhost:3000).

---

## 🧪 Automated Benchmarking

To run the automated comparative evaluation benchmark between the Baseline Sourcing Agent and ZaraSourcing:
```bash
make evaluate
```
This command compiles the Go server, runs it in background auto-approve mode, executes both agents on the 10 candidate profiles, evaluates the accuracy of claim verdicts against expected human labels, exports the agent trajectories to `data/trajectories/`, and updates the report below.

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
# micro1
