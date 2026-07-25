/**
 * Resume reads for scoring. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Looks up a user's most recent uploaded resume (by email, until real auth)
 * from ITJC_SCRAPPER.dbo.temp_tbl_resume_upload, and can back-fill ResumeText
 * from the stored binary. All values are bound parameters.
 */

import "server-only";
import { getPool, sql } from "./sqlServer";

const RESUME_TABLE = "ITJC_SCRAPPER.dbo.temp_tbl_resume_upload";

export interface ResumeRecord {
  id: number;
  email: string;
  resumeName: string;
  fileType: string;
  /** Original file bytes — used to back-fill text when ResumeText is empty. */
  resume: Buffer;
  resumeText: string | null;
}

function mapResumeRow(row: {
  ID: number;
  Email: string;
  ResumeName: string | null;
  FileType: string | null;
  Resume: Buffer;
  ResumeText: string | null;
}): ResumeRecord {
  return {
    id: Number(row.ID),
    email: String(row.Email),
    resumeName: String(row.ResumeName ?? ""),
    fileType: String(row.FileType ?? ""),
    resume: row.Resume,
    resumeText:
      row.ResumeText != null && String(row.ResumeText).trim()
        ? String(row.ResumeText)
        : null,
  };
}

const RESUME_SELECT = "ID, Email, ResumeName, FileType, Resume, ResumeText";

/** Most recent resume linked to a logged-in user (LoginUserID), or null. */
export async function getLatestResumeByUserId(
  userId: number,
): Promise<ResumeRecord | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("uid", sql.Int, userId)
    .query(
      `SELECT TOP 1 ${RESUME_SELECT}
         FROM ${RESUME_TABLE}
        WHERE LoginUserID = @uid
        ORDER BY uploadDate DESC, ID DESC`,
    );
  const row = result.recordset?.[0];
  return row ? mapResumeRow(row) : null;
}

/** Most recent resume uploaded for `email`, or null if the user has none. */
export async function getLatestResumeByEmail(
  email: string,
): Promise<ResumeRecord | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("email", sql.NVarChar(255), email)
    .query(
      `SELECT TOP 1 ${RESUME_SELECT}
         FROM ${RESUME_TABLE}
        WHERE Email = @email
        ORDER BY uploadDate DESC, ID DESC`,
    );
  const row = result.recordset?.[0];
  return row ? mapResumeRow(row) : null;
}

/** Persist extracted text back onto a resume row (parameterized). */
export async function updateResumeText(
  id: number,
  text: string,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, id)
    .input("text", sql.NVarChar(sql.MAX), text)
    .query(`UPDATE ${RESUME_TABLE} SET ResumeText = @text WHERE ID = @id`);
}
