# ZaraSourcing — Record this take

> **One script.** Official order. **≤ 5 minutes.** Last take was 7:11 and failed the rubric.
> **Record:** https://micro1-production.up.railway.app — Chrome **window only**, not the desktop.
> **Cue card:** https://micro1-production.up.railway.app/demo?record=1 (phone or second screen)

---

## Why the last take failed

| What happened | Why it kills the score |
|---|---|
| 7 min 11 s | Hard limit is 5:00 |
| ~80 s parked on the landing | Judges already know the headline |
| Blank dashboard, then empty Admin | Looks broken; interview scores are not the scored workflow |
| ~2 min in the live interview (Docker Q1) | Rubric is agent vs baseline, not Polly |
| Full desktop + bookmark bar | Looks like a homework capture, not a product |
| Never hit CHANGELOG or REPRODUCTION.md | Official beats 5–7 were missing |

**Do not follow the old 5:30 interview-heavy timing.** That script is deleted.

---

## Setup (2 minutes, before record)

1. Chrome **incognito**. Hide bookmarks: **⌘⇧B**. Close extra tabs.
2. Record **this Chrome window only** (not Entire Screen, not the menu bar).
3. Put `/demo` on your phone or a second monitor. That page is the teleprompter + clock.
4. In the recorded window, pre-open **five tabs**:

   | Tab | URL |
   |---|---|
   | Landing | https://micro1-production.up.railway.app/ |
   | Benchmark | https://micro1-production.up.railway.app/benchmark |
   | Alex report | https://micro1-production.up.railway.app/report/riveradevops |
   | Dashboard | login `demo@zarasourcing.com` / `demo123` → `/company/dashboard` |
   | Changelog | https://github.com/Junnygram/micro1/blob/main/CHANGELOG.md |

5. Confirm Alex is **45%** and the dashboard is **not blank**. If blank, stop — redeploy, do not record.
6. **Never** open `/company/admin`. **Never** click Run GitHub Audit on Alex.

---

## Script (read these lines)

Official order: problem → baseline → one run → comparison → changelog → keep / one removal → reproduce.

### 0:00–0:40 · Landing `/`

> Recruiters have to decide if resume claims are real. An ATS scores keywords. Checking GitHub by hand takes fifteen minutes. That is the bottleneck.

Stay on the hero. Do not scroll.

### 0:40–1:10 · `/benchmark`

> Baseline: one prompt, resume only, no tools. Sixty percent. It clears four inflated resumes because they read well. That is today’s first pass.

Point at **6/10** and fraud **1/5**. Do not scroll the table yet.

### 1:10–2:40 · `/report/riveradevops` then dashboard → Alex

> Same case, agent. Alex claims Docker and Helm. The agent listed repos, opened terraform-templates, found only an empty README, marked exaggerated, forty-five percent. Baseline said verified. The recruiter still decides.

Scroll the claim + evidence. Then dashboard → **Alex Rivera** → View audit replay. Do **not** re-run the audit.

### 2:40–3:20 · `/benchmark` table

> Ten cases, both arms. Agent seventy percent. Fraud five of five versus one of five. It also over-flagged three honest engineers. That trade is in the changelog.

Point at **7/10**, **5/5**, then the red X rows.

### 3:20–4:10 · GitHub `CHANGELOG.md`

> Iteration 1 added tools and caught the frauds. The failure: the agent guessed file paths and treated not-found as proof. Iteration 2 added list_repo_files. We removed a fake web-intel tool that never helped.

Point at Iteration 1, Iteration 2, and **Removed**.

### 4:10–4:40 · `REPRODUCTION.md` (skip interview if the clock is past 4:10)

> A second person can run the same ten cases from a clean clone. make verify-benchmark needs no key. make evaluate needs Gemini and takes about two minutes. Trajectories are in the repo.

Optional 15 seconds: first spoken line is *Hello, how are you doing? Can you tell me about yourself?* Then leave.

### 4:40–5:00 · Close

> The agent recommends. A person signs the hire. Demo, changelog, and trajectories are in the submission. Thank you.

**Stop.** Do not keep talking.

---

## Do not say

- Two-question demo
- Seventy percent interview score
- The AI hires people

---

## If something breaks

| Issue | Say, then move on |
|---|---|
| Dashboard blank | “Seeded report still proves the case” → stay on `/report/riveradevops` |
| Clock past 4:10 | Skip interview. Close on CHANGELOG or REPRODUCTION. |
| You freeze | Read the `/demo` cue card. One sentence. Next beat. |

---

## After the take

- [ ] Length ≤ 5:00 (Loom or QuickTime trim if you went 5:10)
- [ ] Window-only, no bookmark bar
- [ ] Official order visible: landing → benchmark → Alex → table → changelog
- [ ] Upload to HackerEarth. Last upload before the deadline wins.
