# Reproduction Guide: ZaraSourcing

Follow this guide to set up a clean workspace, run the verification suites, and execute the comparative evaluation benchmark between the **Text-Only Baseline** and the **ZaraSourcing Agent Solution**.

---

## 💻 Environment & System Requirements

This project has been verified and tested on the following local environment:
* **OS:** macOS (darwin/amd64)
* **Go Version:** `go1.21+` (compiled with standard toolchain)
* **Node.js Version:** `v18.17+` or `v20+`
* **NPM Version:** `10.9+`
* **Python Version:** `3.9+` (uses standard library `urllib` and `sqlite3` modules)
* **API Access:** Gemini API Key (`gemini-1.5-pro` model)

---

## 📥 Step-by-step Workspace Setup

1. **Verify Compilers & Interpreters:**
   Ensure your system has Python 3, Go, and Node installed:
   ```bash
   python3 --version
   go version
   node -v
   npm -v
   ```
2. **Environment Configuration:**
   Copy the example environment template and insert your Gemini API Key:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in `GEMINI_API_KEY`:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```
3. **Verify Dependencies & Compile Backend:**
   Compile the backend code to verify the sqlite, runner, and agent packages build correctly:
   ```bash
   make build-backend
   ```
4. **Compile Next.js Frontend:**
   Compile the frontend production static files:
   ```bash
   make build-frontend
   ```

---

## 🧪 Running the Automated Evaluation

The automated evaluation runner resets the database, boots up the Go backend in background evaluation mode (disabling Human-in-the-Loop locks), runs both agents on the 10 candidate profiles, evaluates the accuracy of claim verdicts against expected human labels, exports the agent trajectories to `data/trajectories/`, and updates the report below.

To execute the benchmark:
```bash
make evaluate
```

> **API key:** If audits fail with HTTP 403 / "reported as leaked", create a new key at [Google AI Studio](https://aistudio.google.com/) and update `.env` plus Railway env vars before re-running.

### ⏱️ Approximate Runtime & Cost
* **Runtime:** ~1.5 to 2.5 minutes (depending on API latency).
* **Cost:** Less than **$0.03 USD** in token consumption (uses standard Gemini AI studio tokens, and is free under standard rate limits).

### 📊 Last Execution Results

<!-- BENCHMARK_START -->
### Last Execution Results
* **Baseline Accuracy:** 60.0%
* **ZaraSourcing Accuracy:** 70.0%

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

---

## 🖥️ Running the Interactive App (Developer Mode)

To interact with ZaraSourcing in the browser and test the criteria weight sliders:

1. **Start the applications:**
   ```bash
   make run
   ```
2. **Access the Sourcing Workspace:**
   Open your browser to [http://localhost:3000](http://localhost:3000).
3. **Trigger a Vetting Session:**
   Select any candidate on the left sidebar (e.g. `Alex Rivera` or `Raj Patel`), and click **Run ZaraSourcing Audit (Grounded Agent)**.
4. **Inspect Citations:**
   Once completed, open the candidate scorecard, click on any claimed resume item, and verify that the evidence auditor highlights matching code blocks and cites files.
5. **Adjust Criteria Weight Sliders:**
   Go back to the main page and drag the sliders. Observe how candidates are dynamically re-ordered in the rankings based on your criteria preferences.
