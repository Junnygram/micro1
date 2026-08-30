# Pre-Submit Checklist — ZaraSourcing

Use this before HackerEarth + Loom. Tick each box on your **deployed** URLs.

**Frontend:** https://micro1-production.up.railway.app  
**Backend:** https://zarasourcing-production.up.railway.app  
**Smoke test API:** https://zarasourcing-production.up.railway.app/api/demo/status

---

## Reproducibility (judges will check)

```bash
make verify-benchmark   # Go tests + reconcile benchmark_results.json (no API key)
make evaluate           # Full baseline vs agent re-run (requires GEMINI_API_KEY)
```

- [ ] **`/benchmark`** numbers match `backend/data/benchmark_results.json` exactly
- [ ] **`make verify-benchmark`** passes locally
- [ ] Source on `/benchmark` says **`make evaluate`** (not live DB inflation)
- [ ] Fraud row: **baseline 1/5**, **agent 5/5** discrepancy cases

---

## Must pass (judges will hit these)

- [ ] **`/demo`** loads — 7-step walkthrough + deploy status banner
- [ ] **`/benchmark`** shows **60%** baseline / **70%** agent (7/10)
- [ ] **`/report/riveradevops`** — fraud report, no login
- [ ] **Demo login** — `demo@zarasourcing.com` / `demo123` → dashboard with **10 applicants**
- [ ] **Alex Rivera** — score **45%**, DEMO WOW badge, audit link works
- [ ] **`/api/demo/status`** — `demo_candidates` ≥ 10, `alex_score` = 45, `alex_audits` ≥ 1
- [ ] **Loom recorded on frontend URL above** (not localhost)
- [ ] **GitHub pushed** — latest code deployed to Railway

---

## Should pass (strong submission)

- [ ] **Voice interview** — `/apply/devops_job` → link → Chrome → mic → hear AI voice
- [ ] **Trajectories** — 10 files in `backend/data/trajectories/`
- [ ] **REPRODUCTION.md** — `make evaluate` documented
- [ ] **CHANGELOG.md** — iteration story (60% → 70%, list_repo_files)
- [ ] **Submission states:** agent recommends, **recruiter decides**

---

## Known honest limits (say these in Loom if asked)

| Topic | Truth |
|-------|--------|
| Agent accuracy | **70%** (7/10) on last `make evaluate` — 3 false positives fixed in Iter 2 tooling |
| Demo audits on `/report` | Evidence from **dataset ground truth** for stable demo (verdicts match evaluate agent column) |
| Live re-run | Judges need **GEMINI_API_KEY** + `make evaluate` (~2–5 min) |
| macOS SSL | `pip install certifi` if evaluate fails SSL verify |

---

## Deploy fixes if checklist fails

| Symptom | Fix |
|---------|-----|
| Dashboard empty after login | Redeploy **backend** (runs demo repair on startup) |
| Benchmark shows wrong % | Redeploy backend with latest `benchmark_results.json` |
| Alex score wrong (not 45) | Redeploy backend — scores load from benchmark file |
| API calls fail | Redeploy frontend with correct `NEXT_PUBLIC_API_URL` |

---

## Submit these links

| Field | URL |
|-------|-----|
| Live demo | https://micro1-production.up.railway.app/demo |
| GitHub | https://github.com/Junnygram/micro1 |
| Loom | _(your recording — same flow as `/demo`)_ |
