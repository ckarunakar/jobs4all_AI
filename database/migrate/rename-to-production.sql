/*
  Rename app-owned tables to production names — run ONCE at cutover.
  --------------------------------------------------------------------------
  Run in DBeaver (or any SQL client) connected to ITJC_SCRAPPER, BEFORE
  deploying app code that queries the new names. Renames tables in place —
  no data is copied or lost. Idempotent: each rename is guarded so re-running
  is safe. Indexes, constraints, and FKs keep their old names (harmless).

  The scraper-owned dbo.temp_tbl_Scrap_jobs is intentionally NOT renamed.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.temp_login_users', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.login_users', 'U') IS NULL
    EXEC sp_rename 'dbo.temp_login_users', 'login_users';
GO

IF OBJECT_ID('dbo.temp_tbl_resume_upload', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.resume_upload', 'U') IS NULL
    EXEC sp_rename 'dbo.temp_tbl_resume_upload', 'resume_upload';
GO

IF OBJECT_ID('dbo.temp_tbl_career_ops_scores', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.career_ops_scores', 'U') IS NULL
    EXEC sp_rename 'dbo.temp_tbl_career_ops_scores', 'career_ops_scores';
GO

IF OBJECT_ID('dbo.temp_user_job_seen', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.user_job_seen', 'U') IS NULL
    EXEC sp_rename 'dbo.temp_user_job_seen', 'user_job_seen';
GO
