/**
 * POST /api/resume-upload — store a resume (.pdf/.docx) in SQL Server.
 * --------------------------------------------------------------------------
 * Accepts multipart/form-data with:
 *   resume   (File, required)  — the .pdf or .docx
 *   fullName (string)          — split into FirstName / LastName
 *   email    (string, required)
 *   phone    (string, optional)
 *   jobTitle (string, optional)
 *   jobId    (string, optional)
 *
 * SERVER-SIDE ONLY. Credentials come from env; every value is bound via
 * `request.input(...)` — no user input is concatenated into SQL. The file is
 * stored as VARBINARY(MAX) in ITJC_SCRAPPER.dbo.temp_tbl_resume_upload.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPool, sql } from "@/lib/db/sqlServer";
import { extractResumeText } from "@/lib/resume/extractText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Allowed file types: extension → normalized FileType.
const ALLOWED: Record<string, "pdf" | "docx"> = {
  ".pdf": "pdf",
  ".docx": "docx",
};

// MIME allowlist (lenient — some browsers send empty/octet-stream).
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
  "",
]);

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  // Require login — the resume is tied to the logged-in user.
  const session = await auth();
  if (!session?.user) {
    return fail("Please log in to upload a resume.", 401);
  }
  const loginUserId = session.user.id ? Number(session.user.id) : null;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Expected multipart/form-data.");
  }

  // The logged-in email is authoritative (avoids uploading under a stray email);
  // fall back to the form value only if the session somehow has none.
  const email = (session.user.email ?? String(form.get("email") ?? "")).trim();
  const fullName = String(form.get("fullName") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const jobTitle = String(form.get("jobTitle") ?? "").trim();
  const jobId = String(form.get("jobId") ?? "").trim();
  const file = form.get("resume");

  // --- Validate ---------------------------------------------------------
  if (!email) return fail("Email is required.");
  if (!(file instanceof File) || file.size === 0) {
    return fail("No resume file was provided.");
  }

  const lowerName = file.name.toLowerCase();
  const ext = lowerName.slice(lowerName.lastIndexOf("."));
  const fileType = ALLOWED[ext];
  if (!fileType) {
    return fail("Only .pdf and .docx files are allowed.");
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return fail(`Unexpected file type (${file.type}).`);
  }
  if (file.size > MAX_BYTES) {
    return fail("Resume is too large (max 5 MB).");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { first, last } = splitName(fullName);

  // Extract plain text for AI scoring. Non-fatal: if it fails, we still store
  // the file and let scoring back-fill the text later from the binary.
  let resumeText: string | null = null;
  let textWarning: string | null = null;
  try {
    const extracted = await extractResumeText(buffer, fileType);
    resumeText = extracted || null;
    if (!resumeText) textWarning = "No text could be extracted from the resume.";
  } catch (err) {
    textWarning =
      err instanceof Error ? err.message : "Resume text extraction failed";
    console.warn(`[resume-upload] text extraction skipped: ${textWarning}`);
  }

  // --- Insert (parameterized) ------------------------------------------
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("JobId", sql.NVarChar(100), jobId || null)
      .input("FirstName", sql.NVarChar(100), first || null)
      .input("LastName", sql.NVarChar(100), last || null)
      .input("Email", sql.NVarChar(255), email)
      .input("JobTitle", sql.NVarChar(255), jobTitle || null)
      .input("ResumeName", sql.NVarChar(255), file.name)
      .input("Resume", sql.VarBinary(sql.MAX), buffer)
      .input("FileType", sql.NVarChar(20), fileType)
      .input("Phone", sql.NVarChar(50), phone || null)
      .input("ResumeText", sql.NVarChar(sql.MAX), resumeText)
      .input("LoginUserID", sql.Int, loginUserId)
      .query(
        `INSERT INTO ITJC_SCRAPPER.dbo.temp_tbl_resume_upload
           (JobId, FirstName, LastName, Email, JobTitle, ResumeName, Resume, FileType, Phone, ResumeText, LoginUserID)
         OUTPUT INSERTED.ID
         VALUES (@JobId, @FirstName, @LastName, @Email, @JobTitle, @ResumeName, @Resume, @FileType, @Phone, @ResumeText, @LoginUserID)`,
      );

    const id = result.recordset?.[0]?.ID as number | undefined;
    return NextResponse.json({
      ok: true,
      id,
      fileName: file.name,
      fileType,
      size: file.size,
      textExtracted: Boolean(resumeText),
      textWarning,
    });
  } catch (err) {
    // Log id/message only — never the file bytes, email, or credentials.
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error(`[resume-upload] ${message}`);
    return fail("Could not save the resume. Please try again.", 500);
  }
}
