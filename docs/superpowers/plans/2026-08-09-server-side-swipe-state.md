# Server-Side Swipe/Application State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in user's pipeline (job statuses + notes) persists in SQL Server, so the Applications tracker and Dashboard survive reloads and follow the user across devices; a one-time import preserves localStorage state on login.

**Architecture:** Extend the existing `user_job_seen` table (LastAction becomes the full pipeline status; new Notes + job-snapshot columns) so feed exclusion and the tracker share one source of truth. Three API routes (new `GET /api/jobs/tracked`, extended `POST /api/jobs/seen`, new `POST /api/jobs/seen/import`) sit on the existing pooled repositories. The swipe store merges server-tracked jobs into its `jobs` array at hydration, so the Applications board, Dashboard, and metrics work unchanged.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, `mssql` pooled connection, NextAuth v5 (`auth()` in routes).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-server-side-swipe-state-design.md`. Read it first.
- Statuses stored in `LastAction` are exactly `interested | saved | ready | applied | interview | rejected | skipped` (the `SwipeJobStatus` set minus `"new"`). Unknown/legacy values normalize to NULL on write and are skipped on read.
- Guests trigger ZERO new API calls; guest behavior (localStorage) is unchanged.
- All SQL is parameterized; repositories import `server-only`; routes are `runtime = "nodejs"`, `dynamic = "force-dynamic"`, 401 without a session.
- Server MERGE updates use `COALESCE(@param, existing)` so a request that omits a field never wipes it; empty string (`''`) is a deliberate value and DOES overwrite (that's how notes are cleared).
- Caps: tracked read `TOP 500` by `UpdatedAt DESC`; import 500 entries (server 400s above); notes 20 000 chars; snapshot title/company/location 500, url 2000.
- Two disclosed deviations/behavior notes (both approved in spirit by the spec): (1) the import cap is "first 500 entries" — localStorage has no per-entry timestamps, so "most recent" is unknowable; (2) deck-replacing operations (filter apply/clear) now KEEP non-`"new"` jobs, so the tracker survives filtering too — previously it silently dropped them.
- No test framework — every task verifies with `npx tsc --noEmit && npm run lint`; `npm run build` in the final task. Commit after every task with the message given.
- Follow existing conventions: `"use client"` where hooks are used, `@/` imports, JSDoc file headers, existing Tailwind idioms (`text-muted`, `bg-surface`, `border-border`, `var(--caution)`).
- The DB scripts in Task 1 are run MANUALLY by the user in DBeaver — the executor never connects to the DB. Flag the checkpoint in Task 7 before smoke testing.

---

### Task 1: DB scripts — pipeline-state columns on `user_job_seen`

**Files:**
- Modify: `database/setup/create-user-job-seen.sql`
- Create: `database/migrate/add-pipeline-state-to-user-job-seen.sql`

**Interfaces:**
- Consumes: existing `dbo.user_job_seen` (ID, LoginUserID, JobReference, SourceTable, LastAction, SeenAt, UpdatedAt; unique index `UX_user_job_seen_user_job`).
- Produces: five nullable columns later tasks write/read: `Notes NVARCHAR(MAX)`, `JobTitle NVARCHAR(500)`, `JobCompany NVARCHAR(500)`, `JobLocation NVARCHAR(500)`, `JobUrl NVARCHAR(2000)`.

- [ ] **Step 1: extend the setup script (fresh installs).** In `database/setup/create-user-job-seen.sql`, inside the `CREATE TABLE dbo.user_job_seen (...)` block, add after the `LastAction` line:

```sql
        Notes        NVARCHAR(MAX) NULL,
        JobTitle     NVARCHAR(500) NULL,
        JobCompany   NVARCHAR(500) NULL,
        JobLocation  NVARCHAR(500) NULL,
        JobUrl       NVARCHAR(2000) NULL,
```

Also update the header comment: the table now stores the user's full pipeline state (status in `LastAction`, notes, and a job snapshot captured at write time), not just seen-history.

- [ ] **Step 2: write the migrate script (live DB).** Create `database/migrate/add-pipeline-state-to-user-job-seen.sql`:

```sql
/*
  Pipeline state columns for user_job_seen — run ONCE against the live DB.
  --------------------------------------------------------------------------
  Run a single time in DBeaver connected to ITJC_SCRAPPER (same procedure as
  rename-to-production.sql). Idempotent: each ALTER is guarded by COL_LENGTH,
  so re-running is a no-op. Adds notes + a job snapshot (title/company/
  location/url captured at write time) so tracked jobs outlive scraper churn.
  LastAction now stores the full pipeline status (interested|saved|ready|
  applied|interview|rejected|skipped); existing rows already hold a valid
  subset and are untouched.
*/

USE [ITJC_SCRAPPER];
GO

