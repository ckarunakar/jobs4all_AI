# Production Cleanup & Go-Live Design — ITJobCafe

**Date:** 2026-07-25
**Goal:** Remove all demo scaffolding, mock code paths, and stale artifacts from the ITJobCafe app so the codebase is production-ready, then publish it to the new `jobs4all_AI` GitHub repository for collaborator review.

## Decisions (approved)

- The mock data / fake scoring path is **deleted entirely** — no dev-mode mock fallback is kept.
- The Settings page is **rebuilt as a minimal real page** (account info + sign out).
- The four **app-owned** database tables are renamed to production names; the scraper-owned `temp_tbl_Scrap_jobs` is untouched.
- Branding stays **ITJobCafe** (the repo name `jobs4all_AI` is just a repo name).
- The repo ships with a real README, a placeholder-only `.env.example`, the reorganized DB scripts, and the cleaned-up `SCORING.md` / `SQL_INTEGRATION.md`.
- Chosen approach: **surgical polish** — the localStorage swipe-state limitation ships as-is but is disclosed in the README; server-side persistence is the top post-review follow-up.

## Section 1 — Code cleanup & demo removal

### Deletions

| Target | Reason |
|---|---|
| `lib/mockData/` (`swipeJobs.ts`, `swipeProfile.ts`) | 15 hardcoded mock jobs + mock default profile |
| `lib/scoring/demoCandidate.ts` | Demo candidate profile used only as a scoring fallback |
| `lib/scoring/providers/mockProvider.ts` | Fake scoring provider |
| `lib/careerOps/swipeAdapter.ts` | Generates fabricated score breakdowns; never calls real Career-Ops |
| `components/swipe/DevClearSeenButton.tsx` | Un-gated dev tool rendered to all users |
| Legacy mock branch in `app/api/scoring/score-batch/route.ts` | Dead once mock providers are gone |
| `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | Unused create-next-app boilerplate |

### Ripple-effect changes forced by the deletions

1. **Job detail modal** (`components/swipe/JobDetailModal.tsx`): switches from `swipeAdapter`'s fabricated breakdowns to real Career-Ops score data (fit score, strengths, gaps, recommendation) sourced from the scoring API via `ScoresProvider`. When no score exists yet, it shows an explicit "not scored yet" state.
2. **`USE_REAL_JOBS` flag removed**: with mock jobs deleted the flag has no false-branch. `lib/config.ts` drops it; `NEXT_PUBLIC_USE_REAL_JOBS` is removed from env files and docs. The app always uses the SQL job feed.
3. **Scoring profile fallback** (`lib/scoring/resolve.ts`): instead of silently substituting the demo candidate profile when a user has no resume, the API returns a clear, human-readable "upload a resume to get scored" response (4xx) that the UI surfaces.
4. **Swipe store default profile** (`lib/swipe/swipeStore.tsx`): seeds from a new neutral empty-profile constant defined in `lib/swipe/` instead of the deleted mock profile.

### Renames & copy cleanup

- Page components renamed: `Demo2SettingsPage` → `SettingsPage`, `Demo2DashboardPage` → `DashboardPage`, `Demo2ApplicationsPage` → `ApplicationsPage`, `Demo2ProfilePage` → `ProfilePage`.
- Landing (`app/page.tsx`) and login (`app/login/page.tsx`) copy loses all demo language ("Open Swipe Demo", "Login to see demo", "Frontend MVP · mock data · Career-Ops integration via adapter layer") in favor of production ITJobCafe copy.
- TODO comments tied to deleted mock code are removed. Two legitimate TODOs remain: the localStorage persistence note in `lib/swipe/swipeStore.tsx` (the documented follow-up) and the score-cache note in `lib/scoring/scoreCache.ts`, corrected to reference `SCORING.md` (it currently points to a nonexistent `SCORE.md`).

### Settings page rebuild

`app/(app)/settings/page.tsx` is rebuilt as a minimal real page: an account section showing the signed-in user's name and email from the NextAuth session, and a sign-out button. The Mock Mode toggle, disabled fake API-key field, demo billing copy, and `DevClearSeenButton` are all removed.

## Section 2 — Database, config, and docs

### Table renames (app-owned tables only)

| Current (live) | Production |
|---|---|
| `temp_login_users` | `login_users` |
| `temp_tbl_resume_upload` | `resume_upload` |
| `temp_tbl_career_ops_scores` | `career_ops_scores` |
| `temp_user_job_seen` | `user_job_seen` |

`temp_tbl_Scrap_jobs` is scraper-owned and stays untouched.

### `database/` reorganization

- `database/setup/` — the four CREATE scripts rewritten with production table names (for standing up a fresh environment), plus the index-recommendations script. The two historical "add column" migrations (`add-login-user-id-to-resume-upload.sql`, `add-resume-text-column.sql`) are folded into the rewritten CREATE scripts and noted as already applied to the live DB.
- `database/migrate/rename-to-production.sql` — a single `sp_rename`-based script run **once against the live ITJC database at cutover**, renaming the four existing tables in place (no data loss).

**Cutover coordination:** the pushed code expects the new table names, so the rename script must run before/at deploy. The README documents this explicitly.

### Code references updated to new table names

`lib/auth/users.ts`, `lib/db/sqlServer.ts`, `lib/jobs/userJobSeenRepository.ts`, `lib/careerOps/scoringService.ts`, `auth.ts`, and any other query sites found during implementation.

### Env & secrets

- `.env.local.example` is replaced by `.env.example` containing **placeholder values only**, one line-comment per variable. The real DB host (`<db-host>`) currently hardcoded there is removed, as is `NEXT_PUBLIC_USE_REAL_JOBS`.
- The real DB IP is also removed from `SCORING.md` and `SQL_INTEGRATION.md`.
- `.env.local` remains untracked (verified: covered by `.gitignore`, not in `git ls-files`).
- **Pre-share rotation checklist (user action, before collaborators get access):** rotate the Google OAuth client secret, `AUTH_SECRET`, the SQL Server password, and the Anthropic and DeepSeek API keys — all have been sitting in plaintext in the local working tree.

### Docs

- **README.md** — rewritten to describe the app as it actually is: feature overview (credential + Google OAuth auth, SQL-fed swipe job discovery, resume upload with PDF/DOCX parsing, AI scoring via DeepSeek/Anthropic), architecture sketch, setup steps (env vars, DB setup scripts, `npm run dev`), and a **Known Limitations** section disclosing that swipe/application state is stored in browser localStorage, with server-side persistence as the planned follow-up.
- **SCORING.md** — fix the stale `ClaudeScoringProvider` / `lib/scoring/providers/claudeProvider.ts` reference to match the real provider structure (`aiProvider.ts`; `mockProvider.ts` reference removed along with the file). Rest kept.
- **SQL_INTEGRATION.md** — table names updated, real IP removed. Rest kept.

## Section 3 — Error handling, verification, and push

### Error handling

The two behavior-adjacent changes fail soft:
- Unscored job in the detail modal → explicit "not scored yet" UI state.
- Scoring request for a user with no resume → 4xx with a human-readable reason; UI prompts the user to upload a resume. No crashes, no fabricated scores.

### Verification (no test framework exists; build + smoke)

1. `npm run build` and `npm run lint` pass clean.
2. Grep sweep across `app/`, `lib/`, `components/`, `database/`, `README.md`, `SCORING.md`, and `SQL_INTEGRATION.md` (excluding `docs/superpowers/`, which legitimately discusses the demo history) proves zero remaining hits for: `mock`, `demo`, `Demo2`, `temp_login_users`, `temp_tbl_resume_upload`, `temp_tbl_career_ops_scores`, `temp_user_job_seen`, `<db-host>`.
3. Manual smoke test on the dev server: signup → login → swipe real jobs → open job detail (real score or "not scored yet") → resume upload → profile → new Settings page → sign out. **Ordering constraint:** the cleaned code queries the new table names, so the user runs `database/migrate/rename-to-production.sql` against the live ITJC database before the DB-touching smoke steps. Until then, only non-DB checks (build, lint, grep sweep, page rendering) can be verified.

### Git & push

1. Commit the work to local `main` as a small number of logical commits (e.g. *remove demo/mock code*, *rename DB tables + reorganize scripts*, *docs & env template*) so reviewers can read the history.
2. Pre-push safety check: `git status` / `git ls-files` confirm `.env.local` and all secrets are untracked; grep sweep is clean.
3. Push: `git remote add origin https://github.com/ckarunakar/jobs4all_AI.git`, `git branch -M main`, `git push -u origin main`.
4. Secret rotation (checklist above) completes before the repo is shared with collaborators.

## Out of scope (follow-ups)

1. **Server-side persistence of swipe/application state** (replace localStorage in `lib/swipe/swipeStore.tsx` with API-backed storage) — top follow-up, gets its own spec.
2. Renaming scraper-owned `temp_tbl_Scrap_jobs`.
3. Replacing the file-based score cache (`data/job-scores.json`) with a DB-backed store.
4. Any new user-facing features.
