/*
  RECOMMENDED (optional) indexes for filtered job queries — review before running.
  --------------------------------------------------------------------------
  The app NEVER runs these; run them manually in DBeaver if/when the filtered
  feed feels slow. They are non-clustered indexes with existence guards, so
  re-running is safe and won't error or duplicate.

  Why: the swipe filter panel sends job type / city / recency to /api/jobs, which
  turns them into parameterized WHERE clauses. SQL Server should satisfy those
  from indexes and return only the small matching, limited result set (TOP N) —
  the browser never receives the whole table. With ~19k rows these filters are
  fine without indexes, but as the table grows these keep WHERE/ORDER BY fast.

  Table: ITJC_SCRAPPER.dbo.temp_tbl_Scrap_jobs
*/

USE [ITJC_SCRAPPER];
GO

-- Filter by job type (equality).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_temp_tbl_Scrap_jobs_job_type')
    CREATE NONCLUSTERED INDEX IX_temp_tbl_Scrap_jobs_job_type
        ON dbo.temp_tbl_Scrap_jobs (job_type);
GO

-- Filter by city (equality / autocomplete LIKE).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_temp_tbl_Scrap_jobs_city')
    CREATE NONCLUSTERED INDEX IX_temp_tbl_Scrap_jobs_city
        ON dbo.temp_tbl_Scrap_jobs (city);
GO

-- Recency filter + "newest" sort (posted_at range / ORDER BY posted_at DESC).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_temp_tbl_Scrap_jobs_posted_at')
    CREATE NONCLUSTERED INDEX IX_temp_tbl_Scrap_jobs_posted_at
        ON dbo.temp_tbl_Scrap_jobs (posted_at DESC);
GO

-- Composite for combined city + job type + recency filtering (most selective
-- leading columns first). Drop/adjust if your filter mix differs.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_temp_tbl_Scrap_jobs_city_jobtype_posted')
    CREATE NONCLUSTERED INDEX IX_temp_tbl_Scrap_jobs_city_jobtype_posted
        ON dbo.temp_tbl_Scrap_jobs (city, job_type, posted_at DESC);
GO