IF COL_LENGTH('dbo.user_job_seen', 'Notes') IS NULL
    ALTER TABLE dbo.user_job_seen ADD Notes NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.user_job_seen', 'JobTitle') IS NULL
    ALTER TABLE dbo.user_job_seen ADD JobTitle NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.user_job_seen', 'JobCompany') IS NULL
    ALTER TABLE dbo.user_job_seen ADD JobCompany NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.user_job_seen', 'JobLocation') IS NULL
    ALTER TABLE dbo.user_job_seen ADD JobLocation NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.user_job_seen', 'JobUrl') IS NULL
    ALTER TABLE dbo.user_job_seen ADD JobUrl NVARCHAR(2000) NULL;
GO
```

- [ ] **Step 3: verify + commit.**

Run: `npx tsc --noEmit && npm run lint` (no TS touched — confirms nothing broke).

```bash
git add database/setup/create-user-job-seen.sql database/migrate/add-pipeline-state-to-user-job-seen.sql
git commit -m "feat: pipeline state columns on user_job_seen (setup + migrate scripts)"
```

---

### Task 2: Repository layer — upsert with notes/snapshot, tracked read, bulk import

**Files:**
- Modify: `lib/jobs/userJobSeenRepository.ts`
- Modify: `lib/db/jobsRepository.ts`

**Interfaces:**
- Consumes: Task 1 columns; existing `getPool`/`sql` from `lib/db/sqlServer`; existing `mapRow`, `str`, `JOBS_TABLE` in `jobsRepository.ts`.
- Produces (exact names later tasks import):
  - `PIPELINE_STATUSES: readonly PipelineStatus[]`, `type PipelineStatus`, `isPipelineStatus(v: unknown): v is PipelineStatus`
  - `upsertJobState(args: { loginUserId: number; jobReference: string; status?: string | null; notes?: string | null; snapshot?: JobSnapshot; sourceTable?: string }): Promise<void>` (replaces `markJobSeen`)
  - `interface JobSnapshot { title?: string; company?: string; location?: string; url?: string }`
  - `importJobStates(loginUserId: number, entries: ImportEntry[]): Promise<{ imported: number; skipped: number }>`; `interface ImportEntry { jobReference: string; status: PipelineStatus; notes?: string }`
  - `fetchTrackedJobListings(loginUserId: number): Promise<TrackedJobListing[]>`; `interface TrackedJobListing { listing: JobListing; status: string; notes: string | null }` (in `jobsRepository.ts`)

- [ ] **Step 1: rewrite `lib/jobs/userJobSeenRepository.ts`.** Replace the whole file:

```ts
/**
 * Per-user pipeline state ("seen jobs" + status + notes). SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * One row per (user, job, source) in ITJC_SCRAPPER.dbo.user_job_seen records
 * that the user swiped/reviewed the job (drives the feed's NOT EXISTS
 * exclusion) AND their pipeline status, notes, and a job snapshot captured at
 * write time (so tracked jobs outlive scraper churn). All values are bound
 * parameters. COALESCE keeps existing values when a field isn't sent; empty
 * string deliberately overwrites (clears notes).
 */

import "server-only";
import { getPool, sql } from "@/lib/db/sqlServer";

const SEEN_TABLE = "ITJC_SCRAPPER.dbo.user_job_seen";

/** The scrap-jobs source table (matches the seen row's SourceTable). */
export const SCRAP_SOURCE_TABLE = "temp_tbl_Scrap_jobs";

/** SwipeJobStatus minus "new" — the values LastAction may hold. */
export type PipelineStatus =
  | "interested"
  | "saved"
  | "ready"
  | "applied"
  | "interview"
  | "rejected"
  | "skipped";

export const PIPELINE_STATUSES: readonly PipelineStatus[] = [
  "interested",
  "saved",
  "ready",
  "applied",
  "interview",
  "rejected",
  "skipped",
];

export function isPipelineStatus(v: unknown): v is PipelineStatus {
  return (
    typeof v === "string" &&
    (PIPELINE_STATUSES as readonly string[]).includes(v)
  );
}

/** Job fields snapshotted at write time (tracker fallback after churn). */
export interface JobSnapshot {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
}

/**
 * Upsert a user's state for one job (idempotent MERGE). Missing fields keep
 * their existing values (COALESCE); the unique index prevents duplicates.
 */
