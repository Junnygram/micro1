# Quick Start — Demo & Loom Video

## 1. One-time setup

```bash
cd /Users/junioroyewunmi/Desktop/micro1
cp .env.example .env
# Edit .env → set a fresh GEMINI_API_KEY from https://aistudio.google.com/
# (If you see "API key reported as leaked", create a new key and update Railway too)

make setup
```

## 2. Start the app

```bash
make run
```

Open **http://localhost:3000/demo** — this is your Loom teleprompter.

| URL | Purpose |
|---|---|
| `/demo` | 5-step judge walkthrough (start here for video) |
| `/benchmark` | 60% vs 70% numbers + fraud detection table |
| `/company/login` | Company dashboard — `demo@zarasourcing.com` / `demo123` |
| `/apply/general` | Candidate apply → private interview link |

## 3. Loom recording script (~5 min)

Follow `/demo` step by step:

1. **Benchmark** (30s) — `/benchmark` — "60% baseline, 70% agent, fraud 0/4 → 4/4"
2. **Company login** (30s) — one-click demo login on company page
3. **Apply flow** (optional 60s) — show private interview link + AR proctoring
4. **Wow moment** (90s) — dashboard → Alex Rivera → **Run GitHub Audit** → terminal citations
5. **Hot take** (30s) — benchmark page changelog: `list_repo_files` fix

**Best audit demos:** Alex Rivera (inflated resume), Raj Patel (broken code), Olaleye Oyewunmi (honest, verified).

## 4. Refresh benchmark data (optional, before submit)

```bash
make evaluate   # ~5 min, needs valid GEMINI_API_KEY
```

Updates `README.md`, `REPRODUCTION.md`, `backend/data/benchmark_results.json`, and trajectories.

If the key is invalid, evaluate stops immediately and keeps the last verified numbers.

## 5. Submit checklist

- [ ] Code + [CHANGELOG.md](./CHANGELOG.md)
- [ ] [REPRODUCTION.md](./REPRODUCTION.md) — `make evaluate`
- [ ] Loom video (link in submission form)
- [ ] Trajectories in [backend/data/trajectories/](./backend/data/trajectories/)
- [ ] Live URL: `[your-railway]/demo`

## Troubleshooting

| Problem | Fix |
|---|---|
| Agent fails instantly | Rotate `GEMINI_API_KEY` in `.env` and Railway |
| Port in use | `make stop` then `make run` |
| Empty candidates | Restart backend (auto-seeds 10 from dataset) |
| Live audit won't run | Confirm backend at `:8080` and key is valid |

```bash
make stop   # stop servers
```
