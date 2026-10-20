/*
  Mobile app sessions (native-app Bearer tokens) — run ONCE.
  --------------------------------------------------------------------------
  Run a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database, BEFORE deploying the code that uses it. Idempotent:
  the IF OBJECT_ID(...) IS NULL guard makes re-running a no-op.

  Design (docs/superpowers/specs/2026-10-16-mobile-backend-readiness-design.md):
    - One row per signed-in app install. TokenHash is the SHA-256 hex of an
      opaque random token; the token itself is never stored.
    - 90-day sliding expiry (ExpiresAt), refreshed at most daily (LastUsedAt).
    - No ON DELETE CASCADE (matches user_job_seen): account deletion removes
      these rows explicitly.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.mobile_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.mobile_sessions (
        ID           INT IDENTITY(1,1) PRIMARY KEY,
        LoginUserID  INT           NOT NULL,
        TokenHash    CHAR(64)      NOT NULL,
        DeviceName   NVARCHAR(100) NULL,
        CreatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        LastUsedAt   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        ExpiresAt    DATETIME2     NOT NULL,
        CONSTRAINT FK_mobile_sessions_login_user
            FOREIGN KEY (LoginUserID) REFERENCES dbo.login_users (ID)
    );

    -- Token lookup (one indexed equality probe per authenticated request).
    CREATE UNIQUE INDEX UX_mobile_sessions_TokenHash
        ON dbo.mobile_sessions (TokenHash);

    -- Per-user cleanup (expired rows on login, all rows on account deletion).
    CREATE INDEX IX_mobile_sessions_LoginUserID
        ON dbo.mobile_sessions (LoginUserID);
END;
GO
