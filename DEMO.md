# ZaraSourcing — Demo Recording Script

> **Total runtime target: 3–5 minutes**
> Record in Chrome or Edge (required for Speech Recognition + AR).
> Have two terminal tabs open before you hit record.

---

## ⚡ Pre-Recording Checklist (do this BEFORE hitting record)

- [ ] `make run` is already running (backend :8080, frontend :3000)
- [ ] Browser open at `http://localhost:3000`
- [ ] Microphone + camera permissions already granted in Chrome
- [ ] `.env` has `GEMINI_API_KEY` set
- [ ] Good lighting for webcam (AR face tracking is a visual wow moment)
- [ ] Close Slack, notifications, other tabs

---

## 🎬 Scene 1 — The Problem (30 sec)

**Show:** Landing page at `http://localhost:3000`

**Say:**
> "Resume inflation is a real problem. A candidate claims they're an expert in Go concurrency and open-source contributions — ATS tools score them 100 out of 100 on keywords alone. ZaraSourcing fixes this with an end-to-end AI hiring pipeline: GitHub code auditing, a live AI voice interview, and Gemini scoring — no human interviewer needed."

**Action:** Briefly scroll the landing page, then click **"For Companies →"**

---

## 🎬 Scene 2 — Company Login & Job Setup (45 sec)

**Show:** `/company/login`

**Action:**
1. Click the demo credentials hint — fills in `demo@zarasourcing.com` / `demo123`
2. Click **Sign In**
3. Land on `/company/dashboard`

**Say:**
> "Companies log in and see their jobs in the sidebar."

**Action:**
4. Click **+ New** → type job title: `Senior Go Engineer` → type description: `Looking for a backend engineer with strong Go concurrency and REST API experience.` → click **Create Job**
5. Click **⚙ Interview Questions** on the new job
6. Add question: `"How do you handle race conditions in Go?"`
7. Add question: `"Walk me through how you'd design a REST API with SQLite WAL mode."`
8. Click **Save Questions**
9. Click **🔗 Copy Apply Link**

**Say:**
> "The company sets AI interview questions once. The link goes to candidates — no scheduling, no human interviewer."

---

## 🎬 Scene 3 — Candidate Applies (30 sec)

**Show:** Paste the apply link → opens `/apply/[jobId]`

**Action:**
1. Fill in: Name `Alex Rivera`, Email `alex@example.com`, GitHub `riveradevops`
2. Upload any PDF as resume (drag a dummy file)
3. Click **Submit Application →**

**Say:**
> "The candidate fills in their details, uploads their resume, and submits. They immediately get a unique interview link."

---

## 🎬 Scene 4 — The AI Interview Room (2 min — the main wow moment)

**Show:** Click the interview link → `/interview/[token]`

**Action:**
1. Read the checklist on screen, click **Start Interview →**
2. Allow mic + camera when prompted

**Say:**
> "This is the core of ZaraSourcing. Watch what happens."

**Action:**
3. The AI (AWS Polly) speaks the first question out loud — let it play
4. Point out the AR overlay on the webcam:
   - Green face mesh dots
   - Bounding box around face
   - `LOCKED ON` status label
5. After Polly finishes, mic auto-activates — speak an answer naturally:
   > *"I use mutexes and channels to coordinate goroutines, and I always run the race detector during testing..."*
6. Show the live transcription appearing in the text area in real time
7. Click **Next Question →**
8. Repeat briefly for question 2 (shorter answer is fine)
9. Click **Submit Interview ✓**

**Say:**
> "No buttons to press for the mic — it activates automatically after the AI finishes speaking. The AR overlay tracks gaze for proctoring. Every spoken word is transcribed live."

---

## 🎬 Scene 5 — Gemini Scores the Interview (30 sec)

**Show:** Score results screen after submit

**Say:**
> "Gemini scores all answers instantly — 0 to 100, a fit verdict, strengths, and gaps. The candidate sees it immediately."

**Point out:**
- The score percentage
- `STRONG FIT` / `POSSIBLE FIT` / `NOT A FIT` badge
- The written reasoning from Gemini

---

## 🎬 Scene 6 — Company Leaderboard (30 sec)

**Show:** Switch back to `/company/dashboard`

**Action:**
1. Scroll to **AI Interview Rankings** leaderboard
2. Show the candidate ranked with score + fit verdict + Gemini reasoning

**Say:**
> "Back on the company dashboard, the leaderboard updates automatically. The hiring team sees exactly who is the best fit and why — in seconds, not days."

---

## 🎬 Scene 7 — GitHub Audit (optional, 30 sec if time allows)

**Show:** Navigate to `/candidate/[id]` (legacy audit workspace)

**Action:**
1. Select a candidate (e.g. `Alex Rivera`)
2. Click **Run ZaraSourcing Audit**
3. Show the agent steps streaming in

**Say:**
> "ZaraSourcing also audits GitHub code against resume claims — verifying whether the candidate actually wrote what they claim, with file-level citations."

---

## 🎬 Scene 8 — Admin View (15 sec)

**Show:** `http://localhost:3000/admin`

**Action:** Show the 4 stat cards — companies, jobs, candidates, completed interviews

**Say:**
> "Super admins see platform-wide analytics across all companies."

---

## 🎬 Closing (15 sec)

**Show:** Back to landing page

**Say:**
> "ZaraSourcing — AI voice interviews, Gemini scoring, AR proctoring, and GitHub code auditing. The full hiring pipeline, no human interviewer required. Built with Go, Next.js, AWS Polly, and Gemini."

---

## 🛟 Backup Plan (if something breaks)

| Issue | Fix |
|---|---|
| Polly audio silent | Browser SpeechSynthesis kicks in automatically — just keep going |
| Speech Recognition not transcribing | Must be Chrome/Edge — check mic permissions in browser settings |
| AR not showing | Camera permission — click the camera icon in Chrome address bar |
| Backend not responding | `make run` in terminal, wait 5 sec, refresh |
| Score page blank | Check `.env` has `GEMINI_API_KEY` — fallback shows raw answers |
