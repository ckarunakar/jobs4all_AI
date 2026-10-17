/**
 * Native-app sessions (ITJC_SCRAPPER.dbo.mobile_sessions). SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Opaque Bearer tokens for the mobile app (2026-10-16 spec). A token is 32
 * random bytes (base64url, 43 chars) handed to the client once; only its
 * SHA-256 hex is stored, so a database leak exposes no usable tokens. An
 * unsalted hash is safe because the input is 256 random bits, and it keeps
 * lookups to one indexed equality probe.
 *
 * Expiry is 90 days, sliding: a resolve refreshes LastUsedAt/ExpiresAt only
 * when LastUsedAt is over 24h old (at most one write per device per day).
 * All time math is SQL Server's clock (SYSUTCDATETIME). Never log tokens.
 */

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getPool, sql } from "@/lib/db/sqlServer";

const SESSIONS_TABLE = "ITJC_SCRAPPER.dbo.mobile_sessions";
const USERS_TABLE = "ITJC_SCRAPPER.dbo.login_users";
const SESSION_DAYS = 90;
const TOUCH_AFTER_HOURS = 24;
const MAX_DEVICE_NAME = 100;

/** The signed-in user a token resolves to. Email is read live from login_users. */
export interface MobileUser {
  id: number;
  email: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Start a session; returns the token (shown once) and its expiry. */
export async function createMobileSession(
  userId: number,
  deviceName: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const pool = await getPool();
  const r = await pool
    .request()
    .input("uid", sql.Int, userId)
    .input("hash", sql.Char(64), hashToken(token))
    .input(
      "device",
      sql.NVarChar(MAX_DEVICE_NAME),
      deviceName ? deviceName.slice(0, MAX_DEVICE_NAME) : null,
    )
    .input("days", sql.Int, SESSION_DAYS)
    .query<{ ExpiresAt: Date }>(
      `INSERT INTO ${SESSIONS_TABLE} (LoginUserID, TokenHash, DeviceName, ExpiresAt)
       OUTPUT INSERTED.ExpiresAt
       VALUES (@uid, @hash, @device, DATEADD(day, @days, SYSUTCDATETIME()))`,
    );
  return { token, expiresAt: r.recordset[0].ExpiresAt };
}

interface ResolveRow {
  SessionID: number;
  UserID: number;
  Email: string;
  NeedsTouch: number;
}

/**
 * The user behind a live (unexpired) token, or null. Joining login_users means
 * a deleted user's token can never resolve, even mid-deletion. Throws on DB
 * errors — callers must not treat a DB failure as "signed out".
 */
export async function resolveMobileToken(
  token: string,
): Promise<MobileUser | null> {
  if (!token) return null;
  const pool = await getPool();
  const r = await pool
    .request()
    .input("hash", sql.Char(64), hashToken(token))
    .input("touchHours", sql.Int, TOUCH_AFTER_HOURS)
    .query<ResolveRow>(
      `SELECT TOP 1
              s.ID AS SessionID,
              u.ID AS UserID,
              u.Email,
              CASE WHEN s.LastUsedAt < DATEADD(hour, -@touchHours, SYSUTCDATETIME())
                   THEN 1 ELSE 0 END AS NeedsTouch
         FROM ${SESSIONS_TABLE} s
         JOIN ${USERS_TABLE} u ON u.ID = s.LoginUserID
        WHERE s.TokenHash = @hash
          AND s.ExpiresAt > SYSUTCDATETIME()`,
    );
  const row = r.recordset?.[0];
  if (!row) return null;

  if (row.NeedsTouch) {
    // Non-fatal: the token is valid either way; a missed refresh only means
    // the next request tries again.
    try {
      await pool
        .request()
        .input("id", sql.Int, row.SessionID)
        .input("days", sql.Int, SESSION_DAYS)
        .query(
          `UPDATE ${SESSIONS_TABLE}
              SET LastUsedAt = SYSUTCDATETIME(),
                  ExpiresAt = DATEADD(day, @days, SYSUTCDATETIME())
            WHERE ID = @id`,
        );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mobileSessions] expiry refresh failed for session ${row.SessionID}: ${message}`);
    }
  }

  return { id: Number(row.UserID), email: String(row.Email) };
}

/** End one session (logout). A token that's already gone is not an error. */
export async function revokeMobileSession(token: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("hash", sql.Char(64), hashToken(token))
    .query(`DELETE FROM ${SESSIONS_TABLE} WHERE TokenHash = @hash`);
}

/** Drop this user's expired rows (run on each login — no scheduled job). */
export async function deleteExpiredSessions(userId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("uid", sql.Int, userId)
    .query(
      `DELETE FROM ${SESSIONS_TABLE}
        WHERE LoginUserID = @uid AND ExpiresAt <= SYSUTCDATETIME()`,
    );
}
