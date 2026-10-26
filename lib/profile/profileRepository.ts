/**
 * Server-side profile storage. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * One row per user in ITJC_SCRAPPER.dbo.user_profiles: the profile as JSON
 * plus the "use my profile to filter jobs" switch. Reads run the stored JSON
 * back through the validator, so a damaged row reads as "no profile" instead
 * of breaking the page. All values are bound parameters.
 */

import "server-only";
import { getPool, sql } from "@/lib/db/sqlServer";
import { sanitizeProfile, type StoredProfile } from "./sanitizeProfile";

const PROFILES_TABLE = "ITJC_SCRAPPER.dbo.user_profiles";
const RESUME_TABLE = "ITJC_SCRAPPER.dbo.resume_upload";

export interface ProfileRow {
  profile: StoredProfile;
  prefFilters: boolean;
  updatedAt: Date;
}

interface RawRow {
  ProfileJson: string;
  PrefFilters: boolean;
  UpdatedAt: Date;
}

function toProfileRow(userId: number, raw: RawRow): ProfileRow | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.ProfileJson);
  } catch {
    parsed = null;
  }
  const profile = sanitizeProfile(parsed);
  if (!profile) {
    console.error(`[profile] stored profile unreadable for user ${userId}`);
    return null;
  }
  return {
    profile,
    prefFilters: Boolean(raw.PrefFilters),
    updatedAt: raw.UpdatedAt,
  };
}

export async function getProfileRow(userId: number): Promise<ProfileRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, userId)
    .query<RawRow>(
      `SELECT ProfileJson, PrefFilters, UpdatedAt
         FROM ${PROFILES_TABLE} WHERE LoginUserID = @id;`,
    );
  const raw = result.recordset[0];
  return raw ? toProfileRow(userId, raw) : null;
}

/**
 * Create or replace the user's profile (one MERGE, so two simultaneous first
 * saves can't collide). An undefined `prefFilters` keeps the stored value
 * (true for a new row).
 */
export async function upsertProfile(
  userId: number,
  profile: StoredProfile,
  prefFilters: boolean | undefined,
): Promise<ProfileRow> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, userId)
    .input("profileJson", sql.NVarChar(sql.MAX), JSON.stringify(profile))
    .input("prefFilters", sql.Bit, prefFilters ?? null)
    .query<RawRow>(
      `MERGE ${PROFILES_TABLE} WITH (HOLDLOCK) AS target
         USING (SELECT @id AS LoginUserID) AS source
         ON target.LoginUserID = source.LoginUserID
       WHEN MATCHED THEN UPDATE SET
         ProfileJson = @profileJson,
         PrefFilters = COALESCE(@prefFilters, target.PrefFilters),
         UpdatedAt   = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (LoginUserID, ProfileJson, PrefFilters)
         VALUES (@id, @profileJson, COALESCE(@prefFilters, 1))
       OUTPUT inserted.ProfileJson, inserted.PrefFilters, inserted.UpdatedAt;`,
    );
  const raw = result.recordset[0];
  return { profile, prefFilters: Boolean(raw.PrefFilters), updatedAt: raw.UpdatedAt };
}

/** Ids of the resume uploads this user owns (same match as account deletion). */
export async function getOwnResumeUploadIds(
  userId: number,
  email: string,
): Promise<Set<number>> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, userId)
    .input("email", sql.NVarChar(255), email)
    .query<{ ID: number }>(
      `SELECT ID FROM ${RESUME_TABLE} WHERE LoginUserID = @id OR Email = @email;`,
    );
  return new Set(result.recordset.map((r) => r.ID));
}
