# Railway deployment (backend + frontend)

Deploy as **two services** so judges can reproduce your Loom demo.

## Your Railway URLs

| Service | URL |
|---|---|
| **Frontend** (submit this) | https://micro1-production.up.railway.app |
| **Backend API** | https://zarasourcing-production.up.railway.app |
| **Judge walkthrough** | https://micro1-production.up.railway.app/demo |
| **Fraud proof (no login)** | https://micro1-production.up.railway.app/report/riveradevops |

### ⚠️ Critical: connect frontend → backend

The frontend build must know the backend URL. On Railway **frontend service**:

```
NEXT_PUBLIC_API_URL=https://zarasourcing-production.up.railway.app
```

Set this variable, then **Redeploy** (rebuild). Without it, login/benchmark/demo API calls hit `localhost:8080` and fail for judges.

Verify after redeploy: open `/demo` → one-click demo login should reach the dashboard.

---

## Backend service

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build | `go build -o backend_binary main.go` |
| Start command | `WORKSPACE_DIR=. ./backend_binary` |

**Environment variables:**

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Recommended | Live agent fallback |
| `AWS_ACCESS_KEY_ID` | Recommended | Bedrock agent + **Polly TTS (interview voice)** |
| `AWS_SECRET_ACCESS_KEY` | Recommended | Same |
| `AWS_REGION` | Recommended | e.g. `us-east-1` |
| `LLM_PROVIDER` | Optional | `bedrock` (default when AWS set) |
| `PORT` | Auto | Railway sets this |

**Persistent volume (required for demo data):** mount `/app/data` so SQLite + seeded candidates survive redeploys.

## Frontend service

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build | `npm install && npm run build` |
| Start | `npm start` |

**Build-time variable (required):**

```
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.up.railway.app
```

⚠️ Must be set **before** `npm run build`. If wrong, frontend calls localhost and nothing works for judges.

---

## Post-deploy smoke test (match your Loom)

Replace `FRONTEND` and `BACKEND` with your Railway URLs.

```bash
# 1. Backend alive
curl https://BACKEND/api/health
# → {"status":"ok"}

# 2. Polly voice (optional — interview falls back to browser TTS if this fails)
curl -I "https://BACKEND/api/speak?text=hello"
# → Content-Type: audio/mpeg

# 3. Seeded demo data
curl "https://BACKEND/api/demo/report?github=riveradevops"
# → candidate + audits JSON
```

**In browser (Chrome):**

| # | URL | Pass criteria |
|---|---|---|
| 1 | `https://FRONTEND/demo` | 6-step guide loads |
| 2 | `https://FRONTEND/benchmark` | Shows 60% / 70% |
| 3 | `https://FRONTEND/report/riveradevops` | Fraud report, no login |
| 4 | `https://FRONTEND/company/login` | Demo login works |
| 5 | `https://FRONTEND/apply/devops_job` | Apply → interview link |
| 6 | Interview link | Allow mic → hear AI voice → speak → auto-advance |

---

## Audio on deploy

| Layer | How it works |
|---|---|
| **AI speaks questions** | Backend `/api/speak` → AWS Polly MP3 |
| **Polly unavailable** | Interview auto-falls back to browser `SpeechSynthesis` |
| **Candidate speaks answers** | Chrome/Edge Web Speech API (requires HTTPS) |
| **Your Loom recording** | Unmute browser tab; use same deployed URL as submission |

Judges need **Chrome or Edge** for the voice interview step. Steps 1–4 and 6 work in any browser without mic.

---

## Demo credentials

- Email: `demo@zarasourcing.com`
- Password: `demo123`

## Submit these URLs

- **Live app:** `https://FRONTEND/company/login`
- **Judge walkthrough:** `https://FRONTEND/demo`
- **Public proof:** `https://FRONTEND/report/riveradevops`
