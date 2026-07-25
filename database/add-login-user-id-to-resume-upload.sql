/*
  Link resumes to logged-in users — run ONCE.
  --------------------------------------------------------------------------
  Run this a single time in DBeaver connected to ITJC_SCRAPPER. Idempotent:
  the COL_LENGTH / sys.indexes guards make it safe to re-run.

  Adds a nullable LoginUserID to the existing resume-upload table so uploads can
  be tied to a temp_login_users.ID. Existing email-based rows keep working — the
  Email column and all other columns are untouched.
*/

USE [ITJC_SCRAPPER];
GO

IF COL_LENGTH('dbo.temp_tbl_resume_upload', 'LoginUserID') IS NULL
BEGIN
    ALTER TABLE dbo.temp_tbl_resume_upload
        ADD LoginUserID INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_temp_tbl_resume_upload_LoginUserID_uploadDate'
      AND object_id = OBJECT_ID('dbo.temp_tbl_resume_upload')
)
BEGIN
    CREATE INDEX IX_temp_tbl_resume_upload_LoginUserID_uploadDate
        ON dbo.temp_tbl_resume_upload (LoginUserID, uploadDate DESC);
END;
GO
