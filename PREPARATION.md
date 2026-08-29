# micro1 Frontier Engineering Challenge 2026 - Preparation Guide

This repository is set up for the **micro1 Frontier Engineering Challenge** (Aug 28 – Aug 30, 2026).

---

## 📅 The Kickoff Game Plan (Aug 28)

As soon as the problem statement is released, we will execute the following steps:

### Phase 1: Problem Ingestion & Discovery
1. **Read the Problem PDF:** We will place the PDF in this workspace and extract the core requirements, constraints, and success criteria.
2. **Setup Starter Repo:** If micro1 provides a starter repository, we will clone/extract it directly here.
3. **Define Acceptance Criteria:** We will extract the exact inputs, expected outputs, and performance limits.

### Phase 2: Build the Baseline (Requirement: "Baseline Solution")
1. **Implement the Naive Version:** Create a direct, simple solution targeting the core problem without optimizations or complex error handling.
2. **Build Verification Suite:** Create automated tests (e.g., PyTest or Vitest) to check the correctness of this baseline.
3. **Measure Metrics:** Record runtime, API costs, accuracy, or resource footprint to use as our "before" benchmark.

### Phase 3: Build the Advanced Version (Requirement: "Advanced Solution")
1. **Identify Bottlenecks:** Locate failure modes, performance bottlenecks, or boundary edge cases in the baseline.
2. **Design Agentic Optimizations:** Integrate advanced agentic patterns (e.g., self-correction loops, consensus verification, fallback systems).
3. **Execute & Benchmark:** Run the same test suite and measure the improvement. We need a clear, quantitative comparison (e.g., "5x faster execution, 98% accuracy vs 60% baseline").

### Phase 4: Package & Deliver
1. **Reproduction Guide:** A clear markdown guide describing installation, execution command lines, and environment setup.
2. **Agent Trajectories:** Package conversation logs and tool call execution traces.
3. **Walkthrough & Video:** Highlight the core differences, changelog, and major failure modes.

---

## 🛠️ Tech Stack & Directory Structure

We will use **Go** for a high-performance, reproducible backend and **Next.js (React/TypeScript)** for a premium, interactive frontend. 

### Proposed Directory Layout
```text
micro1/
├── PREPARATION.md
├── README.md
├── Makefile               # Task runner for setup, build, and tests
├── backend/               # Go backend
│   ├── go.mod
│   ├── go.sum
│   ├── main.go            # Entrypoint (baseline or advanced mode)
│   └── pkg/               # Go logic, tools, and evaluation helpers
├── frontend/              # Next.js frontend
│   ├── package.json
│   ├── src/               # React components, dashboard UI
│   └── next.config.js
└── data/                  # Challenge datasets, inputs, and results
```

---

## 🛠️ Readying the Environment

Before kickoff on **August 28**:
1. **Verify Go Installation:** Ensure you have Go (1.21+ recommended) installed. Run `go version`.
2. **Verify Node/NPM:** Ensure you have Node.js (v18+ or v20+) and npm/pnpm installed. Run `node -v` and `npm -v`.
3. **API Credentials:** Keep your LLM API keys (OpenAI, Anthropic, Gemini, etc.) ready in a local `.env` file (ensure this is ignored in `.gitignore`).
4. **Docker:** Make sure Docker is running if we need a containerized database or testing sandbox.

---

## 🏆 Targeting the Selective Awards

To win, our Go + Next.js solution must target these three specific awards:

### 1. Best Engineering Workflow
* **Go Backend:** Organize using clean architecture (handlers, services, repositories) with robust error handling, panic recovery middleware, and clean interface boundaries.
* **Database & State:** Use SQLite or memory-mapping in Go for easy setup and absolute reproducibility (no heavy databases to configure).
* **Next.js UI:** Create a stunning, premium interface using customized CSS (gradients, micro-animations, glassmorphism). We will not use generic templates.

### 2. Most Useful Real-World Workflow
* **Human-in-the-Loop (HITL):** Ensure the Next.js UI is not just a passive viewer. It should allow users to inspect agent steps, edit tool arguments mid-execution, override incorrect agent assumptions, and review logs in real time.
* **Real Problems:** Make the workflow robust against typical real-world failures (e.g., API rate-limits, malformed data, schema mismatch).

### 3. Best Demonstrated Improvement
* **Measurable Benchmarks:** We will build an evaluation script (`go test` or a custom Go CLI tool) that runs the same test harness on both our **Baseline** and **Advanced** solutions.
* **Reporting:** Output clean CSV/JSON results comparing:
  * Task success rate (%).
  * Execution speed/latency.
  * Token consumption / Cost ($).
  * Error recovery rate (%).


