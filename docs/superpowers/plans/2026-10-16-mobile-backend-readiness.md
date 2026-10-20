# Mobile Backend Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a native app sign in with email/password and call every existing session-gated API route with a revocable Bearer token, and add account deletion (API + website Settings card) plus public `/privacy` and `/support` pages, without changing how the website's cookie login behaves.

**Architecture:** A new `mobile_sessions` table holds SHA-256 hashes of opaque 32-byte tokens (90-day sliding expiry). One helper, `getRequestUser(req)`, replaces `await auth()` in the 7 gated routes: a Bearer header is judged on the token alone, otherwise the Auth.js cookie is used. New routes: `/api/mobile/{login,logout,me}` and `/api/account/delete` (one atomic T-SQL batch across five tables). The website gets a Delete-account card on Settings and links to the two new public pages.

**Tech Stack:** Next.js 16.2.9 App Router route handlers, TypeScript, `mssql` parameterized queries, `bcryptjs`, Node `crypto`, NextAuth v5 beta (`auth()`, `signOut` from `next-auth/react`), existing UI components (`Card`, `Button`, `Dialog`, `Input`, `Label`).

**Spec:** `docs/superpowers/specs/2026-10-16-mobile-backend-readiness-design.md` — read it first.

## Global Constraints

- Table `ITJC_SCRAPPER.dbo.mobile_sessions` with columns exactly `ID, LoginUserID, TokenHash CHAR(64), DeviceName NVARCHAR(100), CreatedAt, LastUsedAt, ExpiresAt`; FK to `login_users(ID)` **without** cascade; unique index on `TokenHash`, index on `LoginUserID`.
- Token = `randomBytes(32).toString("base64url")` (43 chars), returned once, never stored or logged. Stored value = SHA-256 hex. Lifetime **90 days**; a resolve refreshes `LastUsedAt`/`ExpiresAt` only when `LastUsedAt` is older than **24 hours**. All time math uses `SYSUTCDATETIME()` in SQL, never the Node clock.
- Bearer rule: if the `Authorization` header's scheme is `Bearer` (case-insensitive), the request is judged on that token alone. Empty, invalid or expired token means no user, with **no fallback to the cookie**. `GET /api/jobs` (the one guest-capable route) returns 401 for a non-resolving Bearer token.
- `getRequestUser` lets DB errors propagate (the route returns a 500). It must never turn a DB failure into "not signed in", because the app treats 401 as logged out.
- Exact error copy: `"Invalid email or password."` (mobile login 401), `"Not authenticated"` (new routes' 401), `"Incorrect password."` / `"Email does not match."` (delete 403), `"Invalid JSON body."` (400). New routes' 500s are generic (`"Could not log in. Please try again."`, `"Could not log out. Please try again."`, `"Could not load your account. Please try again."`, `"Could not delete the account. Please try again."`) and `console.error` the real message.
- Every response from the four new routes sends `Cache-Control: no-store` (via `noStoreJson`).
- Never log the `Authorization` header, a token, or a password. Log user IDs only.
- No new npm dependencies, no new environment variables.
- **Disclosed deviations from the spec (approved by approving this plan):**
  1. Deletion runs as one T-SQL batch under `SET XACT_ABORT ON` with `BEGIN/COMMIT TRANSACTION`, instead of an `mssql` `sql.Transaction` object. Atomicity is the same, and SQL Server rolls back even if the Node process dies mid-request.
  2. The landing-page links go in the **existing** footer in `app/page.tsx`. The landing footer lives there, not in `components/landing/Landing.tsx`.
  3. After a successful web deletion the page does a hard navigation (`window.location.assign("/")`) instead of `router.push("/")`. That also drops the in-memory swipe store and the router's cache of signed-in pages.
  4. The policy's placeholders are constants at the top of `components/legal/PrivacyPolicy.tsx`, with a `POLICY_IS_DRAFT` flag that controls the banner. Approval = fill the constants and set the flag to `false`.
  5. On the cookie path, `getRequestUser` requires both a numeric `session.user.id` and an email. The scoring routes used to accept a session with only an email. In practice every session carries both (the `jwt` callback sets `uid`).
- No test framework. Every task verifies with `npx tsc --noEmit && npm run lint`. Behavior is verified by the acceptance script `scripts/verify-mobile-backend.sh` (written in Task 1, before the code it tests) against a local dev server that uses the live DB through `.env.local`. Start it once with `npm run dev` (background) and leave it running. It serves `http://localhost:3000`.
- `$SCRATCH` below means a directory **outside the repo** (the session scratchpad is fine). Nothing in `$SCRATCH` is committed.
- Commit after every task with the message given, adding the trailer line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (shown as a second `-m`).
- Follow existing conventions: JSDoc file headers, `@/` imports, `import "server-only"` in server-only `lib/` modules, `runtime = "nodejs"` + `dynamic = "force-dynamic"` on routes, the `{ ok, error }` JSON shape, existing Tailwind idioms.

## Review Focus

Input classes the spec implies but doesn't spell out, most likely first. Each one has a check in the acceptance script, owned by the task named.

1. **`Authorization` header variants.** Lower-case `bearer`, or `Bearer` with no token, must behave as Bearer: lower-case + valid token → 200; empty → 401, including on the guest-capable `/api/jobs`. (Task 3 `/me` checks; Task 4 `/api/jobs` checks.)
2. **Email typed with different case or padding at mobile login** (`"  USER@EXAMPLE.COM  "`) must sign into the same account. (Task 3 check.)
3. **A password account trying to confirm deletion by email only** must get 403, so the password can't be bypassed. (Task 5 check.)
4. **Wrong-typed or oversized fields** must give a 400 or be truncated, never a 500: a numeric password → 400; a 300-character `deviceName` → 200, stored truncated. (Task 3 checks.)
5. **Repeated deletion / double submit:** a second delete with the same token → 401, never 500; logging in after deletion → 401. (Task 5 checks.)

---

### Task 1: Acceptance script + `mobile_sessions` setup SQL

**Files:**
- Create: `database/setup/create-mobile-sessions.sql`
- Create: `scripts/verify-mobile-backend.sh`

**Interfaces:**
- Consumes: existing `POST /api/auth/register`, Auth.js credentials endpoints (`/api/auth/csrf`, `/api/auth/callback/credentials`, `/api/auth/session`), `GET /api/jobs`, and the 6 other gated routes.
- Produces: the table every later task reads/writes; the script later tasks run (`scripts/verify-mobile-backend.sh [BASE_URL]`, env `VERIFY_EMAIL`, `VERIFY_PASSWORD`, `STOP_BEFORE_DELETE=1`). Default test account: `mobile-verify@example.com` / `Verify-Mobile-2026x`.

- [ ] **Step 1: Write the setup SQL.** Create `database/setup/create-mobile-sessions.sql`:

```sql
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
```

- [ ] **Step 2: Write the acceptance script.** Create `scripts/verify-mobile-backend.sh`:

```bash
#!/usr/bin/env bash
# verify-mobile-backend.sh — acceptance checks for the mobile backend
# (spec: docs/superpowers/specs/2026-10-16-mobile-backend-readiness-design.md).
#
# Usage: scripts/verify-mobile-backend.sh [BASE_URL]
#   BASE_URL defaults to http://localhost:3000. Needs curl + jq.
#
# Uses the account $VERIFY_EMAIL / $VERIFY_PASSWORD (defaults below), creating
# it if needed, and DELETES it in the final section. Stops at the first failed
# check, so it is safe to re-run while features are still being built: the
# same account is reused until the deletion section passes.
# STOP_BEFORE_DELETE=1 exits successfully right before the deletion section.
#
# Side effects on the target database (all on the test account, all removed by
# the final section): a login_users row, mobile_sessions rows, user_job_seen
# rows, one resume_upload row, and possibly career_ops_scores rows (the scoring
# checks call the configured AI provider once).

set -uo pipefail

BASE="${1:-http://localhost:3000}"
EMAIL="${VERIFY_EMAIL:-mobile-verify@example.com}"
PASSWORD="${VERIFY_PASSWORD:-Verify-Mobile-2026x}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
BODY="$WORK/body.json"
HEADERS="$WORK/headers.txt"
JAR="$WORK/cookies.txt"
PASSED=0
USER_ID="?"

die() {
  echo "FAIL: $*"
  echo "--- last response body:"
  cat "$BODY" 2>/dev/null
  echo
  exit 1
}
ok() { PASSED=$((PASSED + 1)); echo "ok   $*"; }

# call METHOD PATH [curl args...] — prints the HTTP status; body -> $BODY, headers -> $HEADERS
call() {
  local method="$1" path="$2"
  shift 2
  curl -s --max-time 120 -o "$BODY" -D "$HEADERS" -w '%{http_code}' \
    -X "$method" "$BASE$path" "$@"
}
expect() { # expect WANT GOT LABEL
  if [ "$2" = "$1" ]; then ok "$3 ($2)"; else die "$3: expected HTTP $1, got $2"; fi
}
expect_not() { # expect_not UNWANTED GOT LABEL
  if [ "$2" != "$1" ]; then ok "$3 ($2)"; else die "$3: got HTTP $2"; fi
}
json() { jq -r "$1" "$BODY"; }
no_store() {
  grep -qi '^cache-control:.*no-store' "$HEADERS" || die "$1: missing Cache-Control: no-store"
  ok "$1 sends Cache-Control: no-store"
}
bearer() { printf 'authorization: Bearer %s' "$1"; }
JSON=(-H 'content-type: application/json')

echo "== 0. test account ($EMAIL on $BASE)"
s=$(call POST /api/auth/register "${JSON[@]}" \
  -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{name:"Mobile Verify",email:$e,password:$p}')")
[ "$s" = 200 ] || [ "$s" = 409 ] || die "register: expected 200 or 409, got $s"
ok "account ready ($s)"

echo "== 1. website cookie login (regression)"
call GET /api/auth/csrf -c "$JAR" -b "$JAR" >/dev/null
CSRF=$(json .csrfToken)
{ [ -n "$CSRF" ] && [ "$CSRF" != null ]; } || die "no csrfToken"
s=$(call POST /api/auth/callback/credentials -c "$JAR" -b "$JAR" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASSWORD")
grep -q 'session-token' "$JAR" || die "credentials callback ($s) set no session cookie"
ok "web login sets a session cookie ($s)"
call GET /api/auth/session -b "$JAR" >/dev/null
[ "$(json .user.email)" = "$EMAIL" ] || die "web session does not resolve to $EMAIL"
ok "web session resolves to $EMAIL"
s=$(call GET /api/jobs/tracked -b "$JAR")
expect 200 "$s" "cookie: GET /api/jobs/tracked"

echo "== 2. POST /api/mobile/login"
s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" '{email:$e}')")
expect 400 "$s" "missing password"
s=$(call POST /api/mobile/login "${JSON[@]}" -d 'not json')
expect 400 "$s" "invalid JSON"
s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" '{email:$e,password:12345678}')")
expect 400 "$s" "non-string password"
s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" '{email:$e,password:"definitely-wrong"}')")
expect 401 "$s" "wrong password"
[ "$(json .error)" = "Invalid email or password." ] || die "wrong-password message"
ok "wrong-password message"
s=$(call POST /api/mobile/login "${JSON[@]}" -d '{"email":"no-such-user-xyz@example.com","password":"whatever123"}')
expect 401 "$s" "unknown email"
[ "$(json .error)" = "Invalid email or password." ] || die "unknown-email message must match wrong-password message"
ok "unknown-email message is identical"
MIXED="  $(printf '%s' "$EMAIL" | tr '[:lower:]' '[:upper:]')  "
LONG_DEVICE=$(printf 'D%.0s' $(seq 1 300))
s=$(call POST /api/mobile/login "${JSON[@]}" \
  -d "$(jq -nc --arg e "$MIXED" --arg p "$PASSWORD" --arg d "$LONG_DEVICE" '{email:$e,password:$p,deviceName:$d}')")
expect 200 "$s" "login with upper-cased padded email + 300-char deviceName"
no_store "mobile login"
TOKEN=$(json .token)
[ "${#TOKEN}" = 43 ] || die "token should be 43 chars, got ${#TOKEN}"
ok "token is 43 chars"
[ "$(json .user.email)" = "$EMAIL" ] || die "login user.email mismatch"
USER_ID=$(json .user.id)
json .expiresAt | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' || die "expiresAt not ISO 8601"
ok "user id $USER_ID, expiresAt $(json .expiresAt)"

echo "== 3. GET /api/mobile/me and the Bearer rules"
s=$(call GET /api/mobile/me -H "$(bearer "$TOKEN")")
expect 200 "$s" "me with token"
[ "$(json .user.email)" = "$EMAIL" ] || die "me email mismatch"
no_store "me"
s=$(call GET /api/mobile/me -H "authorization: bearer $TOKEN")
expect 200 "$s" "lower-case 'bearer' scheme"
s=$(call GET /api/mobile/me)
expect 401 "$s" "me without auth"
s=$(call GET /api/mobile/me -H "$(bearer garbage-token)")
expect 401 "$s" "me with garbage token"
s=$(call GET /api/mobile/me -H 'authorization: Bearer')
expect 401 "$s" "me with empty Bearer"
s=$(call GET /api/mobile/me -b "$JAR")
expect 200 "$s" "me with website cookie only"
s=$(call GET /api/mobile/me -b "$JAR" -H "$(bearer garbage-token)")
expect 401 "$s" "garbage Bearer + valid cookie (no fallback)"

echo "== 4. POST /api/mobile/logout"
s=$(call POST /api/mobile/logout)
expect 401 "$s" "logout without Bearer"
s=$(call POST /api/mobile/logout -H "$(bearer "$TOKEN")")
expect 200 "$s" "logout"
no_store "logout"
s=$(call GET /api/mobile/me -H "$(bearer "$TOKEN")")
expect 401 "$s" "me after logout"
s=$(call POST /api/mobile/logout -H "$(bearer "$TOKEN")")
expect 200 "$s" "logout again (idempotent)"
s=$(call POST /api/mobile/login "${JSON[@]}" \
  -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p,deviceName:"verify-script"}')")
expect 200 "$s" "fresh login"
TOKEN=$(json .token)
AUTH=(-H "$(bearer "$TOKEN")")

echo "== 5. existing routes accept the Bearer token"
s=$(call GET '/api/jobs?limit=5')
expect 200 "$s" "jobs as guest (unchanged)"
JOB=$(json '.jobs[0].id')
JOB2=$(json '.jobs[1].id')
{ [ -n "$JOB" ] && [ "$JOB" != null ] && [ -n "$JOB2" ] && [ "$JOB2" != null ]; } || die "need two jobs in the guest feed"
s=$(call GET '/api/jobs?limit=5' -H "$(bearer garbage-token)")
expect 401 "$s" "jobs with garbage Bearer"
s=$(call GET '/api/jobs?limit=5' -H 'authorization: Bearer')
expect 401 "$s" "jobs with empty Bearer"
for route in "POST /api/jobs/seen" "GET /api/jobs/tracked" "POST /api/jobs/seen/import" \
  "POST /api/resume-upload" "POST /api/scoring/score-job" "POST /api/scoring/score-batch"; do
  s=$(call "${route%% *}" "${route#* }" -H "$(bearer garbage-token)")
  expect 401 "$s" "$route with garbage Bearer"
done
s=$(call POST /api/jobs/seen "${AUTH[@]}" "${JSON[@]}" \
  -d "$(jq -nc --arg j "$JOB" '{jobReference:$j,status:"saved",snapshot:{title:"verify-script"}}')")
expect 200 "$s" "seen: save a job"
s=$(call GET /api/jobs/tracked "${AUTH[@]}")
expect 200 "$s" "tracked"
jq -e --arg j "$JOB" '[.jobs[].job.id] | index($j) != null' "$BODY" >/dev/null || die "saved job missing from tracked"
ok "saved job appears in tracked"
s=$(call GET '/api/jobs?limit=40' "${AUTH[@]}")
expect 200 "$s" "jobs with Bearer"
jq -e --arg j "$JOB" '[.jobs[].id] | index($j) == null' "$BODY" >/dev/null || die "seen job not excluded from the Bearer feed"
ok "seen job excluded from the Bearer feed"
s=$(call POST /api/jobs/seen/import "${AUTH[@]}" "${JSON[@]}" \
  -d "$(jq -nc --arg j "$JOB2" '{entries:[{jobReference:$j,status:"skipped"}]}')")
expect 200 "$s" "seen/import"
cat > "$WORK/resume.pdf" <<'PDF'
%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj
4 0 obj <</Length 55>> stream
BT /F1 14 Tf 20 60 Td (Mobile Verify - Java React SQL) Tj ET
endstream endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
trailer <</Root 1 0 R>>
%%EOF
PDF
s=$(call POST /api/resume-upload "${AUTH[@]}" \
  -F "resume=@$WORK/resume.pdf;type=application/pdf" -F "fullName=Mobile Verify")
expect 200 "$s" "resume-upload (text extraction may or may not succeed)"
s=$(call POST /api/scoring/score-job "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg j "$JOB" '{jobId:$j}')")
expect_not 401 "$s" "score-job authenticates (result depends on the AI provider)"
s=$(call POST /api/scoring/score-batch "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg j "$JOB" '{jobIds:[$j]}')")
expect_not 401 "$s" "score-batch authenticates"

if [ "${STOP_BEFORE_DELETE:-}" = 1 ]; then
  echo
  echo "STOP_BEFORE_DELETE=1 — stopping before deletion. $PASSED checks passed (user id $USER_ID)."
  exit 0
fi

echo "== 6. POST /api/account/delete"
s=$(call POST /api/account/delete "${JSON[@]}" -d "$(jq -nc --arg p "$PASSWORD" '{password:$p}')")
expect 401 "$s" "delete without auth"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d 'not json')
expect 400 "$s" "delete with invalid JSON"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d '{"password":"definitely-wrong"}')
expect 403 "$s" "delete with wrong password"
[ "$(json .error)" = "Incorrect password." ] || die "wrong-password message"
ok "wrong-password message"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" '{confirmEmail:$e}')")
expect 403 "$s" "password account cannot confirm by email"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg p "$PASSWORD" '{password:$p}')")
expect 200 "$s" "delete with correct password"
no_store "delete"
s=$(call GET /api/mobile/me "${AUTH[@]}")
expect 401 "$s" "me after deletion"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg p "$PASSWORD" '{password:$p}')")
expect 401 "$s" "second delete"
s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')")
expect 401 "$s" "login after deletion"

echo
echo "ALL $PASSED CHECKS PASSED — test account deleted (user id $USER_ID)."
```

Then `chmod +x scripts/verify-mobile-backend.sh`.

- [ ] **Step 3: Run the script and confirm it fails where expected.** With the dev server running:

Run: `scripts/verify-mobile-backend.sh`
Expected: sections 0 and 1 print `ok` lines, then `FAIL: missing password: expected HTTP 400, got 404` (the mobile routes don't exist yet). The test account now exists and will be reused.

- [ ] **Step 4: USER ACTION — create the table on the live DB.** The controller asks the human to run `database/setup/create-mobile-sessions.sql` in DBeaver against `ITJC_SCRAPPER`. It only adds a table; the deployed build ignores it. Task 3's checks need it. Don't continue past Task 2 until the human confirms it ran.

- [ ] **Step 5: Commit**

```bash
git add database/setup/create-mobile-sessions.sql scripts/verify-mobile-backend.sh
git commit -m "test: mobile_sessions setup SQL and mobile backend acceptance script" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared credential check (`verifyCredentials`)

**Files:**
- Create: `lib/auth/credentials.ts`
- Modify: `auth.ts` (imports + the Credentials `authorize()` body)

**Interfaces:**
- Consumes: `getUserByEmail`, `normalizeEmail`, `updateLastLogin`, `LoginUser` from `@/lib/auth/users`.
- Produces: `verifyCredentials(emailInput: string, password: string): Promise<LoginUser | null>`. Task 3's mobile login uses it.

- [ ] **Step 1: Create `lib/auth/credentials.ts`:**

```ts
/**
 * Email/password check shared by the website (Auth.js Credentials provider)
 * and the native app (POST /api/mobile/login). SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * One place decides whether a password is right, so the two logins can never
 * drift apart. Never logs or returns the password or its hash beyond the
 * LoginUser row the caller already gets from lib/auth/users.
 */

import "server-only";
import bcrypt from "bcryptjs";
import {
  getUserByEmail,
  normalizeEmail,
  updateLastLogin,
  type LoginUser,
} from "@/lib/auth/users";

/**
 * The user when `emailInput` has a password account and `password` matches
 * (LastLoginAt is recorded); null otherwise. Throws only on DB errors.
 */
export async function verifyCredentials(
  emailInput: string,
  password: string,
): Promise<LoginUser | null> {
  const email = normalizeEmail(emailInput);
  if (!email || !password) return null;

  const user = await getUserByEmail(email);
  if (!user || !user.emailPasswordEnabled || !user.passwordHash) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  await updateLastLogin(user.id);
  return user;
}
```

- [ ] **Step 2: Use it in `auth.ts`.** Replace the imports block

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import {
  getUserByEmail,
  normalizeEmail,
  updateLastLogin,
  upsertGoogleUser,
} from "@/lib/auth/users";
```

with

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "@/lib/auth/credentials";
import {
  getUserByEmail,
  normalizeEmail,
  upsertGoogleUser,
} from "@/lib/auth/users";
```

and replace the whole `async authorize(credentials) { … }` method with

```ts
      async authorize(credentials) {
        const user = await verifyCredentials(
          String(credentials?.email ?? ""),
          String(credentials?.password ?? ""),
        );
        if (!user) return null;
        return {
          id: String(user.id),
          email: user.email,
          name: user.name ?? undefined,
          image: user.imageUrl ?? undefined,
        };
      },
```

- [ ] **Step 3: Type-check and lint.**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Website login still works.**

Run: `scripts/verify-mobile-backend.sh`
Expected: sections 0 and 1 pass (`web session resolves to mobile-verify@example.com`), then the same `FAIL … got 404` in section 2 as in Task 1.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/credentials.ts auth.ts
git commit -m "refactor: share the email/password check between web and mobile logins" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mobile sessions, request-user helper, and `/api/mobile/{login,logout,me}`

**Files:**
- Create: `lib/auth/mobileSessions.ts`
- Create: `lib/auth/requestUser.ts`
- Create: `lib/auth/noStoreJson.ts`
- Create: `app/api/mobile/login/route.ts`
- Create: `app/api/mobile/logout/route.ts`
- Create: `app/api/mobile/me/route.ts`
- Modify: `README.md` (Features list)

**Interfaces:**
- Consumes: `verifyCredentials` (Task 2); `getUserById` from `@/lib/auth/users`; `auth` from `@/auth`; `getPool`, `sql` from `@/lib/db/sqlServer`; the `mobile_sessions` table (Task 1, created on the live DB).
- Produces (Tasks 4–6 rely on these exact names):
  - `interface MobileUser { id: number; email: string }`, `createMobileSession(userId: number, deviceName: string | null): Promise<{ token: string; expiresAt: Date }>`, `resolveMobileToken(token: string): Promise<MobileUser | null>`, `revokeMobileSession(token: string): Promise<void>`, `deleteExpiredSessions(userId: number): Promise<void>` (all from `@/lib/auth/mobileSessions`)
  - `type RequestUser = MobileUser`, `getBearerToken(req: Request): string | null`, `hasBearer(req: Request): boolean`, `getRequestUser(req: Request): Promise<RequestUser | null>` (from `@/lib/auth/requestUser`)
  - `noStoreJson(body: unknown, status?: number): NextResponse` (from `@/lib/auth/noStoreJson`)

- [ ] **Step 1: Confirm the failing checks.** Run `scripts/verify-mobile-backend.sh`. Expected: `FAIL: missing password: expected HTTP 400, got 404`.

- [ ] **Step 2: Create `lib/auth/mobileSessions.ts`:**

```ts
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
```

- [ ] **Step 3: Create `lib/auth/requestUser.ts`:**

```ts
/**
 * Who is calling? One helper for every session-gated API route.
 * SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * A request whose Authorization scheme is Bearer (the native app) is judged
 * on that token alone: empty, invalid or expired → null, never a fallback to
 * the cookie (so a bad token is a clear 401, not a silent identity switch).
 * Without a Bearer header, the Auth.js session cookie (the website) is used.
 * DB errors propagate: a failure to check must never read as "signed out".
 */

import "server-only";
import { auth } from "@/auth";
import {
  resolveMobileToken,
  type MobileUser,
} from "@/lib/auth/mobileSessions";

export type RequestUser = MobileUser;

const BEARER_RE = /^bearer(?:\s+(.*))?$/i;

/** The Bearer token; "" for a Bearer header with no token; null when absent. */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const m = BEARER_RE.exec(header.trim());
  if (!m) return null;
  return (m[1] ?? "").trim();
}

/** True when the request presents a Bearer credential (even an empty one). */
export function hasBearer(req: Request): boolean {
  return getBearerToken(req) !== null;
}

/** The signed-in user (id + current email), or null. */
export async function getRequestUser(
  req: Request,
): Promise<RequestUser | null> {
  const token = getBearerToken(req);
  if (token !== null) {
    return token ? resolveMobileToken(token) : null;
  }

  const session = await auth();
  const id = session?.user?.id ? Number(session.user.id) : NaN;
  const email = session?.user?.email?.trim();
  if (!Number.isInteger(id) || id <= 0 || !email) return null;
  return { id, email };
}
```

- [ ] **Step 4: Create `lib/auth/noStoreJson.ts`:**

```ts
/**
 * JSON response marked `Cache-Control: no-store` — used by every route that
 * returns a token or account data (mobile + account routes), so no proxy or
 * client cache ever keeps a copy.
 */

import { NextResponse } from "next/server";

export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 5: Create `app/api/mobile/login/route.ts`:**

```ts
/**
 * POST /api/mobile/login — email/password login for the native app.
 * Body: { email, password, deviceName? }
 * Returns: { ok, token, expiresAt (ISO 8601), user: { id, email, name } }
 *
 * The token is returned once; the server keeps only its hash
 * (lib/auth/mobileSessions). Unknown email and wrong password get the same
 * 401 message. Never logs the password or the token.
 */

import { verifyCredentials } from "@/lib/auth/credentials";
import {
  createMobileSession,
  deleteExpiredSessions,
} from "@/lib/auth/mobileSessions";
import { noStoreJson } from "@/lib/auth/noStoreJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DEVICE_NAME = 100;

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown; deviceName?: unknown };
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
  }
  if (!body || typeof body !== "object") {
    return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return noStoreJson(
      { ok: false, error: "Email and password are required." },
      400,
    );
  }
  const deviceName =
    typeof body.deviceName === "string"
      ? body.deviceName.trim().slice(0, MAX_DEVICE_NAME) || null
      : null;

  try {
    const user = await verifyCredentials(email, password);
    if (!user) {
      return noStoreJson(
        { ok: false, error: "Invalid email or password." },
        401,
      );
    }
    await deleteExpiredSessions(user.id);
    const { token, expiresAt } = await createMobileSession(user.id, deviceName);
    return noStoreJson({
      ok: true,
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/mobile/login] ${message}`);
    return noStoreJson(
      { ok: false, error: "Could not log in. Please try again." },
      500,
    );
  }
}
```

- [ ] **Step 6: Create `app/api/mobile/logout/route.ts`:**

```ts
/**
 * POST /api/mobile/logout — end the calling app session.
 * Requires `Authorization: Bearer <token>` (401 without one). Idempotent:
 * an already-revoked or expired token still gets { ok: true }, because the
 * client's only job after logout is to forget the token.
 */

