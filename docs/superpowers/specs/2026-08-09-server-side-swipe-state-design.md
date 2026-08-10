# Server-Side Swipe/Application State — Design

**Date:** 2026-08-09
**Goal:** A logged-in user's pipeline (job statuses + notes) persists server-side, so the
Applications tracker and Dashboard survive reloads and follow the user across devices.
Today they are localStorage-only and, worse, the feed's seen-exclusion (`NOT EXISTS` on
`user_job_seen`) means previously swiped jobs never come back from `/api/jobs` — so a
logged-in user's tracker empties on every reload (statuses in localStorage point at job
data that no longer arrives).

## Decisions (approved)

- **Scope:** statuses + notes only. The profile (name, links, school, preferences) stays
  in localStorage — separate future project.
- **Guests:** unchanged. localStorage remains the guest store; guests trigger zero new
  API calls.
- **Data model:** extend `user_job_seen` (no new table). `LastAction` becomes the full
  pipeline status; new columns for notes + a job snapshot. One MERGE per change keeps
  "seen" and "status" atomic — feed exclusion and tracker read the same rows, so they
  can never drift.
- **Migration/import:** one-time import of localStorage statuses/notes on login
  (covers both guest→account conversion and existing users' orphaned pipelines).
  Existing server rows always win conflicts.
- **Snapshot at swipe time:** the scraper owns `temp_tbl_Scrap_jobs` and may delete or
  replace jobs. Each state write snapshots title/company/location/url so tracked jobs
  outlive scraper churn; the tracker read prefers live job data and falls back to the
  snapshot.

## Section 1 — Data model & migration

`user_job_seen` (existing key: unique `(LoginUserID, JobReference, SourceTable)`,
FK to `login_users`) gains five nullable columns:

| Column | Type | Purpose |
|---|---|---|
| `Notes` | `NVARCHAR(MAX)` | Application notes (Review & Apply modal) |
| `JobTitle` | `NVARCHAR(500)` | Snapshot at write time |
| `JobCompany` | `NVARCHAR(500)` | Snapshot |
| `JobLocation` | `NVARCHAR(500)` | Snapshot |
| `JobUrl` | `NVARCHAR(2000)` | Snapshot (apply link) |

`LastAction NVARCHAR(50)` (existing) now stores the full `SwipeJobStatus` set minus
`"new"`: `interested | saved | ready | applied | interview | rejected | skipped`.
Existing rows already hold a valid subset (`interested/saved/skipped/applied`); their
snapshot columns stay NULL (their data was orphaned anyway — the live join fills in
whatever the scraper still has). The legacy `"viewed"`/unknown actions still normalize
to NULL, exactly as the route does today.

Scripts, following the repo's idempotent patterns:

- `database/setup/create-user-job-seen.sql` — updated so fresh installs create the new
  columns.
- `database/migrate/` — new script adding the columns via
  `IF COL_LENGTH('dbo.user_job_seen', '<col>') IS NULL ALTER TABLE ...` (run once in
  DBeaver against the live DB, same procedure as `rename-to-production.sql`).

**Deliberate non-changes:** the feed's `NOT EXISTS` exclusion query, its indexes, and the
"once swiped, never in the deck again" behavior are untouched.

## Section 2 — API surface

All three routes require a session (401 backstop), run `nodejs`/`force-dynamic`, and use
the existing pooled, parameterized repository pattern (`lib/jobs/userJobSeenRepository.ts`
grows the new reads/writes; job mapping reuses `lib/db/jobsRepository.ts` helpers).

1. **`GET /api/jobs/tracked`** (new) — the user's pipeline. `TOP 500` of the user's
   `user_job_seen` rows ordered by `UpdatedAt DESC`, `LEFT JOIN` the jobs table on
   `JobReference`. Returns `{ ok, count, jobs }` where each entry is a `JobListing`
   (live row when the scraper still has the job; otherwise built from the snapshot with
   an empty description) plus `status` and `notes`. The 500 cap bounds the payload; the
   oldest rows age out of the tracker view (disclosed limitation).

2. **`POST /api/jobs/seen`** (extended in place) — body grows from
   `{ jobReference, action }` to
   `{ jobReference, status, notes?, snapshot? { title, company, location, url } }`.
   The existing MERGE upserts status + notes + snapshot together. Validation mirrors
   today's: unknown status → recorded as seen with NULL action; missing
   `jobReference` → 400. (`action` remains accepted as an alias for `status` during the
   transition so an out-of-date client can't break.)

3. **`POST /api/jobs/seen/import`** (new) — one-time bulk import: array of
   `{ jobReference, status, notes? }`. No snapshots — localStorage stores only
   ids/statuses/notes, and the import runs before any jobs are fetched; the tracked
   read resolves live job data by reference (recently swiped jobs are almost always
   still in the scraper table). The client truncates to the 500 most recent entries;
   the server rejects larger payloads with 400. Inserts only rows that don't already
   exist for the user — existing server rows always win. Existing rows whose `Notes`
   are NULL do get the imported notes filled in (statuses are never overwritten).
   Returns `{ ok, imported, skipped }`.

## Section 3 — Store & client changes (`lib/swipe/swipeStore.tsx`)

Tracked jobs merge into the store's `jobs` array, so the Applications board, Dashboard,
and metrics work unchanged — they already filter that array for `status !== "new"`.

- **Hydration (logged in):**
  1. Read localStorage (profile as today; statuses/notes only as import source).
  2. If the import flag `itjobcafe.swipe.imported.<email>` is absent and localStorage
     has statuses/notes → `POST /api/jobs/seen/import` with `{ jobReference, status,
     notes? }` entries (no snapshots — see Section 2). Set the flag only on success. On
     success the stored statuses/notes are cleared (profile kept), so on a shared
     browser only the first account to log in absorbs the guest pipeline.
  3. Fetch `/api/jobs` and `/api/jobs/tracked` in parallel. `jobs` = tracked jobs
     (server status + notes) + feed jobs (all `"new"`). No overlap is possible — the
     feed excludes seen jobs server-side. Notes state seeds from the tracked response.
     localStorage statuses are **not** applied when logged in.
- **Hydration (guest):** exactly today's path.
- **Sync writes:** `markSeen` generalizes to `syncJobState(job, status, notes?)` —
  fire-and-forget POST to `/api/jobs/seen` with the snapshot pulled from the in-memory
  job. Called from `decide()`, `markApplied()`, **`setStatus()`** (pipeline-board moves
  finally sync), and the notes commit (`setNotes` — only called on discrete saves, not
  per keystroke). Keeps a dedupe ref keyed by (job, status, notes) so React
  double-fires don't re-POST. Each write MERGEs the full state for that job, so a lost
  fire-and-forget write self-heals on the job's next touch.
- **Persistence effect:** for logged-in users the localStorage write of statuses/notes
  becomes irrelevant to loads (server wins) but stays harmless; guests rely on it as
  today.
- **Behavior change, disclosed:** the header **Reset** no longer clears a logged-in
  user's pipeline — it re-fetches feed + tracked state (server survives). No
  delete-server-state endpoint in this project. Guest Reset behaves as today.

## Section 4 — Error handling

- `GET /api/jobs/tracked` fails → feed still loads and swiping works; Applications and
  Dashboard show an inline banner ("Couldn't load your saved pipeline — refresh to
  retry", styled like the swipe page's feed-error banner) above whatever session-local
  data exists. Store exposes this as a separate `pipelineError` field.
- Sync POST fails → `console.warn` only (parity with today's `markSeen`); optimistic UI
  stands; self-heals on next touch of that job.
- Import fails → warn, flag stays unset, retried on next load. Import success but
  tracked re-fetch failure → banner as above.
- Guests: zero new calls. All routes 401 without a session.

## Section 5 — Verification (no test framework; build + smoke)

1. `npm run build` + `npm run lint` clean.
2. **Logged in:** swipe several jobs, mark one applied with notes → reload →
   Applications/Dashboard still show everything (the core bug, fixed). Move a card
   interested → interview on the board → reload → move persisted. Second browser, same
   account → same pipeline (cross-device).
3. **Guest → convert:** swipe as guest → sign up → pipeline imported once; the flag
   prevents re-import on later loads.
4. **Churn:** point a test seen row at a dead `JobReference` → the tracked job renders
   from its snapshot (title/company/location/url, no description).
5. Feed exclusion still works: swiped jobs never reappear in the deck.

## Section 6 — Docs

- `README.md` known-limitations: shrink to "the profile is per-browser"; statuses/notes
  are server-side for logged-in users (guests remain per-browser).
- `SQL_INTEGRATION.md`: document the extended `user_job_seen` write path in the
  read-only-guarantee section (which today under-documents that table's writes) and the
  new tracked/import routes.

## Out of scope

- Profile persistence (separate project).
- Any change to feed exclusion, scoring, or cost controls.
- Deleting/exporting server-side state; retry queues or offline sync.
- Google OAuth / HTTPS work.