export async function upsertJobState(args: {
  loginUserId: number;
  jobReference: string;
  /** Pipeline status → LastAction. Null/undefined keeps the existing value. */
  status?: string | null;
  /** Null/undefined keeps existing notes; "" clears them. */
  notes?: string | null;
  snapshot?: JobSnapshot;
  sourceTable?: string;
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("LoginUserID", sql.Int, args.loginUserId)
    .input("JobReference", sql.NVarChar(255), args.jobReference)
    .input("SourceTable", sql.NVarChar(100), args.sourceTable ?? SCRAP_SOURCE_TABLE)
    .input("Status", sql.NVarChar(50), args.status ?? null)
    .input("Notes", sql.NVarChar(sql.MAX), args.notes ?? null)
    .input("JobTitle", sql.NVarChar(500), args.snapshot?.title ?? null)
    .input("JobCompany", sql.NVarChar(500), args.snapshot?.company ?? null)
    .input("JobLocation", sql.NVarChar(500), args.snapshot?.location ?? null)
    .input("JobUrl", sql.NVarChar(2000), args.snapshot?.url ?? null)
    .query(
      `MERGE ${SEEN_TABLE} WITH (HOLDLOCK) AS target
         USING (SELECT @LoginUserID AS LoginUserID, @JobReference AS JobReference,
                       @SourceTable AS SourceTable) AS source
         ON  target.LoginUserID = source.LoginUserID
         AND target.JobReference = source.JobReference
         AND target.SourceTable = source.SourceTable
       WHEN MATCHED THEN UPDATE SET
         LastAction  = COALESCE(@Status, target.LastAction),
         Notes       = COALESCE(@Notes, target.Notes),
         JobTitle    = COALESCE(@JobTitle, target.JobTitle),
         JobCompany  = COALESCE(@JobCompany, target.JobCompany),
         JobLocation = COALESCE(@JobLocation, target.JobLocation),
         JobUrl      = COALESCE(@JobUrl, target.JobUrl),
         UpdatedAt   = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT
         (LoginUserID, JobReference, SourceTable, LastAction, Notes,
          JobTitle, JobCompany, JobLocation, JobUrl)
         VALUES (@LoginUserID, @JobReference, @SourceTable, @Status, @Notes,
                 @JobTitle, @JobCompany, @JobLocation, @JobUrl);`,
    );
}

/** One localStorage entry offered for import. */
export interface ImportEntry {
  jobReference: string;
  status: PipelineStatus;
  notes?: string;
}

/**
 * One-time bulk import of localStorage state. Insert-only: existing server
 * rows always win (no WHEN MATCHED clause). Returns how many rows landed.
 */
export async function importJobStates(
  loginUserId: number,
  entries: ImportEntry[],
): Promise<{ imported: number; skipped: number }> {
  const pool = await getPool();
  let imported = 0;
  for (const e of entries) {
    const result = await pool
      .request()
      .input("LoginUserID", sql.Int, loginUserId)
      .input("JobReference", sql.NVarChar(255), e.jobReference)
      .input("SourceTable", sql.NVarChar(100), SCRAP_SOURCE_TABLE)
      .input("Status", sql.NVarChar(50), e.status)
      .input("Notes", sql.NVarChar(sql.MAX), e.notes ?? null)
      .query(
        `MERGE ${SEEN_TABLE} WITH (HOLDLOCK) AS target
           USING (SELECT @LoginUserID AS LoginUserID, @JobReference AS JobReference,
                         @SourceTable AS SourceTable) AS source
           ON  target.LoginUserID = source.LoginUserID
           AND target.JobReference = source.JobReference
           AND target.SourceTable = source.SourceTable
         WHEN NOT MATCHED THEN INSERT
           (LoginUserID, JobReference, SourceTable, LastAction, Notes)
           VALUES (@LoginUserID, @JobReference, @SourceTable, @Status, @Notes);`,
      );
    imported += result.rowsAffected[0] ?? 0;
  }
  return { imported, skipped: entries.length - imported };
}
```

(Note: `markJobSeen`, `SEEN_ACTIONS`, and `SeenAction` are deleted; Task 3 updates their one caller, `app/api/jobs/seen/route.ts`. `npx tsc --noEmit` FAILS until Task 3 — that's expected mid-task-2; run it after Step 2 and confirm the ONLY errors are in `app/api/jobs/seen/route.ts`.)

- [ ] **Step 2: tracked read in `lib/db/jobsRepository.ts`.** Add at the end of the file:

```ts
/** A tracked (pipeline) job: live listing when the scraper still has it,
 *  else rebuilt from the snapshot captured at write time. */
export interface TrackedJobListing {
  listing: JobListing;
  status: string;
  notes: string | null;
}

/**
 * The user's pipeline: seen rows with a status, newest-updated first, capped
 * at 500, LEFT JOINed to the live jobs table. Rows whose job vanished from
 * the scraper table fall back to the snapshot (empty description).
 */
export async function fetchTrackedJobListings(
  loginUserId: number,
): Promise<TrackedJobListing[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("loginUserId", sql.Int, loginUserId)
    .query<RawRow & {
      seenJobReference?: unknown;
      seenStatus?: unknown;
      seenNotes?: unknown;
      snapTitle?: unknown;
      snapCompany?: unknown;
      snapLocation?: unknown;
      snapUrl?: unknown;
    }>(
      `SELECT TOP 500
         s.JobReference  AS seenJobReference,
         s.LastAction    AS seenStatus,
         s.Notes         AS seenNotes,
         s.JobTitle      AS snapTitle,
         s.JobCompany    AS snapCompany,
         s.JobLocation   AS snapLocation,
         s.JobUrl        AS snapUrl,
         j.job_reference AS id,
         j.Title         AS title,
         j.company       AS company,
         j.city          AS city,
         j.state         AS state,
         j.zip           AS zip,
         j.country       AS country,
         j.Location      AS locationRaw,
         j.url           AS url,
         j.job_type      AS jobType,
         j.posted_at     AS postedAt,
         j.Isremote      AS isRemote,
         j.category      AS category,
         j.description   AS description
       FROM ITJC_SCRAPPER.dbo.user_job_seen s
       LEFT JOIN ${JOBS_TABLE} j ON j.job_reference = s.JobReference
       WHERE s.LoginUserID = @loginUserId
         AND s.SourceTable = 'temp_tbl_Scrap_jobs'
         AND s.LastAction IS NOT NULL
       ORDER BY s.UpdatedAt DESC`,
    );

  const out: TrackedJobListing[] = [];
  for (const row of Array.from(result.recordset)) {
    const status = str(row.seenStatus);
    const reference = str(row.seenJobReference);
    if (!status || !reference) continue;
    // Live row when the join hit (mapRow needs id + title); snapshot fallback.
    const listing: JobListing = mapRow(row) ?? {
      id: reference,
      jobReference: reference,
      title: str(row.snapTitle) ?? "(no longer listed)",
      company: str(row.snapCompany) ?? "Unknown Company",
      location: str(row.snapLocation) ?? "Location not specified",
      url: str(row.snapUrl),
      description: "",
      source: "sql-server",
    };
    out.push({ listing, status, notes: str(row.seenNotes) ?? null });
  }
  return out;
}
```

- [ ] **Step 3: verify + commit.**

Run: `npx tsc --noEmit` — expect errors ONLY in `app/api/jobs/seen/route.ts` (fixed next task). Run `npm run lint` — clean for the two modified files.

```bash
git add lib/jobs/userJobSeenRepository.ts lib/db/jobsRepository.ts
git commit -m "feat: job-state repository — upsert with notes/snapshot, tracked read, bulk import"
```

---

### Task 3: API routes — extended seen, new tracked + import

**Files:**
- Modify: `app/api/jobs/seen/route.ts`
- Create: `app/api/jobs/tracked/route.ts`
- Create: `app/api/jobs/seen/import/route.ts`

**Interfaces:**
- Consumes: Task 2 exports (`upsertJobState`, `isPipelineStatus`, `importJobStates`, `ImportEntry`, `JobSnapshot`; `fetchTrackedJobListings`).
- Produces (exact wire shapes Task 4 relies on):
  - `POST /api/jobs/seen` body `{ jobReference, status?, action?, notes?, snapshot?: { title?, company?, location?, url? } }` → `{ ok: true }`
  - `GET /api/jobs/tracked` → `{ ok: true, count, jobs: Array<{ job: JobListing; status: string; notes: string | null }> }`
  - `POST /api/jobs/seen/import` body `{ entries: Array<{ jobReference, status, notes? }> }` → `{ ok: true, imported, skipped }`; 400 above 500 entries.

- [ ] **Step 1: rewrite `app/api/jobs/seen/route.ts`.**

```ts
/**
 * /api/jobs/seen — per-user pipeline state.
 *   POST { jobReference, status, notes?, snapshot? } → upsert the logged-in
 *   user's state for one job ("action" accepted as a legacy alias for status).
 *
 * Requires a session (auth()). The user id comes from the session, never
 * the client. Parameterized SQL only.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  isPipelineStatus,
  upsertJobState,
  type JobSnapshot,
} from "@/lib/jobs/userJobSeenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOTES = 20_000;

function cleanStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

/** Snapshot fields, trimmed and capped to the column sizes. NOT exported —
 *  Next.js route files may only export handlers/config. */
function parseSnapshot(v: unknown): JobSnapshot | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const snapshot: JobSnapshot = {
    title: cleanStr(o.title, 500),
    company: cleanStr(o.company, 500),
    location: cleanStr(o.location, 500),
    url: cleanStr(o.url, 2000),
  };
  return snapshot.title || snapshot.company || snapshot.location || snapshot.url
    ? snapshot
    : undefined;
}

