/*
  Resume upload table — run ONCE.
  --------------------------------------------------------------------------
  Run this a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database. Idempotent: the IF OBJECT_ID(...) IS NULL guard means
  re-running it will NOT recreate or drop the table if it already exists.

  The app itself NEVER creates this table on upload — it only INSERTs rows.

  Stores applicant info plus the uploaded resume file as VARBINARY(MAX)
  (.pdf/.docx only, enforced by the API route). ResumeText holds the extracted
  plain text used for AI scoring (extracted on upload; old rows back-filled on
  first score). LoginUserID ties an upload to login_users.ID.

  NOTE: on the live DB this table already exists (renamed from
  temp_tbl_resume_upload with the ResumeText/LoginUserID columns already
  applied) — this script is for standing up a fresh environment.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.resume_upload', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.resume_upload (
        ID          INT IDENTITY(1,1) PRIMARY KEY,
        JobId       NVARCHAR(100)  NULL,
        FirstName   NVARCHAR(100)  NULL,
        LastName    NVARCHAR(100)  NULL,
        Email       NVARCHAR(255)  NOT NULL,
        JobTitle    NVARCHAR(255)  NULL,
        ResumeName  NVARCHAR(255)  NOT NULL,
        Resume      VARBINARY(MAX) NOT NULL,
        FileType    NVARCHAR(20)   NOT NULL,   -- "pdf" or "docx"
        Phone       NVARCHAR(50)   NULL,
        ResumeText  NVARCHAR(MAX)  NULL,
        LoginUserID INT            NULL,
        uploadDate  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_resume_upload_LoginUserID_uploadDate
        ON dbo.resume_upload (LoginUserID, uploadDate DESC);
END;
GO
