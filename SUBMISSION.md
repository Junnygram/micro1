# ZaraSourcing — Hackathon Submission

**Problem:** Recruiters can't tell if resume claims are real. ATS tools score keywords; manual GitHub review takes 15+ min per candidate.

**Solution:** Agent that reads GitHub code, cites file:line evidence, runs AI voice interviews with AR proctoring, and ranks candidates — wrapped in a deployable SaaS.

**Live demo:** `[YOUR_RAILWAY_URL]/company/login` (demo: `demo@zarasourcing.com` / `demo123`)  
**Benchmark:** `[YOUR_RAILWAY_URL]/benchmark`  
**GitHub:** https://github.com/Junnygram/micro1

---

## Four deliverables

| # | Deliverable | Location |
|---|---|---|
| 1 | Code + improvement changelog | [CHANGELOG.md](./CHANGELOG.md) |
| 2 | Reproduction guide | [REPRODUCTION.md](./REPRODUCTION.md) — run `make evaluate` |
| 3 | Solution video (Loom) | Record using [QUICKSTART.md](./QUICKSTART.md) + `/demo` page |
| 4 | Agent trajectories | [backend/data/trajectories/](./backend/data/trajectories/) |

**Include these two trajectories in your submission notes:**
- `riveradevops_trajectory.md` — agent catches inflated DevOps resume with code citations
- `emilycodes_trajectory.md` — path-guessing failure that motivated `list_repo_files`

---

## Verified benchmark numbers

| Metric | Baseline | Agent |
|---|---|---|
| Verdict accuracy (10 cases) | **60%** (6/10) | **70%** (7/10) |
| Fraud detection (4 cases) | 0/4 | **4/4** |

Source: `backend/data/benchmark_results.json` + table in README/REPRODUCTION.

Re-run after rotating API key: `make evaluate`

---

## 60-second pitch (read this in Loom intro)

> "Resume inflation breaks hiring. ATS gives 100/100 for copied tutorials. Our baseline — a single Gemini prompt with no tools — gets 60% accuracy and misses every fraud case. Our agent gets GitHub tools: list repos, list files, read code, check proctoring logs. It hits 70% accuracy and catches 4 out of 4 fraud cases with file citations. We wrapped it in a full SaaS: companies post jobs, candidates get private interview links with AR proctoring, and recruiters see ranked results with evidence. Run `make evaluate` to reproduce."

---

## Loom video outline (~5 min)

| Time | Screen | Say |
|---|---|---|
| 0:00 | `/benchmark` | Numbers: 60% vs 70%, fraud 0/4 → 4/4 |
| 0:45 | `/company/login` | Full SaaS — post job, dashboard |
| 1:30 | Alex Rivera audit | Live terminal — repos, files, citations |
| 3:00 | Interview + AR (optional) | Private token link, gaze proctoring |
| 4:00 | Benchmark hot take | Tool errors looked like evidence → `list_repo_files` |
| 4:30 | GitHub + `make evaluate` | Reproducible for judges |

---

## Before you submit

1. **Rotate Gemini API key** if audits fail — update `.env` and Railway `GEMINI_API_KEY`
2. **Push to Railway** — set `NEXT_PUBLIC_API_URL` to backend URL
3. **Paste Railway `/company/login` link** in HackerEarth submission
4. **Upload Loom link**
5. **Confirm trajectories** — 10 files in `backend/data/trajectories/`

---

## Why this stands out among ~2000 submissions

- **Deployable SaaS**, not a CLI script
- **Fair baseline** on same 10 cases with ground truth labels
- **Measured improvement** with exported trajectories
- **Unique stack:** micro1 agent pattern + hiring pipeline (voice, AR, dashboard)
- **Evidence-based hot take:** path-guessing → tool design fix