export async function POST(req: Request) {
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
  if (!loginUserId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let body: {
    jobReference?: string;
    status?: string;
    action?: string; // legacy alias
    notes?: string;
    snapshot?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const jobReference = String(body.jobReference ?? "").trim();
  if (!jobReference) {
    return NextResponse.json(
      { ok: false, error: "Missing jobReference" },
      { status: 400 },
    );
  }
  // Unknown statuses are still recorded as seen, but normalized to null
  // (COALESCE in the MERGE keeps any existing status).
  const raw = body.status ?? body.action;
  const status = isPipelineStatus(raw) ? raw : null;
  // Notes: absent → keep existing (null); "" → clear (empty string passes).
  const notes =
    typeof body.notes === "string" ? body.notes.slice(0, MAX_NOTES) : null;

  try {
    await upsertJobState({
      loginUserId,
      jobReference,
      status,
      notes,
      snapshot: parseSnapshot(body.snapshot),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save state";
    console.error(`[api/jobs/seen] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

(Note: `""` notes reach `upsertJobState` as `""` — not null — so `COALESCE('' , ...)` takes the empty string and clears the notes. Exactly the intended semantics.)

- [ ] **Step 2: create `app/api/jobs/tracked/route.ts`.**

```ts
/**
 * GET /api/jobs/tracked — the logged-in user's pipeline (statuses + notes),
 * newest-updated first, capped at 500. Live job data when the scraper still
 * has the job; snapshot fallback (empty description) when it doesn't.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchTrackedJobListings } from "@/lib/db/jobsRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
  if (!loginUserId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  try {
    const tracked = await fetchTrackedJobListings(loginUserId);
    return NextResponse.json({
      ok: true,
      count: tracked.length,
      jobs: tracked.map((t) => ({
        job: t.listing,
        status: t.status,
        notes: t.notes,
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load pipeline";
    console.error(`[api/jobs/tracked] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: create `app/api/jobs/seen/import/route.ts`.**

```ts
/**
 * POST /api/jobs/seen/import — one-time bulk import of localStorage pipeline
 * state on login. Insert-only: existing server rows always win. Body:
 * { entries: [{ jobReference, status, notes? }] }, capped at 500 entries.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  importJobStates,
  isPipelineStatus,
  type ImportEntry,
} from "@/lib/jobs/userJobSeenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENTRIES = 500;
const MAX_NOTES = 20_000;

export async function POST(req: Request) {
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
  if (!loginUserId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let body: { entries?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.entries)) {
    return NextResponse.json(
      { ok: false, error: "Missing entries array" },
      { status: 400 },
    );
  }
  if (body.entries.length > MAX_ENTRIES) {
    return NextResponse.json(
      { ok: false, error: `Too many entries (max ${MAX_ENTRIES})` },
      { status: 400 },
    );
  }

  // Silently drop malformed entries — the rest still import.
  const entries: ImportEntry[] = [];
  for (const raw of body.entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const jobReference = String(e.jobReference ?? "").trim();
    if (!jobReference || !isPipelineStatus(e.status)) continue;
    entries.push({
      jobReference,
      status: e.status,
      notes:
        typeof e.notes === "string" && e.notes
          ? e.notes.slice(0, MAX_NOTES)
          : undefined,
    });
  }

  try {
    const result = await importJobStates(loginUserId, entries);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    console.error(`[api/jobs/seen/import] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: verify + commit.**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (the Task 2 errors are resolved).

```bash
git add app/api/jobs/seen/route.ts app/api/jobs/tracked/route.ts app/api/jobs/seen/import/route.ts
git commit -m "feat: tracked/import API routes; seen route stores full pipeline state"
```

---

### Task 4: Swipe store — server-backed pipeline with one-time import

**Files:**
- Modify: `lib/swipe/swipeStore.tsx`

**Interfaces:**
- Consumes: Task 3 wire shapes; existing `jobListingToSwipeJob` from `@/lib/jobs/jobListingToSwipeJob`.
- Produces (store contract changes Task 5 relies on):
  - `markApplied(jobId: string, notes?: string): void` — notes now travel WITH the status in one POST.
  - New store field `pipelineError: string | null`.
  - `setStatus` / `setNotes` / `decide` signatures unchanged, but all now sync server-side when logged in.

- [ ] **Step 1: tracked-fetch helper + status guard.** Below the existing `fetchJobs` function add:

```tsx
/** LastAction values the tracker accepts (SwipeJobStatus minus "new"). */
const TRACKED_STATUSES: readonly SwipeJobStatus[] = [
  "interested",
  "saved",
  "ready",
  "applied",
  "interview",
  "rejected",
  "skipped",
];

function isTrackedStatus(v: string): v is SwipeJobStatus {
  return (TRACKED_STATUSES as readonly string[]).includes(v);
}

/** Fetch the logged-in user's server-side pipeline (statuses + notes). */
async function fetchTrackedJobs(): Promise<{
  jobs: SwipeJob[];
  notes: Record<string, string>;
  error: string | null;
}> {
  try {
    const res = await fetch("/api/jobs/tracked");
    const data = (await res.json()) as {
      ok?: boolean;
      jobs?: Array<{ job: JobListing; status: string; notes: string | null }>;
      error?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.jobs)) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    const notes: Record<string, string> = {};
    const jobs: SwipeJob[] = [];
    for (const entry of data.jobs) {
      if (!isTrackedStatus(entry.status)) continue;
      const sj = jobListingToSwipeJob(entry.job);
      sj.status = entry.status;
      if (entry.notes) notes[sj.id] = entry.notes;
      jobs.push(sj);
    }
    return { jobs, notes, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load pipeline";
    return { jobs: [], notes: {}, error: message };
  }
}
```

Change the import at the top: `import { jobListingsToSwipeJobs, jobListingToSwipeJob } from "@/lib/jobs/jobListingToSwipeJob";`

- [ ] **Step 2: new state + interface fields.** Under `const [error, setError] = useState<string | null>(null);` add:

```tsx
  // Non-null when the server-side pipeline (tracked jobs) failed to load.
  const [pipelineError, setPipelineError] = useState<string | null>(null);
```

In the `SwipeStore` interface: add `/** Non-null when the saved pipeline failed to load. */ pipelineError: string | null;` after `error`, change `markApplied: (jobId: string) => void;` to `markApplied: (jobId: string, notes?: string) => void;`, and add `pipelineError` to the `value` object.

- [ ] **Step 3: replace `markSeen` with `syncJobState`.** Delete the `SEEN_ACTION` const, the `markedSeenRef` ref, and the `markSeen` callback. In their place:

```tsx
  // Sync one job's full state (status + notes + snapshot) for the logged-in
  // user (fire-and-forget; never blocks the swipe). MERGE-on-server means a
  // lost write self-heals on the job's next touch. Deduped so React
  // double-fires don't re-POST. jobId === job_reference.
  const syncedRef = useRef<Set<string>>(new Set());
  const syncJobState = useCallback(
    (job: SwipeJob, status: SwipeJobStatus, notesValue?: string) => {
      if (!isLoggedIn || !job.id || status === "new") return;
      const key = `${job.id}:${status}:${notesValue ?? ""}`;
      if (syncedRef.current.has(key)) return;
      syncedRef.current.add(key);
      void fetch("/api/jobs/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobReference: job.id,
          status,
          notes: notesValue,
          snapshot: {
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.applicationUrl || undefined,
          },
        }),
      }).catch((err) => {
        console.warn("[swipe] failed to sync job state:", err);
      });
    },
    [isLoggedIn],
  );
```

- [ ] **Step 4: route all status/notes changes through the sync.** Replace `setStatus`, `decide`, `markApplied`, and `setNotes` with:

```tsx
  const setStatus = useCallback(
    (jobId: string, status: SwipeJobStatus) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status } : j)),
      );
      const job = jobs.find((j) => j.id === jobId);
      // Notes omitted → server keeps existing notes (COALESCE).
      if (job) syncJobState(job, status);
    },
    [jobs, syncJobState],
  );

  const decide = useCallback(
    (jobId: string, decision: SwipeDecision) => {
      setStatus(jobId, DECISION_STATUS[decision]);
    },
    [setStatus],
  );

  // Notes travel WITH the status in one POST — two racing requests could
  // otherwise resurrect stale values via COALESCE.
  const markApplied = useCallback(
    (jobId: string, notesValue?: string) => {
      if (notesValue !== undefined) {
        setNotesState((prev) => ({ ...prev, [jobId]: notesValue }));
      }
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: "applied" } : j)),
      );
      const job = jobs.find((j) => j.id === jobId);
      if (job) syncJobState(job, "applied", notesValue);
    },
    [jobs, syncJobState],
  );

  const setNotes = useCallback(
    (jobId: string, value: string) => {
      setNotesState((prev) => ({ ...prev, [jobId]: value }));
      const job = jobs.find((j) => j.id === jobId);
      if (job && job.status !== "new") syncJobState(job, job.status, value);
    },
    [jobs, syncJobState],
  );
