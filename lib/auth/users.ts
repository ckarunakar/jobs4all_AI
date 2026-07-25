/**
 * Login-user store (Auth.js identities). SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Reads/writes ITJC_SCRAPPER.dbo.login_users via the existing pooled
 * connection. Every value is a bound parameter — no user input is ever
 * concatenated into SQL. Passwords are only ever handled as bcrypt hashes here;
 * this module never sees or stores plaintext.
 */

import "server-only";
import { getPool, sql } from "@/lib/db/sqlServer";

const USERS_TABLE = "ITJC_SCRAPPER.dbo.login_users";

export interface LoginUser {
  id: number;
  email: string;
  name: string | null;
  imageUrl: string | null;
  passwordHash: string | null;
  googleAccountId: string | null;
  googleEnabled: boolean;
  emailPasswordEnabled: boolean;
}

interface UserRow {
  ID: number;
  Email: string;
  Name: string | null;
  ImageUrl: string | null;
  PasswordHash: string | null;
  GoogleAccountId: string | null;
  GoogleEnabled: boolean;
  EmailPasswordEnabled: boolean;
}

function mapUser(row: UserRow): LoginUser {
  return {
    id: Number(row.ID),
    email: String(row.Email),
    name: row.Name ?? null,
    imageUrl: row.ImageUrl ?? null,
    passwordHash: row.PasswordHash ?? null,
    googleAccountId: row.GoogleAccountId ?? null,
    googleEnabled: Boolean(row.GoogleEnabled),
    emailPasswordEnabled: Boolean(row.EmailPasswordEnabled),
  };
}

/** Canonical email form used for all lookups + storage. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserByEmail(email: string): Promise<LoginUser | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("email", sql.NVarChar(255), normalizeEmail(email))
    .query<UserRow>(`SELECT TOP 1 * FROM ${USERS_TABLE} WHERE Email = @email`);
  const row = r.recordset?.[0];
  return row ? mapUser(row) : null;
}

export async function getUserById(id: number): Promise<LoginUser | null> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("id", sql.Int, id)
    .query<UserRow>(`SELECT TOP 1 * FROM ${USERS_TABLE} WHERE ID = @id`);
  const row = r.recordset?.[0];
  return row ? mapUser(row) : null;
}

/** Create a brand-new email/password user (EmailPasswordEnabled = 1). */
export async function createEmailPasswordUser(args: {
  email: string;
  passwordHash: string;
  name?: string | null;
}): Promise<LoginUser> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("email", sql.NVarChar(255), normalizeEmail(args.email))
    .input("name", sql.NVarChar(255), args.name ?? null)
    .input("hash", sql.NVarChar(255), args.passwordHash)
    .query<UserRow>(
      `INSERT INTO ${USERS_TABLE}
         (Email, Name, PasswordHash, EmailPasswordEnabled, LastLoginAt)
       OUTPUT INSERTED.*
       VALUES (@email, @name, @hash, 1, SYSUTCDATETIME())`,
    );
  return mapUser(r.recordset[0]);
}

/** Add a password to an existing (e.g. Google-only) user. */
export async function enableEmailPassword(args: {
  userId: number;
  passwordHash: string;
  name?: string | null;
}): Promise<LoginUser> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("id", sql.Int, args.userId)
    .input("hash", sql.NVarChar(255), args.passwordHash)
    .input("name", sql.NVarChar(255), args.name ?? null)
    .query<UserRow>(
      `UPDATE ${USERS_TABLE}
          SET PasswordHash = @hash,
              EmailPasswordEnabled = 1,
              Name = COALESCE(@name, Name),
              UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE ID = @id`,
    );
  return mapUser(r.recordset[0]);
}

/** Upsert a Google user by email (GoogleEnabled = 1), returning the row. */
export async function upsertGoogleUser(args: {
  email: string;
  name?: string | null;
  imageUrl?: string | null;
  googleAccountId?: string | null;
}): Promise<LoginUser> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("email", sql.NVarChar(255), normalizeEmail(args.email))
    .input("name", sql.NVarChar(255), args.name ?? null)
    .input("image", sql.NVarChar(sql.MAX), args.imageUrl ?? null)
    .input("gid", sql.NVarChar(255), args.googleAccountId ?? null)
    .query<UserRow>(
      `MERGE ${USERS_TABLE} WITH (HOLDLOCK) AS t
         USING (SELECT @email AS Email) AS s ON t.Email = s.Email
       WHEN MATCHED THEN UPDATE SET
         Name = COALESCE(@name, t.Name),
         ImageUrl = COALESCE(@image, t.ImageUrl),
         GoogleAccountId = @gid,
         GoogleEnabled = 1,
         LastLoginAt = SYSUTCDATETIME(),
         UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT
         (Email, Name, ImageUrl, GoogleAccountId, GoogleEnabled, LastLoginAt)
         VALUES (@email, @name, @image, @gid, 1, SYSUTCDATETIME())
       OUTPUT INSERTED.*;`,
    );
  return mapUser(r.recordset[0]);
}

export async function updateLastLogin(userId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, userId)
    .query(
      `UPDATE ${USERS_TABLE}
          SET LastLoginAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
        WHERE ID = @id`,
    );
}
