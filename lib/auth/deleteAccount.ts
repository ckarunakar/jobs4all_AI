/**
 * Account deletion — removes a user and every row tied to them, atomically.
 * SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * One T-SQL batch under SET XACT_ABORT ON: any error rolls the whole
 * transaction back inside SQL Server, even if this process dies mid-request.
 * Order matters: child rows before login_users (FKs), and AI scores before
 * the resumes they point at (career_ops_scores.ResumeUploadID). Resumes and
 * scores also match by email, catching older rows never linked to the user id.
 */

import "server-only";
import { getPool, sql } from "@/lib/db/sqlServer";

const DB = "ITJC_SCRAPPER.dbo";

export async function deleteAccount(
  userId: number,
  email: string,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, userId)
    .input("email", sql.NVarChar(255), email)
    .query(
      `SET XACT_ABORT ON;
       BEGIN TRANSACTION;
         DELETE FROM ${DB}.mobile_sessions WHERE LoginUserID = @id;
         DELETE FROM ${DB}.user_job_seen WHERE LoginUserID = @id;
         DELETE FROM ${DB}.career_ops_scores
          WHERE UserEmail = @email
             OR ResumeUploadID IN (
                  SELECT ID FROM ${DB}.resume_upload
                   WHERE LoginUserID = @id OR Email = @email);
         DELETE FROM ${DB}.resume_upload WHERE LoginUserID = @id OR Email = @email;
         DELETE FROM ${DB}.login_users WHERE ID = @id;
       COMMIT TRANSACTION;`,
    );
}