```

- [ ] **Step 5: hydration — import, then feed + tracked in parallel.** Replace the initial-load `useEffect` body (keep the `/* eslint-disable react-hooks/set-state-in-effect */` guards) with:

```tsx
  useEffect(() => {
    let cancelled = false;

    // Read persisted statuses/notes/profile first (localStorage is sync).
    let statuses: Record<string, SwipeJobStatus> = {};
    let storedNotes: Record<string, string> = {};
    let persistedProfile: Partial<ResumeProfile> | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        statuses = parsed.statuses ?? {};
        storedNotes = parsed.notes ?? {};
        if (parsed.profile) persistedProfile = parsed.profile;
      }
    } catch {
      // ignore corrupt state
    }

    // Seed the profile; the logged-in email (if any) is authoritative, so the
    // resume upload + scoring always use the account's email, not a typo.
    const base = persistedProfile
      ? { ...DEFAULT_SWIPE_PROFILE, ...persistedProfile }
      : DEFAULT_SWIPE_PROFILE;
    setProfile(sessionEmail ? { ...base, email: sessionEmail } : base);

    // One-time import of localStorage pipeline state into the account.
    // Existing server rows win; the flag is only set on success so a failed
    // import retries next load. Cap 500 (localStorage has no timestamps, so
    // "most recent" is unknowable — first 500 it is).
    async function maybeImport(): Promise<void> {
      if (!isLoggedIn || !sessionEmail) return;
      const importKey = `itjobcafe.swipe.imported.${sessionEmail}`;
      try {
        if (localStorage.getItem(importKey)) return;
      } catch {
        return;
      }
      const entries = Object.entries(statuses)
        .filter(([, s]) => s !== "new")
        .slice(0, 500)
        .map(([jobReference, status]) => ({
          jobReference,
          status,
          notes: storedNotes[jobReference] || undefined,
        }));
      try {
        if (entries.length > 0) {
          const res = await fetch("/api/jobs/seen/import", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ entries }),
          });
          if (!res.ok) return; // no flag — retry next load
        }
        localStorage.setItem(importKey, "1");
      } catch (err) {
        console.warn("[swipe] pipeline import failed:", err);
      }
    }

    async function load(): Promise<void> {
      if (isLoggedIn) {
        await maybeImport();
        const [feed, tracked] = await Promise.all([
          fetchJobs(),
          fetchTrackedJobs(),
        ]);
        if (cancelled) return;
        // Server state wins: localStorage statuses are NOT applied. The feed
        // excludes seen jobs server-side, so overlap is belt-and-braces only.
        const trackedIds = new Set(tracked.jobs.map((j) => j.id));
        setJobs(
          withKnownScores([
            ...tracked.jobs,
            ...feed.jobs.filter((j) => !trackedIds.has(j.id)),
          ]),
        );
        setNotesState(tracked.notes);
        setError(feed.error);
        setPipelineError(tracked.error);
      } else {
        const res = await fetchJobs();
        if (cancelled) return;
        setJobs(withKnownScores(withStatuses(res.jobs, statuses)));
        setNotesState(storedNotes);
        setError(res.error);
      }
      setHydrated(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionEmail, isLoggedIn, withKnownScores]);
