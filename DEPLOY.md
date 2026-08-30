# Railway deployment (backend + frontend)

Deploy as **two services** from this monorepo.

## Backend service

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Start command | `WORKSPACE_DIR=. ./backend_binary` or `go run main.go` |
| Build | `go build -o backend_binary main.go` |

**Environment variables:**
- `GEMINI_API_KEY` — required for live agent
- `PORT` — Railway sets automatically
- `WORKSPACE_DIR` — `.`

**Persistent volume (recommended):** mount `/app/data` so SQLite survives redeploys.

## Frontend service

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |

**Build-time variable (required):**
- `NEXT_PUBLIC_API_URL` — your backend Railway URL, e.g. `https://zarasourcing-api.up.railway.app`

## Post-deploy smoke test

1. `GET [backend]/api/health` → `"status":"ok"`
2. `[frontend]/demo` → loads
3. `[frontend]/benchmark` → shows 60% vs 70%
4. Company login → **Audit Alex Rivera** banner works

## Demo credentials

- Email: `demo@zarasourcing.com`
- Password: `demo123`
