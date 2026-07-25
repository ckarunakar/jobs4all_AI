/*
  Career-Ops AI score cache table — run ONCE.
  --------------------------------------------------------------------------
  Run this a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database. Idempotent: the IF OBJECT_ID(...) IS NULL guard means
  re-running it will NOT recreate or drop the table if it already exists.

  Caches one AI evaluation per (resume, job, model, rubric) so repeated
  "Score top 10" clicks reuse results instead of re-calling the model. The
  unique index enforces one row per combination (upserts update in place).

  Scores compare a resume (ITJC_SCRAPPER.dbo.temp_tbl_resume_upload.ID) against a
  job (ITJC.dbo.tbl_JobMaster.ID). JSON columns hold the structured detail.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.temp_tbl_career_ops_scores', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.temp_tbl_career_ops_scores (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        ResumeUploadID  INT            NOT NULL,
        UserEmail       NVARCHAR(255)  NOT NULL,
        JobID           VARCHAR(100)   NOT NULL,
        ModelName       NVARCHAR(100)  NOT NULL,
        RubricVersion   NVARCHAR(50)   NOT NULL,
        Score           DECIMAL(3,1)   NOT NULL,
        Label           NVARCHAR(100)  NOT NULL,
        Recommendation  NVARCHAR(100)  NOT NULL,
        Summary         NVARCHAR(MAX)  NULL,
        ProsJson        NVARCHAR(MAX)  NULL,
        ConsJson        NVARCHAR(MAX)  NULL,
        WarningsJson    NVARCHAR(MAX)  NULL,
        DimensionsJson  NVARCHAR(MAX)  NULL,
        RawResponseJson NVARCHAR(MAX)  NULL,
        CreatedAt       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE UNIQUE INDEX UX_temp_tbl_career_ops_scores_resume_job_model_rubric
        ON dbo.temp_tbl_career_ops_scores
        (ResumeUploadID, JobID, ModelName, RubricVersion);
END;
GO