```

(Note: the original effect applied notes inside the `try` via `setNotesState(parsed.notes)`; the rewrite collects them into `storedNotes` and applies them in `load()`, so the logged-in path can use server notes instead.)

- [ ] **Step 6: deck replacement keeps tracked jobs.** Add a helper under `withKnownScores` and use it in `loadFilteredJobs`, `clearJobFilters`, and `reset`:

```tsx
  /** Replace only the undecided ("new") portion of the deck; jobs the user
   *  has acted on stay so the tracker survives filtering. */
  const replaceDeck = useCallback(
    (fetched: SwipeJob[]) => {
      setJobs((prev) => {
        const kept = prev.filter((j) => j.status !== "new");
        const keptIds = new Set(kept.map((j) => j.id));
        return withKnownScores([
          ...kept,
          ...fetched.filter((j) => !keptIds.has(j.id)),
        ]);
      });
    },
    [withKnownScores],
  );
```

In `loadFilteredJobs`: `replaceDeck(res.jobs); setError(res.error);` (drop the old `setJobs(withKnownScores(res.jobs))`). Same in `clearJobFilters`. In `reset`, replace the body's fetch with:

```tsx
  const reset = useCallback(() => {
    setNotesState({});
    setProfile(DEFAULT_SWIPE_PROFILE);
    setJobFilters({});
    setFiltering(true);
    if (isLoggedIn) {
      // Logged in: Reset re-syncs from the server — it does NOT clear the
      // saved pipeline (there is deliberately no delete endpoint).
      Promise.all([fetchJobs(), fetchTrackedJobs()])
        .then(([feed, tracked]) => {
          const trackedIds = new Set(tracked.jobs.map((j) => j.id));
          setJobs(
            withKnownScores([
              ...tracked.jobs,
              ...feed.jobs.filter((j) => !trackedIds.has(j.id)),
            ]),
          );
          setNotesState(tracked.notes);
          setError(feed.error);
          setPipelineError(tracked.error);
        })
        .finally(() => setFiltering(false));
    } else {
      fetchJobs()
        .then((res) => {
          setJobs(withKnownScores(res.jobs));
          setError(res.error);
        })
        .finally(() => setFiltering(false));
    }
  }, [isLoggedIn, withKnownScores]);