import { getBearerToken } from "@/lib/auth/requestUser";
import { revokeMobileSession } from "@/lib/auth/mobileSessions";
import { noStoreJson } from "@/lib/auth/noStoreJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
  }

  try {
    await revokeMobileSession(token);
    return noStoreJson({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/mobile/logout] ${message}`);
    return noStoreJson(
      { ok: false, error: "Could not log out. Please try again." },
      500,
    );
  }
}
```

- [ ] **Step 7: Create `app/api/mobile/me/route.ts`:**

```ts
/**
 * GET /api/mobile/me — who the caller is. The app calls this at launch to
 * decide between its signed-in screens and the login screen.
 * Returns { ok, user: { id, email, name } }, or 401 when the token (or
 * cookie) doesn't resolve to an existing user.
 */

import { getUserById } from "@/lib/auth/users";
import { getRequestUser } from "@/lib/auth/requestUser";
import { noStoreJson } from "@/lib/auth/noStoreJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const who = await getRequestUser(req);
    if (!who) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }
    const user = await getUserById(who.id);
    if (!user) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }
    return noStoreJson({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/mobile/me] ${message}`);
    return noStoreJson(
      { ok: false, error: "Could not load your account. Please try again." },
      500,
    );
  }
}
```

- [ ] **Step 8: README.** In `README.md`'s `## Features` list, after the `- **Auth** — …` bullet, add:

