# Live DB Cutover Hotfix — Design

**Date:** 2026-08-05
**Goal:** Email/password login works on the deployed server immediately. The deployed code queries the production table names (`login_users`, `resume_upload`, `career_ops_scores`, `user_job_seen`) while the live `ITJC_SCRAPPER` database still has the `temp_`-prefixed names, so auth throws "Invalid object name". This executes the cutover that the production-cleanup spec planned.

## Decision

Rename the live tables (the planned cutover) — do NOT revert the code. Reverting would reintroduce the temp names into the reviewed, pushed production codebase.

## Components

1. **One-off runner (never committed).** A Node script in the session scratchpad:
   - Parses `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` from the local `.env.local` in-process; secret values are never printed or logged.
   - Connects with the repo's existing `mssql` package, database `ITJC_SCRAPPER`.
   - The `mssql` driver does not understand `GO` separators, so the runner executes the same four guarded renames as `database/migrate/rename-to-production.sql` as individual statements. That SQL file remains the canonical artifact for anyone re-running via DBeaver.

2. **Pre-flight → rename → verify, single run:**
   - Pre-flight: query `sys.tables` for all 8 candidate names (4 old, 4 new); `SELECT COUNT(*)` on each app table that exists. If any table is missing under BOTH names, abort with a report — no renames run (schema drift needs a human).
   - Execute the four guarded renames (`old exists AND new absent → sp_rename`).
   - Post-verify: `sys.tables` shows exactly the 4 new names and none of the old; row counts equal pre-flight counts.
   - The scraper-owned `temp_tbl_Scrap_jobs` is never touched.

3. **App-side confirmation:** `curl` the server's `/api/jobs` as a general health signal; the definitive `login_users` test is a real email/password login by the user at the server URL. Google OAuth remains blocked until the site has a domain + HTTPS (out of scope here).

4. **Repo follow-up (tiny):** add a commented `AUTH_URL=` placeholder (NextAuth v5 name) with a one-line note to `.env.example` for server deploys — `auth.ts` already sets `trustHost: true`. No real server IP is committed. Commit and push.

## Error handling

- Connection failure from this machine (firewall): fall back to the user running `database/migrate/rename-to-production.sql` in DBeaver; the runner's verification queries are handed over as plain SQL.
- Partial state (some tables already renamed): the guards make re-running safe; the verify step reports the exact final state either way.

## Verification

- DB-side: post-rename `sys.tables` listing + row-count match.
- App-side: user performs an email/password login at the deployed server URL.

## Out of scope

- Google OAuth enablement (needs domain + HTTPS).
- Any application code changes.
- Secret rotation (still an outstanding user action from the production-cleanup spec).
