# Server-side profile: design

**Date:** 2026-10-20 · **Program:** mobile app, project #2 of 5 · **Status:** draft for review

## Why

ITJobCafe is getting an iOS and Android app (React Native / Expo, project #3). The person pictures it like this: you open the app and land on **Swipe**, with the website's five tabs along the bottom (Swipe, Dashboard, Applications, Profile, Settings). Each tab works like it does on the website, laid out for a phone, with the **same account and the same data**.

Most of that data already lives on the server: swipe history, statuses and notes (`user_job_seen`), the Applications list, and uploaded resume files (`resume_upload`). The **profile does not.** It lives only in the browser's `localStorage` (`itjobcafe.swipe.v2`, `lib/swipe/swipeStore.tsx`). That covers name, phone, LinkedIn/GitHub/portfolio links, school, major, graduation date, work authorization, location/role/remote preferences, target roles, tech stack, work-type preferences and the resume list, plus the "filter by my preferences" switch.

So today a long-time website user would open the app to a blank profile. AI scoring and the "recommended" count both read the profile, so the phone would score against nothing. Project #4 (push alerts for new matching jobs) also needs the server to know what each person wants. This project moves the profile to the account.

## What the person experiences (approved 2026-10-20)

1. **The profile belongs to the account.** Signing in anywhere (website now, the app later) shows the same profile.
2. **Existing users don't re-type anything.** The first time someone signs in on the website after this ships, the profile already in their browser is copied to their account automatically, the same way swipe history was copied up in PRs #5–#8.
3. **Edits go both ways.** A change made on one device shows up on the other the next time that device loads the page or app. It doesn't update live.
4. **People who aren't signed in see no change.** Guests can swipe on the website today, and their profile stays in their browser exactly as now.
5. **The website looks and works the same.** The Profile tab is unchanged; it just saves somewhere new.

## Non-goals

- Building the phone app, or any new screen.
- Changing how AI scoring works. The browser still sends the profile with each scoring request (`score-job` / `score-batch` request body).
- Live sync between two open devices, or merging two devices' edits field by field.
- Storing guests' profiles on the server.
- Changing what happens on sign-out (see "Left as today").

## Anti-goals: failures even if everything technically works

- **An existing user's profile goes blank or loses edits** at the first sign-in after deploy, or when a save fails.
- **One person's profile ends up in someone else's account** (shared or family computer).
- **Typing on the Profile tab feels slower**, or the website shows new errors or spinners for normal use.
- **The website breaks when the profile server is unreachable.** It must fall back to the browser copy, as today.

## Design (decided)

### Storage

New table `ITJC_SCRAPPER.dbo.user_profiles`, created by an idempotent setup script `database/setup/create-user-profiles.sql`. It follows the pattern of `create-user-job-seen.sql` / `create-mobile-sessions.sql`:

| Column | Type | Notes |
|---|---|---|
| `LoginUserID` | `INT NOT NULL` PRIMARY KEY | FK `FK_user_profiles_login_user` → `dbo.login_users(ID)`. One row per account. |
| `ProfileJson` | `NVARCHAR(MAX) NOT NULL` | The profile as one JSON document (shape below). |
| `PrefFilters` | `BIT NOT NULL DEFAULT 1` | The "filter by my preferences" switch. |
| `CreatedAt` / `UpdatedAt` | `DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()` | `UpdatedAt` is set on every save. |

The profile is stored as **one JSON document**, not a column per field. It's a nested shape with many list fields that the website and app both treat as a single object, and it will keep gaining fields (my call).

**The document never stores the email.** The account's email is the source of truth. The server strips `email` on save and fills it from the account on read, matching how the website already forces `sessionEmail` onto the profile.

### Shape and validation (server-side, on every save)

The document is the existing `ResumeProfile` type (`lib/careerOps/types.ts`), minus `email`. The server accepts only known keys and drops unknown ones. These limits are my call, set generously so no real profile is rejected:

- **Text fields** (`fullName`, `phone`, `linkedinUrl`, `githubUrl`, `portfolioUrl`, `school`, `major`, `graduationDate`): strings, trimmed, at most 500 characters each.
- **List fields** (`locationPreferences`, `rolePreferences`, `targetRoles`, `techStack`, `preferredRoleTypes`): string arrays of at most 50 items, each at most 200 characters.
- **`remotePreferences`:** only `remote` / `hybrid` / `onsite`.
- **`workAuthorization`:** only the `WorkAuthorization` values; anything else becomes `"unspecified"`.
- **`resumes`:** at most 20 entries with the `ResumeFileRef` fields. These are labels and ids for files already in `resume_upload`; the files themselves don't move.
- **`primaryResumeId`:** optional string.
- **Total size:** the serialized document is at most 64 KB.

A request that isn't a JSON object, or is over the total size, gets a 400. Fields that are merely wrong-typed are dropped or defaulted, never a 400, so an older browser tab never gets stuck.

### API

Both routes use `getRequestUser(req)` (`lib/auth/requestUser.ts`). They work with the website's cookie and with the app's Bearer token, and a bad Bearer never falls back to the cookie. Responses use `noStoreJson`.

- **`GET /api/profile`:** returns `{ ok: true, profile: ResumeProfile | null, prefFilters: boolean, updatedAt: string | null }`. `profile` is `null` when the account has never saved one, and `email` is filled from the account. Returns 401 when not signed in.
- **`PUT /api/profile`:** body `{ profile: ResumeProfile, prefFilters?: boolean }`. It **replaces the whole document**, and the last save wins. It upserts the row, returns the same shape as GET, and gives 400 on invalid JSON or an oversize body. A missing `prefFilters` keeps the stored value. It requires `content-type: application/json`, like `/api/account/delete`.

### Website behavior

All changes are inside `SwipeStoreProvider` (`lib/swipe/swipeStore.tsx`); no UI component changes.

The browser copy gains two pieces of bookkeeping in the `itjobcafe.swipe.v2` blob, both backward-compatible and absent in old data:

- **Owner:** the profile's existing `email` field already records whose profile it is, because the website forces the signed-in email onto it. A blank email means a guest-era profile.
- **`profileDirty: boolean`:** true while this browser has edits the server hasn't confirmed.

**On load, when signed in** (in the existing hydration effect, before the first job fetch so preference filters use the right profile):

1. `GET /api/profile`.
2. **The server has a profile:**
   - If the browser copy is dirty **and** its owner is this account, the browser wins. Upload it with PUT, then clear dirty. This covers edits made while a save was failing.
   - Otherwise the server wins and replaces the browser copy.
3. **The server has no profile:**
   - If the browser copy has anything filled in (any field besides `email`, or any resume) **and** its owner is blank or this account (case-insensitive), copy it up with PUT. This is the one-time move for existing users.
   - Otherwise start blank.
   - **A browser profile owned by a different email is never uploaded.** That is the shared-computer guard.
4. **GET fails** (network error or 5xx): use the browser copy as today, upload nothing, and try again on the next load.

**When signed in and the profile or the preference switch changes:**
- Mark the copy dirty and save the whole document with PUT after a short pause in typing (about 1 second debounce; the exact value is the builder's call).
- On success, clear dirty. On failure, stay dirty and retry on the next change or the next load.
- Saving never blocks typing and shows no new UI.
- Make a best-effort final save when the tab is hidden or closed (`visibilitychange` / `pagehide`).

**`reset()`** (the store's existing reset) saves the blank profile for signed-in users like any other change.

**When not signed in:** unchanged.

### Account deletion and privacy

- **`lib/auth/deleteAccount.ts`:** add `DELETE FROM ${DB}.user_profiles WHERE LoginUserID = @id` inside the existing transaction, before the `login_users` delete (the FK requires that order).
- **`components/legal/PrivacyPolicy.tsx`:** rewrite the "Stored only on your device" paragraph (the file's own comment flags it for this project).
  - Say the profile and preferences are stored with the account in our database, and keep the AI-sharing wording.
  - Add "your profile" to the list of what deleting the account removes.
  - Adjust the browser-copy paragraph: the browser keeps a copy, which the website's Delete account clears.
  - The policy is still a draft awaiting ITJobCafe, and this change goes in the same draft.
- **`app/support/page.tsx`:** update it only if it lists what deletion removes.
- **Docs:** add the table to `SQL_INTEGRATION.md`'s write-surface section, and update the README Features bullets if they mention where the profile lives.

### Left as today

- **Sign-out** leaves the browser copy in place, as it does now. The next person on that browser:
  - as a **guest**, sees the previous profile (today's behavior);
  - **signing in**, gets their own server profile or a blank one, never the previous person's, thanks to the owner guard.

  Clearing the browser copy on sign-out is a reasonable follow-up, but it would change visible website behavior, so it's out of scope.
- **The resume "remove" button** still removes the entry from the profile's list without deleting the stored file.

## Constraints

- Next.js 16.2.9 App Router, so read `node_modules/next/dist/docs/` before writing route code (AGENTS.md). Route handlers use `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`, like the existing ones.
- SQL Server through the existing `getPool` / `sql` in `lib/db/sqlServer.ts`, with parameterized queries only and tables written as `ITJC_SCRAPPER.dbo.<table>`. Use `SYSUTCDATETIME()` for timestamps.
- The live database needs `create-user-profiles.sql` run **before** this deploys. The live database is shared production, so a person runs it, as with `create-mobile-sessions.sql`.
- Ships in the same pending redeploy as PRs #5–#9. There are no new environment variables.
- The repo is public. Commit messages, PR text and code comments must not discuss unpatched security issues.

## Left to the builder

- Exact debounce timing and how the save loop handles "a save is in flight and another change arrives". Requirements: never lose the newest edit, and never send saves out of order so an older one lands last.
- Module layout. A repository module beside `lib/jobs/userJobSeenRepository.ts`, a validator shared by GET and PUT, and the route at `app/api/profile/route.ts` is the expected shape.
- How the hydration effect is restructured, provided the order in "On load" holds and the job fetch uses the resolved profile's preferences.

## How we'll know it works

- **An acceptance script** `scripts/verify-profile-sync.sh` (curl + jq, same style and `@example.com` safety guard as `scripts/verify-mobile-backend.sh`). It covers:
  - GET with no profile returns `null`;
  - PUT then GET round-trips;
  - the cookie and a Bearer token see the same profile;
  - unknown keys are dropped, oversized lists are capped, and `email` is ignored;
  - non-object, oversize and wrong content-type requests get 400; no auth or a bad Bearer gets 401;
  - account deletion removes the row.
- **A browser walkthrough** before merging:
  1. **Existing user:** with a filled profile saved in the browser before the update, sign in and confirm the profile is unchanged and now stored on the server.
  2. **A second browser** signed in to the same account shows the same profile.
  3. **An edit in browser B** appears in browser A after a reload.
  4. **Shared computer:** user A signs out, user B signs in on the same browser. B does not get A's profile, and A's server profile is untouched.
  5. **A guest** sees no change.
  6. **A failed save** (stop the server mid-edit), then reload once it's back: the edit is kept.
- `npx tsc --noEmit`, `npm run lint` and `npm run build` are clean.
