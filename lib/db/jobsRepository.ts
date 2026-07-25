/**
 * Read-only jobs repository. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Reads scraped jobs from the single table ITJC_SCRAPPER.dbo.temp_tbl_Scrap_jobs
 * (descriptions are inline — no join) and maps rows to `JobListing`. The natural
 * key is `job_reference` (unique). Filtering (job type / city / recency / sort)
 * happens here in SQL with parameterized WHERE clauses — never in React. No user
 * input is ever concatenated into SQL; the table name and ORDER BY come from
 * fixed, allowlisted strings only.
 */

import "server-only";
import { getPool, sql } from "./sqlServer";
import { stripHtml } from "@/lib/utils/text";
import { classifyJobType, JOB_TYPE_CATEGORIES } from "@/lib/jobs/jobTypes";
import type { JobFilters, JobListing } from "@/types/jobListing";

const JOBS_TABLE = "ITJC_SCRAPPER.dbo.temp_tbl_Scrap_jobs";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

function toIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

interface RawRow {
  id?: unknown; // job_reference
  title?: unknown;
  company?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  country?: unknown;
  locationRaw?: unknown; // the pre-formatted Location column
  url?: unknown;
  jobType?: unknown;
  postedAt?: unknown;
  isRemote?: unknown;
  category?: unknown;
  description?: unknown;
}

function mapRow(row: RawRow): JobListing | null {
  const id = str(row.id);
  const title = str(row.title);
  // A listing needs its key (job_reference) and a title.
  if (!id || !title) return null;

  const city = str(row.city);
  const state = str(row.state);
  const zip = str(row.zip);
  const cityState = [city, state].filter(Boolean).join(", ");
  const built = cityState ? cityState + (zip ? ` ${zip}` : "") : zip;
  // Prefer City/State/Zip; fall back to the raw Location column.
  const location = built || str(row.locationRaw) || "Location not specified";

  // Description is inline on this table (HTML-stripped, never null).
  const description = stripHtml(str(row.description)) || "";

  return {
    id,
    jobReference: id,
    title,
    company: str(row.company) || "Unknown Company",
    location,
    city,
    state,
    zip,
    country: str(row.country),
    isRemote: row.isRemote == null ? undefined : Number(row.isRemote) === 1,
    category: str(row.category),
    url: str(row.url),
    jobType: str(row.jobType),
    postedAt: toIso(row.postedAt),
    description,
    source: "sql-server",
  };
}

/** Column list shared by the list + by-id queries (aliased to RawRow keys). */
const SELECT_COLUMNS = `
  job_reference AS id,
  Title         AS title,
  company       AS company,
  city          AS city,
  state         AS state,
  zip           AS zip,
  country       AS country,
  Location      AS locationRaw,
  url           AS url,
  job_type      AS jobType,
  posted_at     AS postedAt,
  Isremote      AS isRemote,
  category      AS category,
  description   AS description`;

/**
 * Run the read-only, filtered query and return normalized listings. When
 * `loginUserId` is given, jobs the user has already seen are excluded in SQL
 * (NOT EXISTS) — never pulled into Node.
 */
export async function fetchJobListings(
  filters: JobFilters = {},
  loginUserId?: number,
): Promise<JobListing[]> {
  const limit = Math.min(
    Math.max(Math.trunc(filters.limit ?? DEFAULT_LIMIT), 1),
    MAX_LIMIT,
  );

  const pool = await getPool();
  const request = pool.request();
  request.input("limit", sql.Int, limit);

  const where: string[] = ["Title IS NOT NULL"];

  if (filters.search) {
    request.input("search", sql.NVarChar, `%${filters.search}%`);
    where.push("(Title LIKE @search OR company LIKE @search)");
  }
  if (filters.state) {
    request.input("state", sql.NVarChar, filters.state);
    where.push("state = @state");
  }
  if (filters.city) {
    request.input("city", sql.NVarChar, filters.city);
    where.push("city = @city");
  }
  // Job type is a normalized category (e.g. "Full-time"); expand it to every
  // raw variant that classifies into it, then match with an IN list.
  if (filters.jobType) {
    if (filters.jobType === "Not specified") {
      where.push("(job_type IS NULL OR LTRIM(RTRIM(job_type)) = '')");
    } else {
      const distinct = await pool.request().query<{ job_type: string }>(
        `SELECT DISTINCT job_type FROM ${JOBS_TABLE}
          WHERE job_type IS NOT NULL AND LTRIM(RTRIM(job_type)) <> ''`,
      );
      const variants = distinct.recordset
        .map((r) => String(r.job_type))
        .filter((v) => classifyJobType(v) === filters.jobType);
      if (variants.length === 0) {
        where.push("1 = 0"); // unknown category → no matches
      } else {
        variants.forEach((v, i) => request.input(`jt${i}`, sql.NVarChar, v));
        where.push(
          `job_type IN (${variants.map((_, i) => `@jt${i}`).join(", ")})`,
        );
      }
    }
  }

  // Recency: posted_at within the past N days (1 = past 24h). Nulls excluded
  // when a recency filter is active. The datepart keyword is fixed; only the
  // numeric window is bound.
  if (filters.postedWithinDays === 1) {
    where.push(
      "posted_at IS NOT NULL AND posted_at >= DATEADD(hour, -24, GETUTCDATE())",
    );
  } else if (
    filters.postedWithinDays === 7 ||
    filters.postedWithinDays === 30
  ) {
    request.input("postedDays", sql.Int, filters.postedWithinDays);
    where.push(
      "posted_at IS NOT NULL AND posted_at >= DATEADD(day, -@postedDays, GETUTCDATE())",
    );
  }

  // Exclude jobs this user has already swiped/reviewed (persistent, SQL-side).
  if (loginUserId != null) {
    request.input("loginUserId", sql.Int, loginUserId);
    where.push(
      `NOT EXISTS (
         SELECT 1 FROM ITJC_SCRAPPER.dbo.temp_user_job_seen s
         WHERE s.LoginUserID = @loginUserId
           AND s.JobReference = job_reference
           AND s.SourceTable = 'temp_tbl_Scrap_jobs'
       )`,
    );
  }

  // ORDER BY is an allowlisted string (never user input):
  //  - newest  → posted_at DESC
  //  - default → diverse company round-robin (random pick per company)
  const orderBy =
    filters.sort === "newest" ? "posted_at DESC" : "companyRank, NEWID()";

  const query = `
    WITH filtered AS (
      SELECT
        job_reference, Title, company, city, state, zip, country, Location, url,
        job_type, posted_at, Isremote, category, description,
        ROW_NUMBER() OVER (PARTITION BY company ORDER BY NEWID()) AS companyRank
      FROM ${JOBS_TABLE}
      WHERE ${where.join(" AND ")}
    )
    SELECT TOP (@limit) ${SELECT_COLUMNS}
    FROM filtered
    ORDER BY ${orderBy}`;

  const result = await request.query<RawRow>(query);
  const rows: RawRow[] = Array.from(result.recordset);
  return rows.map(mapRow).filter((j): j is JobListing => j !== null);
}

