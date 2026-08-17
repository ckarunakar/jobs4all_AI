/*
  Per-user job pipeline state — run ONCE.
  --------------------------------------------------------------------------
  Run this a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database. Idempotent: the IF OBJECT_ID(...) IS NULL guard means
  re-running it won't recreate or drop the table if it already exists.

  Stores the user's full pipeline state for each job (status in LastAction, notes,
  and a job snapshot captured at write time). Keyed by (LoginUserID, JobReference,
  SourceTable) — one row per user+job. A FK to login_users keeps LoginUserID
  honest (safe: ids come from the session).
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.user_job_seen', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_job_seen (
        ID           INT IDENTITY(1,1) PRIMARY KEY,
        LoginUserID  INT           NOT NULL,
        JobReference NVARCHAR(255) NOT NULL,
        SourceTable  NVARCHAR(100) NOT NULL DEFAULT 'temp_tbl_Scrap_jobs',
        LastAction   NVARCHAR(50)  NULL,
        Notes        NVARCHAR(MAX) NULL,
        JobTitle     NVARCHAR(500) NULL,
        JobCompany   NVARCHAR(500) NULL,
        JobLocation  NVARCHAR(500) NULL,
        JobUrl       NVARCHAR(2000) NULL,
        SeenAt       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_job_seen_login_user
            FOREIGN KEY (LoginUserID)
            REFERENCES dbo.login_users (ID)
    );

    -- One row per user + job + source (drives the upsert + NOT EXISTS filter).
    CREATE UNIQUE INDEX UX_user_job_seen_user_job
        ON dbo.user_job_seen (LoginUserID, JobReference, SourceTable);

    -- Fast "most recently seen for this user" lookups.
    CREATE INDEX IX_user_job_seen_user_seenat
        ON dbo.user_job_seen (LoginUserID, SeenAt DESC);
END;
GO
