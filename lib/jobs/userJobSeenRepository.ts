/**
 * Per-user "seen jobs" history. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Records which jobs a logged-in user has swiped/reviewed so the feed can skip
 * them next time. Writes to ITJC_SCRAPPER.dbo.temp_user_job_seen via the pooled
 * connection. All values are bound parameters. Reads happen in SQL (NOT EXISTS
 * in the jobs query) — we never pull a user's whole seen list into Node.
 */

import "server-only";
import { getPool, sql } from "@/lib/db/sqlServer";

const SEEN_TABLE = "ITJC_SCRAPPER.dbo.temp_user_job_seen";

/** The scrap-jobs source table (matches the seen row's SourceTable). */
export const SCRAP_SOURCE_TABLE = "temp_tbl_Scrap_jobs";

export type SeenAction =
  | "viewed"
  | "rejected"
  | "saved"
  | "applied"
  | "skipped"
  | "interested";

export const SEEN_ACTIONS: readonly SeenAction[] = [
  "viewed",
  "rejected",
  "saved",
  "applied",
  "skipped",
  "interested",
];

/**
 * Mark a job as seen for a user (idempotent upsert). Repeated calls just update
 * LastAction/UpdatedAt — never a duplicate row (unique index enforces it too).
 */
export async function markJobSeen(args: {
  loginUserId: number;
  jobReference: string;
  action?: string | null;
  sourceTable?: string;
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("LoginUserID", sql.Int, args.loginUserId)
    .input("JobReference", sql.NVarChar(255), args.jobReference)
    .input("SourceTable", sql.NVarChar(100), args.sourceTable ?? SCRAP_SOURCE_TABLE)
    .input("LastAction", sql.NVarChar(50), args.action ?? null)
    .query(
      `MERGE ${SEEN_TABLE} WITH (HOLDLOCK) AS target
         USING (SELECT @LoginUserID AS LoginUserID, @JobReference AS JobReference,
                       @SourceTable AS SourceTable) AS source
         ON  target.LoginUserID = source.LoginUserID
         AND target.JobReference = source.JobReference
         AND target.SourceTable = source.SourceTable
       WHEN MATCHED THEN UPDATE SET
         LastAction = @LastAction, UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT
         (LoginUserID, JobReference, SourceTable, LastAction)
         VALUES (@LoginUserID, @JobReference, @SourceTable, @LastAction);`,
    );
}

/** Dev/testing: wipe a user's seen history so jobs can resurface. */
export async function clearSeenJobsForUser(loginUserId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("LoginUserID", sql.Int, loginUserId)
    .query(`DELETE FROM ${SEEN_TABLE} WHERE LoginUserID = @LoginUserID`);
}