```markdown
- **Mobile API** — the native app signs in with `POST /api/mobile/login`
  (email/password) and sends `Authorization: Bearer <token>` to the same API
  routes the website uses. Tokens are opaque, stored only as SHA-256 hashes in
  `mobile_sessions`, and expire after 90 days without use
  (`GET /api/mobile/me`, `POST /api/mobile/logout`).
```

- [ ] **Step 9: Type-check and lint.**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 10: Run the acceptance script.**

Run: `scripts/verify-mobile-backend.sh`
Expected: sections 0–4 all `ok`. The first failure is in section 5: `FAIL: jobs with garbage Bearer: expected HTTP 401, got 200` (the gated routes still read only the cookie; Task 4 fixes that).

- [ ] **Step 11: Check sliding and hard expiry against the DB.** Save this helper as `$SCRATCH/mobile-sql-check.mjs` (not committed):

```js
// mobile-sql-check.mjs — scratch helper for the mobile-backend plan. NOT committed.
// Run from the repo root:
//   node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" <mode> <email> [userId]
//   show   — the user's mobile_sessions rows (with the DB's current UTC time)
//   age    — set the user's sessions' LastUsedAt back 2 days
//   expire — set the user's sessions' ExpiresAt 1 minute in the past
//   count  — rows left for <email>/<userId> in all five tables
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const sql = require("mssql");

const [mode, rawEmail, rawId] = process.argv.slice(2);
if (!mode || !rawEmail) {
  console.error("usage: <show|age|expire|count> <email> [userId]");
  process.exit(2);
}
const email = rawEmail.trim().toLowerCase();
const env = (k) => process.env[k]?.trim();
const port = env("DB_PORT") ? Number(env("DB_PORT")) : undefined;
const pool = await sql.connect({
  server: env("DB_SERVER"),
  database: env("DB_DATABASE"),
  user: env("DB_USER"),
  password: env("DB_PASSWORD"),
  port,
  options: {
    instanceName: !port && env("DB_INSTANCE") ? env("DB_INSTANCE") : undefined,
    encrypt: env("DB_ENCRYPT") === "true",
    trustServerCertificate: env("DB_TRUST_SERVER_CERTIFICATE") !== "false",
    enableArithAbort: true,
  },
});
const T = "ITJC_SCRAPPER.dbo.";
const rq = () =>
  pool
    .request()
    .input("email", sql.NVarChar(255), email)
    .input("id", sql.Int, rawId ? Number(rawId) : -1);
const forUser = `LoginUserID IN (SELECT ID FROM ${T}login_users WHERE Email = @email)`;

if (mode === "show") {
  const r = await rq().query(
    `SELECT ID, LEFT(DeviceName, 20) AS Device, LEN(DeviceName) AS DeviceNameLen,
            CreatedAt, LastUsedAt, ExpiresAt, SYSUTCDATETIME() AS NowUtc
       FROM ${T}mobile_sessions WHERE ${forUser} ORDER BY ID`,
  );
  console.table(r.recordset);
} else if (mode === "age") {
  const r = await rq().query(
    `UPDATE ${T}mobile_sessions SET LastUsedAt = DATEADD(day, -2, SYSUTCDATETIME()) WHERE ${forUser}`,
  );
  console.log(`aged ${r.rowsAffected[0]} session row(s)`);
} else if (mode === "expire") {
  const r = await rq().query(
    `UPDATE ${T}mobile_sessions SET ExpiresAt = DATEADD(minute, -1, SYSUTCDATETIME()) WHERE ${forUser}`,
  );
  console.log(`expired ${r.rowsAffected[0]} session row(s)`);
} else if (mode === "count") {
  const r = await rq().query(`SELECT
      (SELECT COUNT(*) FROM ${T}login_users WHERE ID = @id OR Email = @email) AS login_users,
      (SELECT COUNT(*) FROM ${T}mobile_sessions WHERE LoginUserID = @id) AS mobile_sessions,
      (SELECT COUNT(*) FROM ${T}user_job_seen WHERE LoginUserID = @id) AS user_job_seen,
      (SELECT COUNT(*) FROM ${T}resume_upload WHERE LoginUserID = @id OR Email = @email) AS resume_upload,
      (SELECT COUNT(*) FROM ${T}career_ops_scores WHERE UserEmail = @email) AS career_ops_scores`);
  console.table(r.recordset);
} else {
  console.error(`unknown mode ${mode}`);
  process.exit(2);
}
await pool.close();
```

