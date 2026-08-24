# ITJobCafe

Swipe-first job discovery for students and new grads. Jobs come from a live
scraper feed (SQL Server); each job can be AI-scored against the user's
uploaded resume to produce a 1.0–5.0 fit score with strengths, gaps, and a
recommendation. Applications are always human-confirmed — nothing is ever
submitted automatically.

## Features

- **Auth** — email/password (bcrypt) and optional Google OAuth via NextAuth v5. Browsing the job feed is public; an account is needed for AI scoring, seen-history sync, and the dashboard/tracker/profile pages.
- **Swipe feed** — jobs read server-side from SQL Server with filters (type,
  city, recency, skill keywords); per-user seen-history so reviewed jobs don't resurface.
- **Resume upload** — .pdf/.docx stored in SQL Server; text extracted
  (pdf-parse / mammoth) for scoring.
- **AI scoring** — "Score next 10 jobs with AI" scores the next 10 unscored
  feed jobs against the user's latest uploaded resume via DeepSeek or
  Anthropic (server-side only, DB-cached).
- **Tracker** — interested / saved / applied pipeline with notes; server-persisted for logged-in users (survives reloads and devices).

## Architecture

- Next.js 16 App Router. Pages live in `app/`, with the authenticated app
  under the `app/(app)/` group (the feed is public; account pages live in a nested (protected) group whose layout enforces login).
- API routes in `app/api/` (auth, jobs, resume-upload, scoring) are the only
  code that touches secrets or the DB.
- `lib/db/*` + `lib/jobs/*` — pooled mssql access (read-only job feed; writes
  for users, resumes, seen-history, and the score cache).
- `lib/scoring/*` + `lib/ai/*` — provider-neutral scoring engine
  (`AI_PROVIDER=deepseek|anthropic`), see `SCORING.md`.
- `lib/careerOps/scoringService.ts` — the real scoring flow: resume text +
  job → model → `career_ops_scores` cache → `job.careerOpsScore` in the UI.

## Setup

1. `npm install`
2. `cp .env.example .env.local` and fill in every value (DB credentials,
   `AUTH_SECRET`, at least one AI provider key).
3. Database (SQL Server): run each script in `database/setup/` once against
   `ITJC_SCRAPPER` — see `database/` and `SQL_INTEGRATION.md`. (For the
   existing shared DB the tables already exist; see Migration below.)
4. `npm run dev` and open http://localhost:3000.

`npm run build` / `npm run start` for production; `npm run lint` to lint.

## Migration note (existing shared DB)

The app queries the production table names (`login_users`, `resume_upload`,
`career_ops_scores`, `user_job_seen`). If the database still has the old
`temp_*` names, run `database/migrate/rename-to-production.sql` once at
deploy time (renames in place, no data loss). The scraper-owned
`temp_tbl_Scrap_jobs` is not renamed.

## Known limitations

- **The profile is per-browser.** Job statuses and notes now persist
  server-side for logged-in users (`user_job_seen`) and follow you across
  devices; a one-time import preserves any pre-login localStorage state.
  Guests still swipe against `localStorage` only, and the editable profile
  (name, links, school, preferences) remains per-browser for everyone.
- The AI score cache also has a local file layer (`data/job-scores.json`,
  gitignored) used by the scoring engine's file-cache seam; the real flow
  caches in the DB.

## Reference docs

- `SCORING.md` — AI scoring pipeline, providers, caching, thresholds.
- `SQL_INTEGRATION.md` — SQL Server integration details and table map.
