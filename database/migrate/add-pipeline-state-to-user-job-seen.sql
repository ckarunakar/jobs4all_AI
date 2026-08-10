/*
  Pipeline state columns for user_job_seen — run ONCE against the live DB.
  --------------------------------------------------------------------------
  Run a single time in DBeaver connected to ITJC_SCRAPPER (same procedure as
  rename-to-production.sql). Idempotent: each ALTER is guarded by COL_LENGTH,
  so re-running is a no-op. Adds notes + a job snapshot (title/company/
  location/url captured at write time) so tracked jobs outlive scraper churn.
  LastAction now stores the full pipeline status (interested|saved|ready|
  applied|interview|rejected|skipped); existing rows already hold a valid
  subset and are untouched.
*/

USE [ITJC_SCRAPPER];
GO

IF COL_LENGTH('dbo.user_job_seen', 'Notes') IS NULL
    ALTER TABLE dbo.user_job_seen ADD Notes NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.user_job_seen', 'JobTitle') IS NULL
    ALTER TABLE dbo.user_job_seen ADD JobTitle NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.user_job_seen', 'JobCompany') IS NULL
    ALTER TABLE dbo.user_job_seen ADD JobCompany NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.user_job_seen', 'JobLocation') IS NULL
    ALTER TABLE dbo.user_job_seen ADD JobLocation NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.user_job_seen', 'JobUrl') IS NULL
    ALTER TABLE dbo.user_job_seen ADD JobUrl NVARCHAR(2000) NULL;
GO
