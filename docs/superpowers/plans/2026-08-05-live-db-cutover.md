# Live DB Cutover Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make email/password login work on the deployed server by renaming the four app-owned tables in the live `ITJC_SCRAPPER` database to the production names the deployed code already queries.

**Architecture:** A one-off Node runner (kept OUTSIDE the repo, deleted after use) executes the same guarded renames as `database/migrate/rename-to-production.sql` via the repo's `mssql` package, with pre-flight and post-verify queries in the same run. One tiny repo change follows: an `AUTH_URL` placeholder note in `.env.example`.

**Tech Stack:** Node 18+ ESM script, `mssql` (already in the repo's node_modules), SQL Server (`sp_rename`, `sys.tables`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-05-live-db-cutover-design.md`.
- The runner script is NEVER committed; it lives in the session scratchpad and is deleted after use.
- Secret values from `.env.local` are parsed in-process and NEVER printed, logged, or echoed. Never `cat` `.env.local`.
- Only the four app-owned tables are renamed: `temp_login_users`→`login_users`, `temp_tbl_resume_upload`→`resume_upload`, `temp_tbl_career_ops_scores`→`career_ops_scores`, `temp_user_job_seen`→`user_job_seen`. The scraper-owned `temp_tbl_Scrap_jobs` is NEVER touched.
- Abort (exit 2, no renames) if any table is missing under BOTH its old and new name.
- No real server or DB IP/host is committed to the repo.
- Network calls need the sandbox disabled (outbound is blocked in the default Bash sandbox).

---

### Task 1: Execute the cutover against the live DB

**Files:**
- Create (scratchpad, NOT repo): `/private/tmp/claude-501/-Users-sohumjoshi-Documents-itjobcafeapp/225d8aa8-f4ed-4611-83ce-0ac7a208bb60/scratchpad/run-rename.mjs`
- No repo files touched.

**Interfaces:**
- Consumes: `.env.local` keys `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`; the repo's `mssql` package via `createRequire`.
- Produces: live DB state where `sys.tables` contains the 4 new names and none of the 4 old names, with row counts unchanged.

- [ ] **Step 1: Write the runner** at `/private/tmp/claude-501/-Users-sohumjoshi-Documents-itjobcafeapp/225d8aa8-f4ed-4611-83ce-0ac7a208bb60/scratchpad/run-rename.mjs` with exactly this content:

```js
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const REPO = "/Users/sohumjoshi/Documents/itjobcafeapp";
const require = createRequire(REPO + "/package.json");
const sql = require("mssql");

// Parse .env.local in-process. NEVER print values.
const env = Object.fromEntries(
  readFileSync(REPO + "/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const config = {
  server: env.DB_SERVER,
  port: Number(env.DB_PORT || 1433),
  database: "ITJC_SCRAPPER",
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT === "true",
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === "true",
  },
  connectionTimeout: 20000,
  requestTimeout: 60000,
};

const PAIRS = [
  ["temp_login_users", "login_users"],
  ["temp_tbl_resume_upload", "resume_upload"],
  ["temp_tbl_career_ops_scores", "career_ops_scores"],
  ["temp_user_job_seen", "user_job_seen"],
];

const pool = await sql.connect(config);

async function tableSet() {
  const names = PAIRS.flat().map((n) => `'${n}'`).join(",");
  const r = await pool
    .request()
    .query(`SELECT name FROM sys.tables WHERE name IN (${names})`);
  return new Set(r.recordset.map((x) => x.name));
}

async function rowCounts(tables) {
  const out = {};
  for (const t of tables) {
    const r = await pool.request().query(`SELECT COUNT(*) AS c FROM dbo.[${t}]`);
    out[t] = r.recordset[0].c;
  }
  return out;
}

// --- Pre-flight -----------------------------------------------------------
const pre = await tableSet();
console.log("pre-flight tables present:", [...pre].sort().join(", ") || "(none)");
for (const [oldN, newN] of PAIRS) {
  if (!pre.has(oldN) && !pre.has(newN)) {
    console.error(`ABORT: ${oldN} / ${newN} missing under BOTH names — schema drift, no renames run.`);
    await pool.close();
    process.exit(2);
  }
}
const preNames = PAIRS.map(([o, n]) => (pre.has(n) ? n : o));
const preCounts = await rowCounts(preNames);
console.log("pre-flight row counts:", JSON.stringify(preCounts));

// --- Guarded renames (same logic as database/migrate/rename-to-production.sql)
for (const [oldN, newN] of PAIRS) {
  await pool.request().query(
    `IF OBJECT_ID('dbo.${oldN}','U') IS NOT NULL AND OBJECT_ID('dbo.${newN}','U') IS NULL EXEC sp_rename 'dbo.${oldN}', '${newN}';`,
  );
  console.log(`ensured: dbo.${newN}`);
}

// --- Post-verify ----------------------------------------------------------
const post = await tableSet();
console.log("post tables present:", [...post].sort().join(", "));
const postCounts = await rowCounts(PAIRS.map(([, n]) => n));
console.log("post row counts:", JSON.stringify(postCounts));

const ok = PAIRS.every(([o, n]) => post.has(n) && !post.has(o));
const countsMatch = PAIRS.every(([o, n]) => {
  const before = preCounts[n] ?? preCounts[o];
  return before === postCounts[n];
});
console.log(ok && countsMatch ? "CUTOVER OK" : "CUTOVER INCOMPLETE — inspect output above");
await pool.close();
process.exit(ok && countsMatch ? 0 : 1);
```

- [ ] **Step 2: Run it** (sandbox must be disabled for outbound network):

Run: `node /private/tmp/claude-501/-Users-sohumjoshi-Documents-itjobcafeapp/225d8aa8-f4ed-4611-83ce-0ac7a208bb60/scratchpad/run-rename.mjs`
Expected output shape:
```
pre-flight tables present: temp_login_users, temp_tbl_career_ops_scores, temp_tbl_resume_upload, temp_user_job_seen
pre-flight row counts: {"temp_login_users":N,...}
ensured: dbo.login_users
ensured: dbo.resume_upload
ensured: dbo.career_ops_scores
ensured: dbo.user_job_seen
post tables present: career_ops_scores, login_users, resume_upload, user_job_seen
post row counts: {"login_users":N,...}
CUTOVER OK
```
Exit code 0. If exit 2: schema drift — stop and report the output to the user. If connection fails (timeout/firewall): stop; fall back to handing the user `database/migrate/rename-to-production.sql` + the two verification queries (`SELECT name FROM sys.tables WHERE name IN (...)`; `SELECT COUNT(*) FROM dbo.[<table>]`) to run in DBeaver.

- [ ] **Step 3: Delete the runner:** `rm /private/tmp/claude-501/-Users-sohumjoshi-Documents-itjobcafeapp/225d8aa8-f4ed-4611-83ce-0ac7a208bb60/scratchpad/run-rename.mjs`

No commit for this task (nothing in the repo changed).

---

### Task 2: AUTH_URL note in .env.example

**Files:**
- Modify: `.env.example` (the Auth section, after `AUTH_GOOGLE_SECRET=`)

- [ ] **Step 1: Add the placeholder lines** immediately after the `AUTH_GOOGLE_SECRET=` line:

```bash
# Public base URL of the deployment (needed when the app runs behind a
# host/port that differs from the request URL, e.g. http://<server-host>:85).
# auth.ts sets trustHost, so this is usually optional — set it if callbacks
# or redirects point at the wrong host.
AUTH_URL=
```

- [ ] **Step 2: Verify:** `grep -n "AUTH_URL" .env.example` → shows the new line; `grep -rn "209\." .env.example` → no output (no real IP).

- [ ] **Step 3: Commit and push:**

```bash
git add .env.example
git commit -m "docs: AUTH_URL placeholder for server deployments"
git push origin main
```
(Push needs the sandbox disabled.)

---

### Task 3: App-side confirmation

- [ ] **Step 1: Health signal** (sandbox disabled): `curl -s --max-time 15 "http://209.59.188.195:85/api/jobs?limit=1" | head -c 300`
Expected: JSON starting `{"ok":true,"jobs":[...` — proves the deployed app reaches the DB. (The server URL is used at runtime only — it is never written into any repo file.)

- [ ] **Step 2: Definitive login test (USER ACTION):** ask the user to log in with email/password at `http://209.59.188.195:85`. Success criterion: no "Invalid object name" — login lands on /swipe. Report results; remind that Google OAuth stays blocked until domain + HTTPS.
