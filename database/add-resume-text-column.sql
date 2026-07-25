/*
  Add ResumeText column to the resume-upload table — run ONCE.
  --------------------------------------------------------------------------
  Run this a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database. Idempotent: the COL_LENGTH(...) guard means re-running
  it will NOT error or duplicate the column.

  Why: resumes are stored as the original binary (Resume VARBINARY(MAX)), but AI
  scoring needs plain text. On upload the app extracts text (.pdf via pdf-parse,
  .docx via mammoth) and stores it here. Existing rows with a NULL ResumeText are
  back-filled on demand the first time they're scored.
*/

USE [ITJC_SCRAPPER];
GO

IF COL_LENGTH('dbo.temp_tbl_resume_upload', 'ResumeText') IS NULL
BEGIN
    ALTER TABLE dbo.temp_tbl_resume_upload
        ADD ResumeText NVARCHAR(MAX) NULL;
END;
GO
