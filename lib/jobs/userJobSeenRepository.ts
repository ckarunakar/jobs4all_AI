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