```

Update the callback dependency arrays exactly as shown in each snippet.

- [ ] **Step 7: verify + commit.**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (`ApplicationReviewModal.tsx` still uses the old `setNotes` + `markApplied(job.id)` two-call flow — type-valid since `notes` is optional; it transiently double-POSTs until Task 5 replaces the call site.)

```bash
git add lib/swipe/swipeStore.tsx
git commit -m "feat: server-backed pipeline state in swipe store with one-time import"
```

---

### Task 5: UI — single-POST apply, pipeline error banners

**Files:**
- Modify: `components/swipe/ApplicationReviewModal.tsx`
- Modify: `app/(app)/(protected)/applications/page.tsx`
- Modify: `app/(app)/(protected)/dashboard/page.tsx`
- Create: `components/shared/PipelineErrorBanner.tsx`

**Interfaces:**
- Consumes: `markApplied(jobId, notes?)` and `pipelineError` from Task 4.
- Produces: `PipelineErrorBanner()` — renders nothing when `pipelineError` is null; no props.

- [ ] **Step 1: modal applies notes + status in one call.** In `ApplicationReviewModal.tsx`, remove `setNotes` from the `useSwipeStore()` destructure and change `handleApplied`:

```tsx
  const handleApplied = () => {
    markApplied(job.id, draftNotes);
    toast("Marked as applied", "success");
    onClose();
  };
