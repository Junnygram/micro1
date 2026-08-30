# Quick Start — Demo, Loom & Judge Reproducibility

**Goal:** Your Loom video and the live URL judges click should show the **same thing**.

Record on your **deployed Railway URL**, not localhost. Follow **[WALKTHROUGH.md](./WALKTHROUGH.md)** (same flow as `/demo`).

---

## 1. Deploy (so judges match your video)

Two Railway services from this repo — see [DEPLOY.md](./DEPLOY.md).

| Service | Critical setting |
|---|---|
| **Backend** | `GEMINI_API_KEY`, `AWS_*` (Polly voice + Bedrock agent), volume on `data/` |
| **Frontend** | `NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.up.railway.app` **at build time** |

After deploy, open: `https://YOUR-FRONTEND.up.railway.app/demo`

---

## 2. What works without API keys (judge-safe)

These use **seeded data** — always work on deploy:

| Step | URL | What judges see |
|---|---|---|
| Benchmark | `/benchmark` | 60% vs 70%, fraud 1/5 → 5/5 |
| Public fraud report | `/report/riveradevops` | Alex Rivera inflation + evidence |
| Demo login | `/company/login` → `demo@zarasourcing.com` / `demo123` | 10 candidates, seeded audits |
| Dashboard | `/company/dashboard` | Rankings, composite scores |
| Instant apply audit | `/apply/devops_job` with GitHub `riveradevops` | Audit appears on dashboard |

**Do not click "Run GitHub Audit" on seeded Alex Rivera** — view seeded results only (live run needs keys and wipes demo).

---

## 3. Voice interview + audio (Step 5)

| Requirement | Why |
|---|---|
| **HTTPS** (Railway default) | Mic/camera blocked on HTTP |
| **Chrome or Edge** | Web Speech API for transcription |
| **Allow mic + camera** | Interview proctoring + recording |
| **AWS Polly on backend** (optional) | Neural AI voice via `/api/speak` |
| **No AWS?** | Browser TTS fallback speaks questions automatically |

**Loom tip:** In the video, say *"Allow microphone when prompted"* before clicking Start Interview. Unmute your Loom tab so judges hear Polly or browser voice.

---

## 4. Loom script (~5 min) — use deployed URL

Open `https://YOUR-FRONTEND/demo` and follow steps:

1. **Benchmark** (30s) — `/benchmark` — numbers + fraud table  
2. **Fraud report** (45s) — `/report/riveradevops` — public, no login  
3. **Demo login** (30s) — one-click → dashboard  
4. **Alex audit** (60s) — dashboard → Alex Rivera → **view** seeded claims (don't re-run)  
5. **Interview** (90s, optional) — `/apply/devops_job` → interview link → Chrome, allow mic  
6. **Reproduce** (30s) — GitHub + `make evaluate` in REPRODUCTION.md  

Paste the **same frontend URL** in HackerEarth that you used in Loom.

---

## 5. Local dev (optional)

```bash
cp .env.example .env   # GEMINI_API_KEY + AWS creds
make setup && make run
```

Open http://localhost:3000/demo — same flow, but **submit the Railway URL**, not localhost.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Frontend can't reach API | Rebuild frontend with correct `NEXT_PUBLIC_API_URL` |
| No AI voice | Set `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` on backend, or use Chrome (browser TTS fallback) |
| Mic not working | Must be HTTPS + Chrome/Edge; click Allow |
| Empty candidates | Redeploy backend with SQLite volume mounted on `data/` |
| Live audit fails | Use seeded views; rotate `GEMINI_API_KEY` or set Bedrock AWS creds |

```bash
make evaluate   # Reproduce benchmark numbers locally (needs valid API key)
```

---

## Submit checklist

- [ ] Railway frontend URL in submission form  
- [ ] Loom recorded on **that same URL**  
- [ ] `/demo` page loads on deploy  
- [ ] `/report/riveradevops` works without login  
- [ ] [REPRODUCTION.md](./REPRODUCTION.md) linked for `make evaluate`  
- [ ] Trajectories in `backend/data/trajectories/`