Then run, from the repo root:

```bash
LONG=$(printf 'E%.0s' $(seq 1 300))
TOKEN=$(curl -s -X POST localhost:3000/api/mobile/login -H 'content-type: application/json' \
  -d "$(jq -nc --arg d "$LONG" '{email:"mobile-verify@example.com",password:"Verify-Mobile-2026x",deviceName:$d}')" | jq -r .token)
node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" age mobile-verify@example.com
node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" show mobile-verify@example.com
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/mobile/me -H "authorization: Bearer $TOKEN"
node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" show mobile-verify@example.com
node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" expire mobile-verify@example.com
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/mobile/me -H "authorization: Bearer $TOKEN"
```

Expected:
- First `show`: every row has `LastUsedAt` 2 days before `NowUtc`, and the newest row (highest `ID`, `Device` = `EEEE…`) has `DeviceNameLen` **100**, so the 300-character name was truncated.
- First `curl`: `200`.
- Second `show`: only that newest row now has `LastUsedAt ≈ NowUtc` and `ExpiresAt ≈ NowUtc + 90 days`; the other rows stay aged, so only the token that was used gets refreshed.
- Last `curl`, after `expire`: `401`.

Expired rows are cleaned up by the next login.

- [ ] **Step 12: Commit**

```bash
git add lib/auth/mobileSessions.ts lib/auth/requestUser.ts lib/auth/noStoreJson.ts app/api/mobile README.md
git commit -m "feat: mobile Bearer-token sessions with login, logout and me endpoints" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Switch the 7 gated routes to `getRequestUser`

**Files:**
- Modify: `app/api/jobs/route.ts`
- Modify: `app/api/jobs/tracked/route.ts`
- Modify: `app/api/jobs/seen/route.ts`
- Modify: `app/api/jobs/seen/import/route.ts`
- Modify: `app/api/resume-upload/route.ts`
- Modify: `app/api/scoring/score-job/route.ts`
- Modify: `app/api/scoring/score-batch/route.ts`

**Interfaces:**
- Consumes: `getRequestUser(req: Request): Promise<{ id: number; email: string } | null>` and `hasBearer(req: Request): boolean` from `@/lib/auth/requestUser` (Task 3).
- Produces: every gated route accepts the website cookie **or** `Authorization: Bearer <token>`. Request and response shapes are otherwise unchanged.

- [ ] **Step 1: Confirm the failing check.** Run `scripts/verify-mobile-backend.sh`. Expected: `FAIL: jobs with garbage Bearer: expected HTTP 401, got 200`.

- [ ] **Step 2: `app/api/jobs/route.ts`.** Replace `import { auth } from "@/auth";` with `import { getRequestUser, hasBearer } from "@/lib/auth/requestUser";`, then replace

```ts
  // Logged-in users get their already-seen jobs excluded (SQL-side). /swipe is
  // protected, so this is the normal path; unauthenticated calls still work.
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
```

with

```ts
  // Signed-in users (website cookie or app Bearer token) get their already-seen
  // jobs excluded (SQL-side); guests still get the feed. A Bearer token that
  // doesn't resolve is a 401, so the app notices an expired login instead of
  // silently falling back to guest results.
  const user = await getRequestUser(req);
  if (!user && hasBearer(req)) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }
  const loginUserId = user?.id;