```

- [ ] **Step 2: shared banner.** Create `components/shared/PipelineErrorBanner.tsx`:

```tsx
"use client";

import { useSwipeStore } from "@/lib/swipe/swipeStore";

/** Shown when the server-side pipeline failed to load (feed still works). */
export function PipelineErrorBanner() {
  const { pipelineError } = useSwipeStore();
  if (!pipelineError) return null;
  return (
    <div className="rounded-lg border-2 border-[var(--caution)]/40 bg-[var(--caution)]/10 px-4 py-2.5 text-xs text-[var(--caution)]">
      Couldn&apos;t load your saved pipeline ({pipelineError}) — refresh to
      retry.
    </div>
  );
}
```

- [ ] **Step 3: mount it.** In `applications/page.tsx`, add `<PipelineErrorBanner />` as the first child inside the `<div className="space-y-4">`; in `dashboard/page.tsx`, first child inside the `<div className="space-y-5">`. Both import from `@/components/shared/PipelineErrorBanner`.

- [ ] **Step 4: verify + commit.**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add components/swipe/ApplicationReviewModal.tsx components/shared/PipelineErrorBanner.tsx "app/(app)/(protected)/applications/page.tsx" "app/(app)/(protected)/dashboard/page.tsx"
git commit -m "feat: pipeline error banners; single-post apply with notes"
```

---

### Task 6: Docs

**Files:**
- Modify: `README.md`
- Modify: `SQL_INTEGRATION.md`

- [ ] **Step 1: README.** In "Known limitations", replace the "Swipe/application state is per-browser" bullet with:

```markdown
- **The profile is per-browser.** Job statuses and notes now persist
  server-side for logged-in users (`user_job_seen`) and follow you across
  devices; a one-time import preserves any pre-login localStorage state.
  Guests still swipe against `localStorage` only, and the editable profile
  (name, links, school, preferences) remains per-browser for everyone.
```

In "Features", update the Tracker bullet: `- **Tracker** — interested / saved / applied pipeline with notes; server-persisted for logged-in users (survives reloads and devices).`

- [ ] **Step 2: SQL_INTEGRATION.md.** In the "Read-only guarantee" section, replace the sentence listing the writes with:

```markdown
- The **job feed is read-only** — only `SELECT` runs against `ITJC`. The **only writes** in the whole
  app are in `ITJC_SCRAPPER`: the resume upload (`INSERT`/`UPDATE ResumeText` on
  `resume_upload`), the AI score cache (`MERGE` into `career_ops_scores`), and the
  per-user pipeline state (`MERGE` into `user_job_seen` — status, notes, and a
  title/company/location/url snapshot per swiped job). All are parameterized.
  No delete/truncate, and the stored procedure that processes jobs is **never** called.
```

Add a short section after "Resume uploads (write)":

```markdown
## Pipeline state (write + read-back)

Logged-in users' swipe statuses and notes persist in `user_job_seen`
(`LastAction` = full pipeline status, plus `Notes` and snapshot columns —
run `database/migrate/add-pipeline-state-to-user-job-seen.sql` once).
`POST /api/jobs/seen` upserts one job's state; `GET /api/jobs/tracked`
returns the pipeline (TOP 500, newest first, live join with snapshot
fallback); `POST /api/jobs/seen/import` is the one-time localStorage import
on login. Guests stay localStorage-only.
```

- [ ] **Step 3: verify + commit.**

Run: `npm run lint`

```bash
git add README.md SQL_INTEGRATION.md
git commit -m "docs: server-side pipeline state in README + SQL_INTEGRATION"
```

---

### Task 7: Build + smoke verification

**Files:** none (verification only)

- [ ] **Step 1: full build.**

Run: `npm run build`
Expected: clean build; the route list shows `ƒ /api/jobs/tracked` and `ƒ /api/jobs/seen/import` as dynamic routes.

- [ ] **Step 2: USER CHECKPOINT — DB migration.** Stop and ask the user to run `database/migrate/add-pipeline-state-to-user-job-seen.sql` in DBeaver against the live `ITJC_SCRAPPER` DB (idempotent), and confirm `.env.local` has DB credentials. Smoke tests below fail without it.

- [ ] **Step 3: smoke (user-driven, `npm run dev`).** Walk the spec's checklist:
  1. Logged in: swipe several jobs, mark one applied with notes → reload → Applications/Dashboard still show everything.
  2. Move a card interested → interview on the board → reload → move persisted.
  3. Second browser, same account → same pipeline.
  4. Guest: swipe (no new API calls in devtools Network) → sign up/log in → pipeline imported once; `itjobcafe.swipe.imported.<email>` set; no re-import on reload.
  5. In DBeaver, set a test row's `JobReference` to a bogus value → tracked job renders from snapshot.
  6. Feed exclusion: swiped jobs don't reappear in the deck.

- [ ] **Step 4: final commit if smoke fixes were needed**, message: `fix: <what smoke surfaced>`.