/** Popular cities surfaced first in the filter panel (before the user types). */
const COMMON_CITIES = [
  "San Francisco",
  "New York",
  "Chicago",
  "Boston",
  "Seattle",
  "Austin",
  "Atlanta",
  "Los Angeles",
  "Washington",
  "Dallas",
];

export interface FilterOptions {
  /** Common cities that actually exist in the data (shown first, in order). */
  commonCities: string[];
  /** City autocomplete matches for `citySearch` (empty when no search). */
  cities: string[];
  /** Distinct job_type values. */
  jobTypes: string[];
}

/**
 * Options for the filter panel: distinct job types, the common-city shortlist
 * (filtered to cities present in the data), and — when `citySearch` is given —
 * up to 20 matching city suggestions. All parameterized.
 */
export async function fetchFilterOptions(
  citySearch?: string,
): Promise<FilterOptions> {
  const pool = await getPool();

  // Distinct raw job types → clean categories that are actually present.
  const jobTypesRes = await pool.request().query<{ job_type: string }>(
    `SELECT DISTINCT job_type
       FROM ${JOBS_TABLE}
      WHERE job_type IS NOT NULL AND LTRIM(RTRIM(job_type)) <> ''`,
  );
  const presentCategories = new Set(
    jobTypesRes.recordset.map((r) => classifyJobType(r.job_type)),
  );
  const jobTypes = JOB_TYPE_CATEGORIES.filter((c) =>
    presentCategories.has(c),
  );

  // Which common cities exist in the data (bound params, fixed placeholders).
  const commonReq = pool.request();
  COMMON_CITIES.forEach((c, i) => commonReq.input(`c${i}`, sql.NVarChar(200), c));
  const placeholders = COMMON_CITIES.map((_, i) => `@c${i}`).join(", ");
  const commonRes = await commonReq.query<{ city: string }>(
    `SELECT DISTINCT city FROM ${JOBS_TABLE} WHERE city IN (${placeholders})`,
  );
  const present = new Set(commonRes.recordset.map((r) => String(r.city)));
  const commonCities = COMMON_CITIES.filter((c) => present.has(c));

  // City autocomplete (contains match), capped.
  let cities: string[] = [];
  const q = citySearch?.trim();
  if (q) {
    const cityRes = await pool
      .request()
      .input("q", sql.NVarChar(200), `%${q}%`)
      .query<{ city: string }>(
        `SELECT DISTINCT TOP 20 city
           FROM ${JOBS_TABLE}
          WHERE city IS NOT NULL AND LTRIM(RTRIM(city)) <> '' AND city LIKE @q
          ORDER BY city`,
      );
    cities = cityRes.recordset.map((r) => String(r.city));
  }

  return { commonCities, cities, jobTypes };
}

/** Fetch a single job by its job_reference (parameterized). */
export async function fetchJobById(id: string): Promise<JobListing | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.VarChar(200), id)
    .query<RawRow>(
      `SELECT TOP 1 ${SELECT_COLUMNS}
       FROM ${JOBS_TABLE}
       WHERE job_reference = @id`,
    );

  const row = result.recordset?.[0];
  return row ? mapRow(row) : null;
}
