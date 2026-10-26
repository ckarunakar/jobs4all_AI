/*
  Server-side user profile — run ONCE.
  --------------------------------------------------------------------------
  Run a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database, BEFORE deploying the code that uses it. Idempotent:
  the IF OBJECT_ID(...) IS NULL guard makes re-running a no-op.

  Design (docs/superpowers/specs/2026-10-20-server-side-profile-design.md):
    - One row per account (LoginUserID is the primary key). ProfileJson holds
      the sanitized profile; PrefFilters is the "use my profile as filters"
      toggle, kept as its own column.
    - No ON DELETE CASCADE (matches mobile_sessions): account deletion removes
      the row explicitly.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.user_profiles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_profiles (
        LoginUserID  INT           NOT NULL PRIMARY KEY,
        ProfileJson  NVARCHAR(MAX) NOT NULL,
        PrefFilters  BIT           NOT NULL DEFAULT 1,
        CreatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_profiles_login_user
            FOREIGN KEY (LoginUserID) REFERENCES dbo.login_users (ID)
    );
END
GO