```

- [ ] **Step 3: `app/api/jobs/tracked/route.ts`.** Replace `import { auth } from "@/auth";` with `import { getRequestUser } from "@/lib/auth/requestUser";`, then replace

```ts
export async function GET() {
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
```

with

```ts
export async function GET(req: Request) {
  const user = await getRequestUser(req);
  const loginUserId = user?.id;
```

- [ ] **Step 4: `app/api/jobs/seen/route.ts`.** Replace `import { auth } from "@/auth";` with `import { getRequestUser } from "@/lib/auth/requestUser";`. In the header comment, replace the line ` * Requires a session (auth()). The user id comes from the session, never` with ` * Requires a signed-in user (website cookie or app Bearer token, via`, and the next line ` * the client. Parameterized SQL only.` with ` * lib/auth/requestUser). The user id never comes from the client. Parameterized SQL only.`. Then replace

```ts
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
```

with

```ts
  const user = await getRequestUser(req);
  const loginUserId = user?.id;
```

- [ ] **Step 5: `app/api/jobs/seen/import/route.ts`.** Replace `import { auth } from "@/auth";` with `import { getRequestUser } from "@/lib/auth/requestUser";`, then replace

```ts
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
```

with

```ts
  const user = await getRequestUser(req);
  const loginUserId = user?.id;
```

- [ ] **Step 6: `app/api/resume-upload/route.ts`.** Replace `import { auth } from "@/auth";` with `import { getRequestUser } from "@/lib/auth/requestUser";`. In the header comment replace ` *   email    (string, required)` with ` *   email    (ignored — the signed-in account's email is used)`. Replace

```ts
  // Require login — the resume is tied to the logged-in user.
  const session = await auth();
  if (!session?.user) {
    return fail("Please log in to upload a resume.", 401);
  }
  const loginUserId = session.user.id ? Number(session.user.id) : null;
```

with

```ts
  // Require login (website cookie or app Bearer token) — the resume is tied
  // to the signed-in user.
  const user = await getRequestUser(req);
  if (!user) {
    return fail("Please log in to upload a resume.", 401);
  }
  const loginUserId = user.id;
```

and replace

```ts
  // The logged-in email is authoritative (avoids uploading under a stray email);
  // fall back to the form value only if the session somehow has none.
  const email = (session.user.email ?? String(form.get("email") ?? "")).trim();
```

with

```ts
  // The signed-in email is authoritative (avoids uploading under a stray email).
  const email = user.email;
```

- [ ] **Step 7: `app/api/scoring/score-job/route.ts` and `app/api/scoring/score-batch/route.ts`** (the same three edits in each file). Replace `import { auth } from "@/auth";` with `import { getRequestUser } from "@/lib/auth/requestUser";`. Replace

```ts
  const session = await auth();
  if (!session?.user) {
```

with

```ts
  const user = await getRequestUser(req);
  if (!user) {
```

and replace

```ts
  // --- Real-jobs flow: identity from the logged-in session.
  const userId = session.user.id ? Number(session.user.id) : undefined;
  const email = session.user.email ?? undefined;
```

with

```ts
  // --- Real-jobs flow: identity from the signed-in user (cookie or Bearer).
  const userId = user.id;
  const email = user.email;
```

- [ ] **Step 8: No route reads the cookie directly any more.**

Run: `grep -rn "await auth()" app/api; grep -rn 'from "@/auth"' app/api`
Expected: no output.

- [ ] **Step 9: Type-check and lint.**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 10: Run the acceptance script.**

Run: `scripts/verify-mobile-backend.sh`
Expected: sections 0–5 all `ok` (section 5 calls the AI provider once for scoring, so it can take ~30 s). The first failure is `FAIL: delete without auth: expected HTTP 401, got 404` (Task 5).

- [ ] **Step 11: Commit**

```bash
git add app/api/jobs app/api/resume-upload app/api/scoring
git commit -m "feat: gated API routes accept the mobile Bearer token as well as the web cookie" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Account deletion service + `POST /api/account/delete`

**Files:**
- Create: `lib/auth/deleteAccount.ts`
- Create: `app/api/account/delete/route.ts`
- Modify: `SQL_INTEGRATION.md` (write-path docs)
- Modify: `lib/db/sqlServer.ts` (stale "read-only / never writes" header comment only)

**Interfaces:**
- Consumes: `getRequestUser` (Task 3), `noStoreJson` (Task 3), `getUserById`, `normalizeEmail` from `@/lib/auth/users`, `getPool`, `sql` from `@/lib/db/sqlServer`, `bcrypt` from `bcryptjs`.
- Produces: `deleteAccount(userId: number, email: string): Promise<void>`; `POST /api/account/delete` with body `{ password?: string; confirmEmail?: string }` → 200 `{ ok: true }` | 400 | 401 | 403 | 500. Task 6's Settings card calls it.

- [ ] **Step 1: Confirm the failing check.** Run `scripts/verify-mobile-backend.sh`. Expected: `FAIL: delete without auth: expected HTTP 401, got 404`.

- [ ] **Step 2: Create `lib/auth/deleteAccount.ts`:**

```ts
/**
 * Account deletion — removes a user and every row tied to them, atomically.
 * SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * One T-SQL batch under SET XACT_ABORT ON: any error rolls the whole
 * transaction back inside SQL Server, even if this process dies mid-request.
 * Order matters: child rows before login_users (FKs), and AI scores before
 * the resumes they point at (career_ops_scores.ResumeUploadID). Resumes and
 * scores also match by email, catching older rows never linked to the user id.
 */

import "server-only";
import { getPool, sql } from "@/lib/db/sqlServer";

const DB = "ITJC_SCRAPPER.dbo";

export async function deleteAccount(
  userId: number,
  email: string,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, userId)
    .input("email", sql.NVarChar(255), email)
    .query(
      `SET XACT_ABORT ON;
       BEGIN TRANSACTION;
         DELETE FROM ${DB}.mobile_sessions WHERE LoginUserID = @id;
         DELETE FROM ${DB}.user_job_seen WHERE LoginUserID = @id;
         DELETE FROM ${DB}.career_ops_scores
          WHERE UserEmail = @email
             OR ResumeUploadID IN (
                  SELECT ID FROM ${DB}.resume_upload
                   WHERE LoginUserID = @id OR Email = @email);
         DELETE FROM ${DB}.resume_upload WHERE LoginUserID = @id OR Email = @email;
         DELETE FROM ${DB}.login_users WHERE ID = @id;
       COMMIT TRANSACTION;`,
    );
}
```

- [ ] **Step 3: Create `app/api/account/delete/route.ts`:**

```ts
/**
 * POST /api/account/delete — permanently delete the caller's account and all
 * of its data (an app-store requirement). Works with the website cookie or
 * the app's Bearer token. Body: { password?, confirmEmail? }
 *
 * Password accounts must re-enter the password; password-less (Google-only)
 * accounts type their email. A failed confirmation is 403, not 401: the
 * caller IS signed in, and the app treats 401 as "logged out".
 */

import bcrypt from "bcryptjs";
import { getUserById, normalizeEmail } from "@/lib/auth/users";
import { getRequestUser } from "@/lib/auth/requestUser";
import { deleteAccount } from "@/lib/auth/deleteAccount";
import { noStoreJson } from "@/lib/auth/noStoreJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const who = await getRequestUser(req);
    if (!who) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }

    let body: { password?: unknown; confirmEmail?: unknown };
    try {
      body = await req.json();
    } catch {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }
    if (!body || typeof body !== "object") {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const user = await getUserById(who.id);
    if (!user) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }

    if (user.emailPasswordEnabled && user.passwordHash) {
      const password = typeof body.password === "string" ? body.password : "";
      const valid =
        password !== "" && (await bcrypt.compare(password, user.passwordHash));
      if (!valid) {
        return noStoreJson({ ok: false, error: "Incorrect password." }, 403);
      }
    } else {
      const confirm =
        typeof body.confirmEmail === "string"
          ? normalizeEmail(body.confirmEmail)
          : "";
      if (!confirm || confirm !== normalizeEmail(user.email)) {
        return noStoreJson({ ok: false, error: "Email does not match." }, 403);
      }
    }

    await deleteAccount(user.id, user.email);
    console.log(`[api/account/delete] deleted user ${user.id}`);
    return noStoreJson({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/account/delete] ${message}`);
    return noStoreJson(
      { ok: false, error: "Could not delete the account. Please try again." },
      500,
    );
  }
}
```

- [ ] **Step 4: Docs.** In `SQL_INTEGRATION.md`, insert a new section directly before `## Career-Ops AI scoring (manual, top 10)`:

```markdown
## Mobile sessions and account deletion (write)

The native app signs in with `POST /api/mobile/login` and gets an opaque
Bearer token; the server stores only its SHA-256 hash in `mobile_sessions`
(run `database/setup/create-mobile-sessions.sql` once, before deploying).
Sessions slide to 90 days from last use; `POST /api/mobile/logout` deletes
the row. `POST /api/account/delete` (cookie or Bearer, password re-entry)
deletes the user's rows from `mobile_sessions`, `user_job_seen`,
`career_ops_scores`, `resume_upload` and `login_users` in one transaction.
```

In the same file's `## Read-only guarantee` section, replace the first bullet's two sentences starting `The **only writes** in the whole` through `No delete/truncate, and the stored procedure that processes jobs is **never** called.` with:

```markdown
  The **only writes** in the whole
  app are in `ITJC_SCRAPPER`: accounts (`login_users` — sign-up, Google upsert,
  last-login), the resume upload (`INSERT`/`UPDATE ResumeText` on
  `resume_upload`), the AI score cache (`MERGE` into `career_ops_scores`), the
  per-user pipeline state (`MERGE` into `user_job_seen` — status, notes, and a
  title/company/location/url snapshot per swiped job), mobile app sessions
  (`mobile_sessions`), and account deletion (`DELETE` of one user's rows across
  those five tables). All are parameterized. No truncate, and the stored
  procedure that processes jobs is **never** called.
```

In `lib/db/sqlServer.ts`, replace the header lines

```ts
 * SQL Server connection — SERVER-SIDE ONLY, READ-ONLY.
```

with

```ts
 * SQL Server connection — SERVER-SIDE ONLY.
```

and

```ts
 * The app never writes: no insert/update/delete/truncate/merge/exec. Only
 * SELECT queries run through this pool.
```

with

```ts
 * The job feed is read-only. App-owned writes (accounts, resumes, scores,
 * pipeline state, mobile sessions, account deletion) are listed in
 * SQL_INTEGRATION.md — all parameterized, never against the scraper's tables.
```

- [ ] **Step 5: Type-check and lint.**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Run the full acceptance script, with the DB proof around it.** From the repo root:

```bash
STOP_BEFORE_DELETE=1 scripts/verify-mobile-backend.sh
```

Note the printed user id (call it `UID`). Then:

```bash
node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" count mobile-verify@example.com UID
scripts/verify-mobile-backend.sh
node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" count mobile-verify@example.com UID
```

Expected: the first `count` shows `login_users` 1 and non-zero `mobile_sessions`, `user_job_seen`, `resume_upload` (`career_ops_scores` is non-zero if the AI provider scored). The full run ends with `ALL <n> CHECKS PASSED — test account deleted`. The second `count` shows **0 in every column**.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/deleteAccount.ts app/api/account SQL_INTEGRATION.md lib/db/sqlServer.ts
git commit -m "feat: account deletion endpoint (password re-entry, one atomic transaction)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: "Delete account" card on Settings

**Files:**
- Modify: `lib/swipe/swipeStore.tsx` (export the storage key; add `importFlagKey`)
- Create: `components/settings/DeleteAccountCard.tsx`
- Modify: `app/(app)/(protected)/settings/page.tsx`
- Modify: `README.md` (Features list)

**Interfaces:**
- Consumes: `POST /api/account/delete` (Task 5); `signOut` from `next-auth/react`; `getUserById` from `@/lib/auth/users`; UI `Card`, `Button` (variant `danger`), `Dialog`, `Input`, `Label`.
- Produces: `export const STORAGE_KEY` and `export function importFlagKey(email: string): string` from `@/lib/swipe/swipeStore`; `DeleteAccountCard({ email, hasPassword }: { email: string; hasPassword: boolean })`.

- [ ] **Step 1: `lib/swipe/swipeStore.tsx` — share the storage keys.** Replace the line

```ts
const STORAGE_KEY = "itjobcafe.swipe.v2";
```

with

```ts
export const STORAGE_KEY = "itjobcafe.swipe.v2";

/** Per-account flag marking the one-time localStorage → server import as done. */
export function importFlagKey(email: string): string {
  return `itjobcafe.swipe.imported.${email}`;
}
```

and replace

```ts
      const importKey = `itjobcafe.swipe.imported.${sessionEmail}`;
```

with

```ts
      const importKey = importFlagKey(sessionEmail);
```

- [ ] **Step 2: Create `components/settings/DeleteAccountCard.tsx`:**

```tsx
"use client";

/**
 * Settings → Delete account. Confirms with the password (or, for password-less
 * Google accounts, the email), calls POST /api/account/delete, then clears this
 * browser's swipe state (the resume-derived profile lives in localStorage),
 * signs out, and hard-navigates home so no signed-in page state survives.
 * Doubles as Google Play's required web path for deleting an account.
 */

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STORAGE_KEY, importFlagKey } from "@/lib/swipe/swipeStore";

const GENERIC_ERROR = "Could not delete the account. Please try again.";

export function DeleteAccountCard({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setValue("");
    setError(null);
  };

  const onDelete = async () => {
    if (busy || !value.trim()) return;
    setError(null);
    setBusy(true);

    let deleted = false;
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          hasPassword ? { password: value } : { confirmEmail: value },
        ),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      deleted = res.ok && Boolean(data?.ok);
      if (!deleted) setError(data?.error ?? GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    }

    if (!deleted) {
      setBusy(false);
      return;
    }

    // The account is gone. Clean up this browser, then leave — none of this
    // can un-delete, so failures here are ignored.
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(importFlagKey(email));
    } catch {
      // storage unavailable — nothing to clear
    }
    await signOut({ redirect: false }).catch(() => undefined);
    window.location.assign("/");
  };

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-[var(--danger)]">
            <Trash2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Delete account</h3>
            <p className="mt-1 text-sm text-muted">
              Permanently delete your account and everything saved with it.
              This can&apos;t be undone.
            </p>
            <div className="mt-4">
              <Button variant="danger" onClick={() => setOpen(true)}>
                <Trash2 className="size-4" />
                Delete account
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Dialog
        open={open}
        onClose={close}
        title="Delete your account?"
        description="This is permanent and can't be undone."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void onDelete()}
              disabled={busy || !value.trim()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">This deletes:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Your account ({email})</li>
              <li>Your saved, applied and skipped jobs, and your notes</li>
              <li>Your uploaded resumes</li>
              <li>Your AI fit scores</li>
            </ul>
          </div>
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void onDelete();
            }}
          >
            <Label htmlFor="delete-confirm">
              {hasPassword
                ? "Enter your password to confirm"
                : `Type ${email} to confirm`}
            </Label>
            <Input
              id="delete-confirm"
              type={hasPassword ? "password" : "email"}
              autoComplete={hasPassword ? "current-password" : "off"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
            />
          </form>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Render it on Settings.** Replace the whole of `app/(app)/(protected)/settings/page.tsx` with:

```tsx
import { UserRound } from "lucide-react";
import { auth } from "@/auth";
import { getUserById } from "@/lib/auth/users";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { IntegrationStatusCard } from "@/components/settings/IntegrationStatusCard";
import { DeleteAccountCard } from "@/components/settings/DeleteAccountCard";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default async function SettingsPage() {
  const session = await auth();
  const name = session?.user?.name?.trim();
  const email = session?.user?.email?.trim();
  const who =
    name && email ? `${name} (${email})` : (email ?? name ?? "your account");

  // Which confirmation the delete dialog asks for (password vs. typed email).
  // A DB hiccup hides the card rather than breaking the page.
  const userId = session?.user?.id ? Number(session.user.id) : NaN;
  const user = Number.isInteger(userId)
    ? await getUserById(userId).catch(() => null)
    : null;

  return (
    <SwipeShell title="Settings" description="Manage your account">
      <div className="space-y-4">
        <IntegrationStatusCard
          icon={UserRound}
          title="Account"
          description={`Signed in as ${who}. Signing out returns you to the landing page.`}
          statusLabel="Signed in"
          tone="live"
        >
          <SignOutButton />
        </IntegrationStatusCard>
        {user && (
          <DeleteAccountCard
            email={user.email}
            hasPassword={Boolean(user.emailPasswordEnabled && user.passwordHash)}
          />
        )}
      </div>
    </SwipeShell>
  );
}
```

- [ ] **Step 4: README.** In `README.md`'s `## Features` list, after the `- **Mobile API** — …` bullet (Task 3), add:

```markdown
- **Account deletion** — Settings → Delete account (or `POST /api/account/delete`
  from the app) permanently removes the account and all of its data after the
  user re-enters their password.
```

- [ ] **Step 5: Type-check and lint.**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Settings renders the card for a signed-in user.** Make a disposable account (the acceptance script deleted its own), sign in with a cookie jar, and fetch the page:

```bash
J=$(mktemp)
curl -s -X POST localhost:3000/api/auth/register -H 'content-type: application/json' \
  -d '{"name":"Card Check","email":"settings-card-check@example.com","password":"Card-Check-2026x"}' >/dev/null
CSRF=$(curl -s -c "$J" -b "$J" localhost:3000/api/auth/csrf | jq -r .csrfToken)
curl -s -o /dev/null -c "$J" -b "$J" -X POST localhost:3000/api/auth/callback/credentials \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=settings-card-check@example.com" \
  --data-urlencode "password=Card-Check-2026x"
curl -s -b "$J" localhost:3000/settings | grep -o 'Permanently delete your account' | head -1
curl -s -o /dev/null -w '%{http_code}\n' -b "$J" -X POST localhost:3000/api/account/delete \
  -H 'content-type: application/json' -d '{"password":"Card-Check-2026x"}'
rm -f "$J"
```

Expected: prints `Permanently delete your account`, then `200` (the throwaway account is deleted through the cookie path, which also proves the endpoint works with the website cookie).

- [ ] **Step 7: Commit**

```bash
git add lib/swipe/swipeStore.tsx components/settings/DeleteAccountCard.tsx "app/(app)/(protected)/settings/page.tsx" README.md
git commit -m "feat: delete-account card on Settings" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Privacy and support pages, and links to them

**Files:**
- Create: `components/legal/LegalLinks.tsx`
- Create: `components/legal/LegalPage.tsx`
- Create: `components/legal/PrivacyPolicy.tsx`
- Create: `app/privacy/page.tsx`
- Create: `app/support/page.tsx`
- Modify: `app/page.tsx` (footer)
- Modify: `app/login/page.tsx`, `app/signup/page.tsx`
- Modify: `app/(app)/(protected)/settings/page.tsx`

**Interfaces:**
- Consumes: `Logo` from `@/components/layout/Logo`, `cn` from `@/lib/utils/cn`.
- Produces: `LegalLinks({ className? })`; `LegalPage({ title, children })` and the style constants `LEGAL_H2`, `LEGAL_P`, `LEGAL_UL`; from `PrivacyPolicy.tsx`: `PrivacyPolicy()`, `ContactEmail()`, `POLICY_IS_DRAFT`, `CONTACT_EMAIL`.

- [ ] **Step 1: Create `components/legal/LegalLinks.tsx`:**

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** Privacy policy + support links (footer, auth pages, settings). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={cn(
        "flex items-center justify-center gap-4 text-sm text-muted-foreground",
        className,
      )}
    >
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        Privacy policy
      </Link>
      <Link href="/support" className="hover:text-foreground hover:underline">
        Support
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Create `components/legal/LegalPage.tsx`:**

```tsx
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { LegalLinks } from "@/components/legal/LegalLinks";

/** Shared text styles for the legal/support pages. */
export const LEGAL_H2 = "mt-8 text-lg font-semibold tracking-tight";
export const LEGAL_P = "mt-3 text-sm leading-relaxed text-muted";
export const LEGAL_UL =
  "mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted";

/** Public page frame: logo home link, title, content, legal links. */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" aria-label="ITJobCafe home" className="inline-block">
          <Logo />
        </Link>
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight">{title}</h1>
        {children}
        <LegalLinks className="mt-12 border-t-2 border-border pt-6" />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `components/legal/PrivacyPolicy.tsx`:**

```tsx
/**
 * ITJobCafe privacy policy — DRAFT, written from what the code actually
 * collects and shares (spec 2026-10-16). Not legal advice. ITJobCafe must
 * approve it before the mobile apps launch: replace the bracketed constants
 * below and set POLICY_IS_DRAFT to false (that removes the draft banner).
 * When the profile moves server-side (mobile program, project 2), rewrite the
 * "Stored only on your device" paragraph.
 */

import { LEGAL_H2, LEGAL_P, LEGAL_UL } from "@/components/legal/LegalPage";

export const POLICY_IS_DRAFT = true;
export const POLICY_LAST_UPDATED = "October 16, 2026";
export const CONTACT_EMAIL = "[contact email]";
const COMPANY_NAME = "[ITJobCafe legal entity name]";
const JURISDICTION = "[governing jurisdiction]";
const BACKUP_RETENTION = "[backup retention period]";

/** A mailto link once CONTACT_EMAIL is a real address; the placeholder until then. */
export function ContactEmail() {
  return CONTACT_EMAIL.includes("@") ? (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium text-accent hover:underline"
    >
      {CONTACT_EMAIL}
    </a>
  ) : (
    <span className="font-medium">{CONTACT_EMAIL}</span>
  );
}

export function PrivacyPolicy() {
  return (
    <article>
      {POLICY_IS_DRAFT && (
        <p
          role="note"
          className="mt-6 rounded-md border-2 border-[var(--caution)] bg-amber-50 p-4 text-sm font-medium"
        >
          Draft — pending ITJobCafe review. Bracketed items are placeholders.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated: {POLICY_LAST_UPDATED}
      </p>

      <p className={LEGAL_P}>
        {COMPANY_NAME} (“ITJobCafe”, “we”) runs the ITJobCafe website at
        itjobcafe.ai and the ITJobCafe mobile apps. This policy explains what
        we collect, why, who we share it with, and how to delete it.
      </p>

      <h2 className={LEGAL_H2}>What we collect</h2>
      <ul className={LEGAL_UL}>
        <li>
          <strong>Your account:</strong> your email address, your name if you
          give it, your password (stored only as a one-way hash — we never
          store or see the password itself), and when you last signed in. If
          you sign in with Google, we also store your Google account ID and a
          link to your Google profile picture.
        </li>
        <li>
          <strong>Resumes you upload:</strong> the file itself, the text we
          extract from it, and the name, phone number and job title you enter
          with it, if any.
        </li>
        <li>
          <strong>Your job activity:</strong> the jobs you save, skip, apply to
          or otherwise track, your notes on them, and basic details of each job
          (title, company, location and link) as they were when you saved it.
        </li>
        <li>
          <strong>AI fit scores:</strong> the scores and explanations generated
          for your resume against jobs.
        </li>
        <li>
          <strong>Mobile app sign-ins:</strong> your device&apos;s name and when
          each app sign-in was created and last used.
        </li>
      </ul>
      <p className={LEGAL_P}>
        <strong>Stored only on your device:</strong> your profile and job
        preferences (such as preferred locations, roles and technologies) are
        kept in your browser&apos;s or app&apos;s local storage, not on our
        servers.
      </p>

      <h2 className={LEGAL_H2}>How we use it</h2>
      <ul className={LEGAL_UL}>
        <li>To show you job listings and filter them to your preferences.</li>
        <li>To keep track of the jobs you have saved, skipped or applied to.</li>
        <li>To score how well your resume fits a job, when you ask for it.</li>
        <li>To keep you signed in, and to answer you when you contact us.</li>
      </ul>
      <p className={LEGAL_P}>
        We do not sell your information, show ads, or use advertising or
        analytics trackers.
      </p>

      <h2 className={LEGAL_H2}>Who we share it with</h2>
      <ul className={LEGAL_UL}>
        <li>
          <strong>AI scoring providers — Anthropic and DeepSeek.</strong> When a
          job is scored, we send your resume text (including any contact
          details written in your resume) and the job description to one of
          these providers, which returns the score. They process it under their
          own terms.
        </li>
        <li>
          <strong>Our hosting provider,</strong> which runs the servers and
          database that store the information above.
        </li>
      </ul>
      <p className={LEGAL_P}>We may also disclose information if the law requires it.</p>

      <h2 className={LEGAL_H2}>Where job listings come from</h2>
      <p className={LEGAL_P}>
        Job listings are collected from publicly posted job advertisements.
        They are not information about you.
      </p>

      <h2 className={LEGAL_H2}>How long we keep it, and deleting it</h2>
      <p className={LEGAL_P}>
        We keep your information until you delete your account. You can delete
        it at any time from <strong>Settings → Delete account</strong>, on the
        website or in the app. Deleting your account immediately and
        permanently removes your account, your job activity and notes, your
        uploaded resumes, your AI fit scores and your app sign-ins. Copies in
        our database backups are removed within {BACKUP_RETENTION}.
      </p>
      <p className={LEGAL_P}>
        Deleting your account on the website also clears the profile stored in
        that browser. To clear it on another browser or device, clear that
        site&apos;s data or uninstall the app.
      </p>

      <h2 className={LEGAL_H2}>Security</h2>
      <p className={LEGAL_P}>
        The website and apps connect to us over HTTPS. Passwords are stored
        only as one-way hashes, and app sign-in tokens are stored only in
        hashed form.
      </p>

      <h2 className={LEGAL_H2}>Changes to this policy</h2>
      <p className={LEGAL_P}>
        If we change this policy, we will update this page and the “Last
        updated” date above.
      </p>

      <h2 className={LEGAL_H2}>Contact</h2>
      <p className={LEGAL_P}>
        Questions or requests about your information: <ContactEmail />. This
        policy is governed by the laws of {JURISDICTION}.
      </p>
    </article>
  );
}
```

- [ ] **Step 4: Create `app/privacy/page.tsx`:**

```tsx
import { LegalPage } from "@/components/legal/LegalPage";
import { PrivacyPolicy } from "@/components/legal/PrivacyPolicy";

export const metadata = { title: "Privacy policy · ITJobCafe" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <PrivacyPolicy />
    </LegalPage>
  );
}
```

- [ ] **Step 5: Create `app/support/page.tsx`:**

```tsx
import Link from "next/link";
import {
  LEGAL_H2,
  LEGAL_P,
  LegalPage,
} from "@/components/legal/LegalPage";
import { ContactEmail } from "@/components/legal/PrivacyPolicy";

export const metadata = { title: "Support · ITJobCafe" };

export default function SupportPage() {
  return (
    <LegalPage title="Support">
      <h2 className={LEGAL_H2}>Get help</h2>
      <p className={LEGAL_P}>
        Email us at <ContactEmail /> and we&apos;ll get back to you.
      </p>

      <h2 className={LEGAL_H2}>Delete your account</h2>
      <p className={LEGAL_P}>
        Sign in, open <strong>Settings</strong>, and choose{" "}
        <strong>Delete account</strong> — on the website at{" "}
        <Link href="/settings" className="font-medium text-accent hover:underline">
          itjobcafe.ai/settings
        </Link>{" "}
        or in the app&apos;s Settings tab. You&apos;ll be asked for your
        password to confirm. Deletion is immediate and permanent.
      </p>

      <h2 className={LEGAL_H2}>Privacy</h2>
      <p className={LEGAL_P}>
        See our{" "}
        <Link href="/privacy" className="font-medium text-accent hover:underline">
          privacy policy
        </Link>{" "}
        for what we collect and how it&apos;s used.
      </p>
    </LegalPage>
  );
}
```

- [ ] **Step 6: Link the pages.**

In `app/page.tsx` add `import { LegalLinks } from "@/components/legal/LegalLinks";` and, inside the footer, after the `<p className="font-medium">…</p>` element, add `<LegalLinks />`.

In `app/login/page.tsx` and `app/signup/page.tsx` add the same import and, directly after the closing `</p>` of the "New here?" / "Already have an account?" paragraph (still inside `<div className="w-full max-w-sm">`), add `<LegalLinks className="mt-6" />`.

In `app/(app)/(protected)/settings/page.tsx` add the import and, after the `{user && ( <DeleteAccountCard … /> )}` block inside `<div className="space-y-4">`, add `<LegalLinks className="pt-2" />`.

- [ ] **Step 7: Type-check and lint.**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 8: Pages render and are linked.**

```bash
for p in /privacy /support; do curl -s -o /dev/null -w "$p %{http_code}\n" "localhost:3000$p"; done
curl -s localhost:3000/privacy | grep -o 'Draft — pending ITJobCafe review' | head -1
curl -s localhost:3000/privacy | grep -o 'Anthropic and DeepSeek' | head -1
for p in / /login /signup; do printf '%s ' "$p"; curl -s "localhost:3000$p" | grep -c 'href="/privacy"'; done
```

Expected: `/privacy 200`, `/support 200`, the two grep hits printed, and a count ≥ 1 for each of `/`, `/login`, `/signup`.

- [ ] **Step 9: Commit**

```bash
git add components/legal app/privacy app/support app/page.tsx app/login/page.tsx app/signup/page.tsx "app/(app)/(protected)/settings/page.tsx"
git commit -m "feat: draft privacy policy and support pages, linked from landing, auth and settings" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification and hand-off

**Files:** none changed (unless a check fails, in which case fix it in the task that owns the code and re-run).

**Interfaces:**
- Consumes: everything above.
- Produces: the evidence for the PR, and the hand-off notes for the human.

- [ ] **Step 1: Production build.**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean. The build's route list shows `ƒ /api/mobile/login`, `ƒ /api/mobile/logout`, `ƒ /api/mobile/me`, `ƒ /api/account/delete`, plus `/privacy` and `/support`.

- [ ] **Step 2: Full acceptance run plus the DB proof** (the dev server still running against the live DB):

```bash
STOP_BEFORE_DELETE=1 scripts/verify-mobile-backend.sh
node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" count mobile-verify@example.com UID
scripts/verify-mobile-backend.sh
node --env-file=.env.local "$SCRATCH/mobile-sql-check.mjs" count mobile-verify@example.com UID
```

(`UID` = the user id the first run prints.) Expected: non-zero counts, then `ALL <n> CHECKS PASSED`, then all zeros. Also check `settings-card-check@example.com` from Task 6 is gone: `count settings-card-check@example.com` shows all zeros.

- [ ] **Step 3: Browser pass (controller or human; required, because this is a destructive action).** In a browser on `http://localhost:3000`:
  1. Sign up a new account `ui-delete-check@example.com`, swipe a couple of jobs, and upload a resume.
  2. Open Settings. The Delete account card shows. The dialog lists the four kinds of data and asks for the **password**.
  3. Enter a wrong password and confirm: "Incorrect password." appears inline and the dialog stays open. Cancel and Escape both close it when it's not busy.
  4. Enter the right password and confirm. You land on `/` signed out. In DevTools → Application → Local Storage, `itjobcafe.swipe.v2` and `itjobcafe.swipe.imported.ui-delete-check@example.com` are gone. Logging in with that account fails.
  5. `/privacy` shows the draft banner and all sections. `/support` renders. The footer, login, signup and settings links all work. Check the pages at phone width.
  6. Regression: log in with a normal account, swipe, save a job, see it under Applications, sign out.

- [ ] **Step 4: Hand-off notes for the human** (put these in the PR description):
  - **Deploy order:** `database/setup/create-mobile-sessions.sql` must exist on the live DB before this code deploys. It was created during Task 1. Add it to the server runbook. This ships in the pending redeploy with PRs #5–#8. No new environment variables.
  - **ITJobCafe to approve the privacy policy:** fill `COMPANY_NAME`, `CONTACT_EMAIL`, `JURISDICTION`, `BACKUP_RETENTION` in `components/legal/PrivacyPolicy.tsx`, review the wording, then set `POLICY_IS_DRAFT = false`. Flag for them: DeepSeek is China-based, and some users or regions will care where resume text goes. Their call whether to say so more prominently or change providers.
  - **Post-deploy check:** `scripts/verify-mobile-backend.sh https://itjobcafe.ai`. It creates and then deletes its own test account, and its first mobile check (404 vs 400) doubles as a release marker.
  - **Follow-ups (out of scope):** login throttling; revoking other browsers' web sessions on deletion (accepted limitation); the existing routes' raw `err.message` in 500s.
