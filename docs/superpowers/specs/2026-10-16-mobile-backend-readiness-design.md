# Mobile Backend Readiness — Design

**Date:** 2026-10-16
**Goal:** Make the existing backend usable by a native (Expo / React Native)
iOS + Android app, and meet the app-store requirements the backend owns:
token-based login for mobile clients on every session-gated API route, account
deletion (in-app and on the web), and public privacy-policy and support pages.
The website's behavior is unchanged apart from the new Settings card and links.

This is project **1 of 5** in the mobile program. The others, each with its
own spec: (2) server-side profile, (3) Expo app v1, (4) push alerts,
(5) store release. Program goals (user-stated): store presence on both
platforms, a native-feeling swipe experience, and push alerts for new
matching jobs. No hard deadline.

## Decisions (approved)

- **Sign-in at launch: email/password only.** No Google or Apple sign-in on
  mobile for now, which also avoids Apple's rule that Google sign-in on iOS
  requires Sign in with Apple. The token design is provider-agnostic, so
  Google/Apple can be added later as new ways to mint the same token.
- **Token approach: opaque random tokens stored hashed in a new
  `mobile_sessions` table** (chosen over reusing the Auth.js JWT, which cannot
  be revoked, and over access + refresh tokens, which is more machinery than
  this scale needs). Gives real logout, revocation on account deletion, and no
  dependency on next-auth beta internals or on `AUTH_SECRET`.
- **Bearer means Bearer:** a request carrying `Authorization: Bearer` is judged
  on the token alone. An invalid token is a 401 even if a valid cookie is also
  present; there is no fallback to the cookie.
- **Account deletion confirmation:** re-enter the password; accounts with no
  password (Google-only) type their email instead. Wrong confirmation is a
  **403**, not 401.
- **Accepted limitation:** web sessions are stateless JWT cookies, so a
  deleted user's session in *another* browser stays decodable until the cookie
  expires; its requests find no data or fail on the FK. Mobile sessions die
  immediately. Not worth a per-request DB check on the web.
- **Privacy policy:** Claude drafts it from what the code actually collects and
  shares; ITJobCafe approves it. It ships with a visible draft banner and
  bracketed placeholders until they do. Not legal advice.

## Section 1 — Units

**Shared logic (`lib/auth/`):**

- `credentials.ts` — `verifyCredentials(email, password): Promise<LoginUser | null>`.
  The bcrypt check moved out of `auth.ts`'s `authorize()` (normalize email,
  require `emailPasswordEnabled` + `passwordHash`, `bcrypt.compare`, then
  `updateLastLogin`). `auth.ts` calls it, so the web and mobile logins share
  one password check.
- `mobileSessions.ts` — the `mobile_sessions` repository:
  - `createMobileSession(userId, deviceName): Promise<{ token: string; expiresAt: Date }>`
  - `resolveMobileToken(token): Promise<{ id: number; email: string } | null>`
  - `revokeMobileSession(token): Promise<void>`
  - `deleteExpiredSessions(userId): Promise<void>`
- `requestUser.ts` — `getRequestUser(req: Request): Promise<{ id: number; email: string } | null>`.
  If the `Authorization` header starts with `Bearer `, resolve the token and
  return the result (null if invalid; never consult the cookie). Otherwise
  call `auth()` and map `session.user.id` / `session.user.email`; return
  null if either is missing.
- `requestUser.ts` also exports `hasBearer(req): boolean`, for the one route
  that admits guests (below).
- `deleteAccount.ts` — `deleteAccount(userId: number, email: string): Promise<void>`,
  one transaction (Section 4).

**Existing routes (7):** replace `await auth()` with `getRequestUser(req)` in
`app/api/jobs/route.ts`, `jobs/tracked`, `jobs/seen`, `jobs/seen/import`,
`resume-upload`, `scoring/score-job`, `scoring/score-batch`. Behavior is
otherwise unchanged. `jobs/tracked`'s `GET()` gains a `req: Request` param.
`GET /api/jobs` is the one route that serves guests: there, a null user
*with* a Bearer header (`hasBearer(req)`) returns 401 instead of falling
through to guest results, so an expired app token surfaces as a 401 rather
than silently showing already-seen jobs. With no Bearer header it behaves
exactly as today.
Routes that read `session.user.email` (`resume-upload`, both scoring routes)
take it from the helper's `email`.

**New routes:** `POST /api/mobile/login`, `POST /api/mobile/logout`,
`GET /api/mobile/me` (Section 3), `POST /api/account/delete` (Section 4).

**New pages:** `/privacy`, `/support` (Section 5); a Delete-account card on
`/settings` (Section 4).

**Database:** `database/setup/create-mobile-sessions.sql` (Section 2).

## Section 2 — `mobile_sessions` and the token lifecycle

```sql
USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.mobile_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.mobile_sessions (
        ID           INT IDENTITY(1,1) PRIMARY KEY,
        LoginUserID  INT           NOT NULL,
        TokenHash    CHAR(64)      NOT NULL,   -- SHA-256 hex of the token
        DeviceName   NVARCHAR(100) NULL,
        CreatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        LastUsedAt   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        ExpiresAt    DATETIME2     NOT NULL,
        CONSTRAINT FK_mobile_sessions_login_user
            FOREIGN KEY (LoginUserID) REFERENCES dbo.login_users (ID)
    );

    CREATE UNIQUE INDEX UX_mobile_sessions_TokenHash
        ON dbo.mobile_sessions (TokenHash);
    CREATE INDEX IX_mobile_sessions_LoginUserID
        ON dbo.mobile_sessions (LoginUserID);
END;
GO
```

Idempotent like the other `database/setup/` scripts. No `ON DELETE CASCADE`
(matches `user_job_seen`); `deleteAccount()` removes rows explicitly.

- **Token:** 32 bytes from `crypto.randomBytes`, base64url-encoded (43
  chars). Returned to the client once at login; never stored or logged.
- **Hash:** SHA-256 hex, unsalted. Safe because the input is 256 random bits
  (no dictionary to attack), and it allows a single indexed equality lookup.
- **Resolve:** one query —
  `mobile_sessions` JOIN `login_users` on `LoginUserID = ID`, `WHERE TokenHash = @hash AND ExpiresAt > SYSUTCDATETIME()`,
  selecting the session's `ID`, `LastUsedAt`, and the user's `ID` and `Email`.
  The join means the email is always current and a deleted user's token
  cannot resolve. All timestamps use SQL Server's clock.
- **Sliding expiry:** lifetime **90 days**. When a resolve finds
  `LastUsedAt` older than **24 hours**, one `UPDATE` sets
  `LastUsedAt = SYSUTCDATETIME()` and `ExpiresAt = DATEADD(day, 90, SYSUTCDATETIME())`.
  At most one write per device per day.
- **Cleanup:** every successful mobile login first runs
  `deleteExpiredSessions(userId)` (that user's rows with `ExpiresAt <= SYSUTCDATETIME()`).
  No scheduled job.

## Section 3 — Mobile endpoints

All new routes: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, the
existing `{ ok, error }` JSON shape, and `Cache-Control: no-store` on every
response. 500s return a generic message and `console.error` the real one (the
existing routes' raw-`err.message` habit is not copied and not changed here).

**`POST /api/mobile/login`**
- Body `{ email, password, deviceName? }`. Email via `normalizeEmail`;
  `deviceName` trimmed, capped at 100 chars, empty → null.
- Invalid JSON, or missing email or password → 400.
- `verifyCredentials` null → `401 { ok:false, error:"Invalid email or password." }`
  (same message for unknown email and wrong password).
- Success: `deleteExpiredSessions(user.id)`, `createMobileSession(...)` →
  `200 { ok:true, token, expiresAt (ISO 8601), user:{ id, email, name } }`.

**`POST /api/mobile/logout`**
- No Bearer header → 401. Otherwise `revokeMobileSession(token)` and
  `200 { ok:true }`, also when the token was already gone or expired
  (idempotent; the client's job is just to forget the token).

**`GET /api/mobile/me`**
- `getRequestUser(req)` → null → 401. Otherwise `getUserById(id)` →
  `200 { ok:true, user:{ id, email, name } }` (401 if the row vanished).
- The app calls this on launch to choose logged-in vs login screens.

**Unchanged flows the app reuses:** sign-up is `POST /api/auth/register` then
`/api/mobile/login`; guest → account import is `POST /api/jobs/seen/import`
with the Bearer header; every other gated route takes the same request plus
the header.

## Section 4 — Account deletion

**`POST /api/account/delete`** — body `{ password?, confirmEmail? }`.

1. `getRequestUser(req)` → null → 401.
2. `getUserById(id)` → null → 401.
3. Confirmation:
   - user has `emailPasswordEnabled` and a `passwordHash` → `bcrypt.compare(password, hash)`;
   - otherwise → `normalizeEmail(confirmEmail) === user.email`.
   - Failure → `403 { ok:false, error:"Incorrect password." }` (or
     `"Email does not match."` on the email path).
4. `deleteAccount(user.id, user.email)` — one `sql.Transaction`, in order:
   1. `DELETE mobile_sessions WHERE LoginUserID = @id`
   2. `DELETE user_job_seen WHERE LoginUserID = @id`
   3. `DELETE career_ops_scores WHERE UserEmail = @email OR ResumeUploadID IN (SELECT ID FROM resume_upload WHERE LoginUserID = @id OR Email = @email)`
   4. `DELETE resume_upload WHERE LoginUserID = @id OR Email = @email`
      (`OR Email` catches older uploads never linked to an account)
   5. `DELETE login_users WHERE ID = @id`

   Scores go before resumes because `career_ops_scores.ResumeUploadID`
   points at `resume_upload.ID` (not FK-enforced, but nothing should be left
   pointing at a deleted resume). Any failure rolls back everything → generic 500.
5. `200 { ok:true }`.

**Web UI (`/settings`):**
- New "Delete account" card under the existing Account card. The settings
  page (server component) calls `getUserById` to decide which confirmation
  field to show.
- Button opens the existing `components/ui/dialog.tsx` (centered). The dialog
  lists what is deleted (account; saved/applied/skipped jobs and notes;
  uploaded resumes; AI scores), states it cannot be undone, and shows a
  password field or a type-your-email field. Destructive-styled confirm
  button, disabled until the field is non-empty and while the request runs;
  the 403 message shows inline.
- On success, in order: remove `localStorage` keys `itjobcafe.swipe.v2` and
  `itjobcafe.swipe.imported.<email>` (the resume-derived profile lives
  there), `signOut({ redirect: false })`, `router.push("/")`.
- This page doubles as Google Play's required web path for deleting an
  account without installing the app.

**App:** on 200, forget the token (already revoked server-side).

## Section 5 — Privacy and support pages

- `app/privacy/page.tsx` and `app/support/page.tsx`: public server
  components outside the protected group. Policy text lives in one file,
  `components/legal/PrivacyPolicy.tsx`, so edits touch one place.
- Linked from a new small footer on the landing page (`components/landing/Landing.tsx`),
  under the login and sign-up forms, and from `/settings`.
- **Policy draft content** (derived from the code):
  - Account data: email, name, bcrypt password hash (never the password),
    last-login time; Google account ID and profile image URL for Google
    accounts.
  - Resumes: the uploaded file (`resume_upload.Resume`), its extracted text,
    and optional first/last name, phone, job title.
  - Activity: job statuses (saved/applied/skipped etc.), notes, and the job
    snapshot captured on save.
  - AI scores per resume and job.
  - Mobile: device name and session timestamps.
  - Stored on the device only (for now): profile and preferences in browser
    storage. Update the policy when project 2 moves these server-side.
  - Shared with: Anthropic and DeepSeek receive resume text and job
    descriptions for scoring; the hosting provider. No advertising or
    analytics trackers.
  - Job listings are collected from public postings, not from users.
  - Retention: kept until the user deletes their account; deletion removes
    everything above; how to delete (Settings → Delete account, or in the app).
- **Placeholders for ITJobCafe**, rendered in brackets: legal entity name,
  contact email, governing jurisdiction, backup-retention period for deleted
  data.
- **Flag for ITJobCafe (in the hand-off, not the policy):** DeepSeek is
  China-based; some users/regions will care where resume data goes. Their
  call whether to disclose prominently or change providers.
- A visible "Draft — pending ITJobCafe review" banner on `/privacy` until
  approved. Approval = fill the brackets, remove the banner.
- `/support`: contact email (same placeholder), how to delete an account,
  link to `/privacy`.

## Section 6 — Security

- Tokens travel over HTTPS only: the app hard-codes `https://itjobcafe.ai`
  (the name on the certificate). HTTP already 301s to HTTPS; no server-side
  enforcement added.
- Never log the `Authorization` header or token values; log user IDs only.
- No CORS headers: native clients don't need them, and their absence keeps
  third-party websites from calling the API from a browser.
- No new environment variables. Tokens are independent of `AUTH_SECRET`, so
  the pending secret rotation won't log out mobile users.
- Account enumeration: no timing-equalization on login, because
  `/api/auth/register` already reveals whether an email exists.

## Section 7 — Verification (no test framework; build + curl + UI pass)

1. `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.
2. User runs `database/setup/create-mobile-sessions.sql` on the live DB
   (additive; the deployed build ignores it).
3. curl against a local dev server on the live DB, using a throwaway account
   that the run deletes at the end:
   - login: correct → token; wrong password → 401; missing field → 400.
   - `/me`: token → user; no auth → 401; garbage Bearer → 401 **even with a
     valid session cookie also sent**.
   - `/api/jobs`: no auth → guest results (unchanged); garbage Bearer → 401.
   - All 7 gated routes accept the Bearer header (e.g. a status POSTed to
     `jobs/seen` appears in `jobs/tracked`; `jobs` excludes the seen job).
   - Sliding expiry: set the row's `LastUsedAt` back 2 days in SQL, call
     `/me`, confirm `LastUsedAt` and `ExpiresAt` both moved.
   - Logout → `/me` 401; second logout → 200.
   - Delete: wrong password → 403; correct → 200; `/me` → 401; zero rows
     remain for that user ID/email in all five tables.
4. Browser pass (required this time — destructive action): web login, swipe,
   upload, the Settings delete card end to end (dialog, correct field, lands
   on `/` signed out, `localStorage` keys gone), `/privacy` and `/support`
   render, footer links work.
5. Deploy: ships in the pending redeploy alongside PRs #5–#8, after step 2's
   table exists. No other server changes.

## Out of scope

- Google / Apple sign-in on mobile (later; mints the same token).
- Login throttling (follow-up: failed-attempt counter per email + IP; the web
  login has none today either).
- A signed-in-devices list, per-user device cap, token prefix.
- Changing existing routes' raw `err.message` 500s (existing PR #2 follow-up).
- Revoking other browsers' web sessions on deletion (accepted limitation).
- The Expo app, server-side profile, push alerts, store listings (projects 2–5).
