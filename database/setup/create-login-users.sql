/*
  Login users table (Auth.js identities) — run ONCE.
  --------------------------------------------------------------------------
  Run this a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database. Idempotent: the IF OBJECT_ID(...) IS NULL guard means
  re-running it won't recreate or drop the table if it already exists.

  Design intent:
    - Google users:         GoogleEnabled = 1 and GoogleAccountId set.
    - Email/password users: EmailPasswordEnabled = 1 and PasswordHash set.
    - The same email can eventually support BOTH methods (one row per email).
    - Passwords are ALWAYS stored as a bcrypt hash — never plaintext.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.login_users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.login_users (
        ID                   INT IDENTITY(1,1) PRIMARY KEY,
        Email                NVARCHAR(255) NOT NULL UNIQUE,
        Name                 NVARCHAR(255) NULL,
        ImageUrl             NVARCHAR(MAX) NULL,

        PasswordHash         NVARCHAR(255) NULL,

        GoogleAccountId      NVARCHAR(255) NULL,
        GoogleEnabled        BIT NOT NULL DEFAULT 0,
        EmailPasswordEnabled BIT NOT NULL DEFAULT 0,

        LastLoginAt          DATETIME2 NULL,
        CreatedAt            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_login_users_Email
        ON dbo.login_users (Email);
END;
GO
