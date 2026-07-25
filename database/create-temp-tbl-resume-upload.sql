/*
  Resume upload table — run ONCE.
  --------------------------------------------------------------------------
  Run this a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database, or via a one-off migration script. It is idempotent:
  the IF OBJECT_ID(...) IS NULL guard means re-running it will NOT recreate or
  drop the table if it already exists, so it is safe to run more than once.

  The app itself NEVER creates this table on upload — it only INSERTs rows.

  Stores basic applicant info plus the uploaded resume file as VARBINARY(MAX).
  Only .pdf and .docx files are uploaded (enforced by the API route). The
  Resume column is intended to later be read by AI to produce a Career-Ops
  best-fit score against jobs.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.temp_tbl_resume_upload', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.temp_tbl_resume_upload (
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
        uploadDate  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO
