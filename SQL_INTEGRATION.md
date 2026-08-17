# SQL Server Job Feed (read-only)

The swipe app reads all jobs from the client's Microsoft SQL Server (the
**`ITJC_SCRAPPER`** database) — this is the only job source. The integration is **read-only**
and **server-side only** — credentials never reach the browser, and the app never writes to the
jobs table.

## Data flow

```
SQL Server: ITJC_SCRAPPER.dbo.temp_tbl_Scrap_jobs  (single table, description inline)
   │  parameterized SELECT (read-only), key = job_reference
   ▼
lib/db/jobsRepository.ts ──► JobListing[]        (types/jobListing.ts)
   ▼
app/api/jobs/route.ts  GET /api/jobs
   ▼  (client fetch)
lib/jobs/jobListingToSwipeJob.ts ──► SwipeJob[]
   ▼
lib/swipe/swipeStore.tsx ──► swipe deck / cards
```

## Setup (`.env.local`)

Copy `.env.example` → `.env.local` and fill in the DB section (gitignored):

```env
DB_SERVER=<your-db-host>
DB_INSTANCE=            # leave blank when DB_PORT is set (see below)
DB_PORT=1435
DB_DATABASE=ITJC       # processed jobs live in ITJC (tbl_JobMaster + TBl_Job_Description)
DB_USER=...
DB_PASSWORD=...
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

> The query uses fully-qualified `ITJC.dbo.*` table names, so the SQL login must have read
> access to the `ITJC` database.

Then:

```bash
npm run dev     # or: npm run build && npm run start
```

## Connection method: `server + port` vs `server\instance`

SQL Server can be reached two ways; **which works depends on the server config**.
✅ **Confirmed working for this DB: `server + port` (`<your-db-host>:1435`, no instance name).**

- **`server` + static `port` (default here).** A static port is provided (`1435`), so the
  client connects with `server: <your-db-host>, port: 1435` and **no instance name**. Use this
  first. A static port and an instance name conflict (a named instance is normally resolved to
  a dynamic port via the SQL Browser service on UDP 1434) — so `DB_INSTANCE` is ignored whenever
  `DB_PORT` is set.
- **`server\instance` (no static port).** If the port route fails, clear `DB_PORT` and set
  `DB_INSTANCE=ITJOBCAFESERVER`. This requires the SQL Browser service to be reachable (UDP 1434).

Config lives in [`lib/db/sqlServer.ts`](lib/db/sqlServer.ts). **This environment couldn't test
the live connection**, so try `server + port` first; if it fails, switch to the instance form and
note which one worked. `DB_ENCRYPT`/`DB_TRUST_SERVER_CERTIFICATE` map straight to the `mssql`
`options.encrypt` / `options.trustServerCertificate` flags.

## Test it

```bash
curl 'http://localhost:3000/api/jobs?limit=5'
curl 'http://localhost:3000/api/jobs?search=engineer&state=CA'
```

Returns `{ ok: true, source: "sql-server", count, jobs: JobListing[] }`. Then open `/swipe` — it
loads real jobs (loading skeleton → cards), swiping persists by job `id`, and the detail panel
shows the full cleaned description (falling back to BriefInfo).

### Query parameters (`/api/jobs`)

`limit` (1–200, default 100), `search` (Title/Company/BriefInfo), `state`, `city`, `jobType`.
**All values are bound parameters** — no user input is concatenated into SQL.

## Current query

Reads the single table `ITJC_SCRAPPER.dbo.temp_tbl_Scrap_jobs` (descriptions are inline — no join):

```sql
WITH filtered AS (
  SELECT job_reference, Title, company, city, state, zip, Location, url,
         job_type, posted_at, description,
         ROW_NUMBER() OVER (PARTITION BY company ORDER BY NEWID()) AS companyRank
  FROM ITJC_SCRAPPER.dbo.temp_tbl_Scrap_jobs
  WHERE Title IS NOT NULL [ + parameterized filters ]
)
SELECT TOP (@limit) ...aliased cols...
FROM filtered
ORDER BY companyRank, NEWID();
```

- **Key is `job_reference`** (unique) — used as `JobListing.id` and the scoring cache `JobID`.
- **Variety:** round-robins across companies (rank 1 of every company first, shuffled), so the
  top N is a diverse, reshuffled-each-load sample. This random sort is a full scan — acceptable
  at current volume; use `ORDER BY posted_at DESC` for newest-first.
- Rows missing `job_reference` or `Title` are skipped; `description` is inline (HTML-stripped);
  `location` is built from `city/state/zip`, falling back to the `Location` column.
- The table also has `country`, `Isremote` (0/1), `category`, and `cpc` columns that are **not**
  mapped to cards (remote type is inferred from text; no compensation chip; no category tags).

## Resume uploads (write)

The Profile page can upload a real resume (`.pdf`/`.docx`) to SQL Server — the
**one write path** in the app (everything else is read-only).

- **Table:** `ITJC_SCRAPPER.dbo.resume_upload` — create it **once** by running
  [`database/setup/create-resume-upload.sql`](database/setup/create-resume-upload.sql)
  in DBeaver (connected to `ITJC_SCRAPPER`). The script is idempotent (`IF OBJECT_ID ... IS NULL`).
- **API:** `POST /api/resume-upload` ([app/api/resume-upload/route.ts](app/api/resume-upload/route.ts)) —
  accepts `multipart/form-data` (`resume` file + `fullName`/`email`/`phone`), validates extension
  (`.pdf`/`.docx`), MIME, and size (≤ 5 MB), then **parameterized-inserts** the file as
  `VARBINARY(MAX)`. Name/email come from the profile store; the returned DB row `ID` is kept on the
  resume so it can later be read by AI for scoring.
- **Cross-database note:** the app connects to `DB_DATABASE=ITJC`, so the insert uses the
  fully-qualified `ITJC_SCRAPPER.dbo.resume_upload`. The DB login needs **INSERT** permission
  on `ITJC_SCRAPPER` (uploads are the app's only write). No new env vars — reuses the existing DB config.
- **Confirm a row landed:** in DBeaver run
  `SELECT ID, FirstName, LastName, Email, ResumeName, FileType, DATALENGTH(Resume) AS Bytes, uploadDate
   FROM ITJC_SCRAPPER.dbo.resume_upload ORDER BY ID DESC;`

## Pipeline state (write + read-back)

Logged-in users' swipe statuses and notes persist in `user_job_seen`
(`LastAction` = full pipeline status, plus `Notes` and snapshot columns —
run `database/migrate/add-pipeline-state-to-user-job-seen.sql` once).
`POST /api/jobs/seen` upserts one job's state; `GET /api/jobs/tracked`
returns the pipeline (TOP 500, newest first, live join with snapshot
fallback); `POST /api/jobs/seen/import` is the one-time localStorage import
on login. Guests stay localStorage-only.

## Career-Ops AI scoring (manual, top 10)

On `/swipe` a **"Score top 10 jobs with AI"** button compares the user's most recent uploaded
resume against the **first 10 jobs on screen** using the Career-Ops rubric, then shows only those
10 ranked by fit score. It's **manual** and cost-controlled (never scores on page load; hard-capped
at 10; DB-cached so re-clicks don't re-call the model).

- **Setup:** run the two setup scripts once in DBeaver (`ITJC_SCRAPPER`):
  [`database/setup/create-resume-upload.sql`](database/setup/create-resume-upload.sql) (includes
  `ResumeText`) and [`database/setup/create-career-ops-scores.sql`](database/setup/create-career-ops-scores.sql)
  (the score cache). Set `AI_PROVIDER` (`deepseek` or `anthropic`) + that provider's key/model
  (`DEEPSEEK_API_KEY`/`DEEPSEEK_MODEL` or `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`) — scoring requires
  a key; the button errors without one.
- **Resume text:** on upload the app extracts text (`.pdf` → pdf-parse, `.docx` → mammoth) into
  `resume_upload.ResumeText`. Old rows are back-filled from the stored binary on first score.
- **Flow:** client sends `{ email, jobIds }` → `POST /api/scoring/score-batch`
  ([route](app/api/scoring/score-batch/route.ts)) → [`lib/careerOps/scoringService.ts`](lib/careerOps/scoringService.ts)
  resolves the latest resume by email, fetches each job by ID
  ([`fetchJobById`](lib/db/jobsRepository.ts)), checks the DB cache
  ([`lib/db/scoresRepository.ts`](lib/db/scoresRepository.ts)), and on a miss reuses the existing
  engine [`evaluateJob`](lib/scoring/scoreJob.ts) (provider-neutral AI call via `lib/ai` + Zod
  validation) with `skipCache`, then upserts the result. Scores map to a compact card shape via
  [`lib/careerOps/aiScore.ts`](lib/careerOps/aiScore.ts).
- **Cache key:** `(ResumeUploadID, JobID, ModelName, RubricVersion="career-ops-v2")` — unique, so a
  re-click returns `cachedCount: 10, scoredCount: 0` (no new API calls).
- **Rubric:** adapted from Career-Ops (`modes/oferta.md` + `modes/_shared.md`, MIT) for early-career /
  intern / new-grad matching — see the attribution in
  [`lib/scoring/careerOpsPrompt.ts`](lib/scoring/careerOpsPrompt.ts).

## Read-only guarantee

- The **job feed is read-only** — only `SELECT` runs against `ITJC`. The **only writes** in the whole
  app are in `ITJC_SCRAPPER`: the resume upload (`INSERT`/`UPDATE ResumeText` on
  `resume_upload`), the AI score cache (`MERGE` into `career_ops_scores`), and the
  per-user pipeline state (`MERGE` into `user_job_seen` — status, notes, and a
  title/company/location/url snapshot per swiped job). All are parameterized.
  No delete/truncate, and the stored procedure that processes jobs is **never** called.
- `lib/db/*` import `server-only`, so DB code can never be bundled into client JS. The DB routes
  are dynamic server routes (`ƒ`), and credentials are never logged (only server/db/host).

## Known limitations (v1)

- **Jobs are scored on demand, not automatically.** Each job shows a neutral placeholder score
  (3.0, "Possible fit") and a "Not scored yet" chip until the user runs "Score top jobs with AI"
  (see above); there is no automatic/lazy scoring on page load.
- `tbl_JobMaster` has no remote or salary column, so **remote/onsite/hybrid is inferred** from the
  title + description text (defaults to on-site), and no compensation chip is shown.
- `roleType` (internship / new-grad / contract / full-time) is inferred from `Job_type` + title.
- No `category` column, so cards show no category tags.
