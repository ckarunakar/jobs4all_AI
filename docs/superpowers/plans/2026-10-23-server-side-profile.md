# Server-side Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each account's profile and its "filter by my preferences" switch on the server, and keep the website's browser copy in sync with it. The phone app (project #3) then sees the same profile, while the website looks and behaves exactly as before.

**Architecture:**
- **Storage and API:** a new `user_profiles` table (one JSON document per account) behind `GET`/`PUT /api/profile`. The routes accept the website cookie or the app's Bearer token.
- **Pure logic:** the validation, sync-decision and save-queue rules live in two pure TypeScript modules under `lib/profile/`, unit-tested with Node's built-in test runner.
- **Website wiring:** `SwipeStoreProvider` uses those modules to load the server profile on sign-in, copy existing browser profiles up once, and save edits after a short pause.

**Tech Stack:** Next.js 16.2.9 App Router, TypeScript, SQL Server via `mssql`, `node:test` (Node 22.20, which runs `.ts` files natively), curl + jq acceptance script.

**Spec:** `docs/superpowers/specs/2026-10-20-server-side-profile-design.md`. This is the binding authority; read it before any task.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing route code (AGENTS.md: this Next.js has breaking changes). Route handlers export `runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- SQL goes through `getPool` / `sql` from `lib/db/sqlServer.ts`, with parameterized queries only. Tables are written as `ITJC_SCRAPPER.dbo.<table>`, and time comes from `SYSUTCDATETIME()`.
- No new npm dependencies. Tests use `node:test` + `node:assert/strict`, run by `npm test`.
- `lib/profile/sanitizeProfile.ts` and `lib/profile/profileSync.ts` are pure:
  - **Imports:** only `import type ...` (no value imports, no `"server-only"`), so `node --test` can load them and both the client and the server can use them.
  - **Tests:** test files import siblings with an explicit `.ts` extension, e.g. `./sanitizeProfile.ts`.
- Every `/api/profile` response uses `noStoreJson` (`lib/auth/noStoreJson.ts`). The caller comes from `getRequestUser(req)` (`lib/auth/requestUser.ts`), so a Bearer header never falls back to the cookie.
- **Exact error bodies:** `{ ok: false, error }` with these messages:

  | Status | Message |
  |---|---|
  | 401 | `"Not authenticated"` |
  | 400 | `"Invalid JSON body."` |
  | 400 | `"Profile too large."` |
  | 400 | `"Invalid profile."` |
  | 409 | `"Signed in as a different account."` |
  | 500 | `"Could not load profile."` |
  | 500 | `"Could not save profile."` |

- **Logging:** server logs name the user id only, never profile contents or email.
- **No visible website change:** no new UI, toasts or spinners. Saving never blocks typing.
- **Public repo:** commits, comments and docs must not discuss unpatched security issues.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. An implementer on a different model uses its own harness's trailer.
- **The dev server uses the live database.** `database/setup/create-user-profiles.sql` must have been run on it (a human step, see Task 1) before Task 4's acceptance run.

## Plan decisions beyond the spec

Each of these serves a spec anti-goal; reviewers should check them against it.

1. **`expectedEmail` on PUT.** If the body's `expectedEmail` is present and doesn't match the signed-in account (case-insensitive), PUT returns 409. The website always sends it.
   - **Why:** a tab still showing account A, after someone signed in as B in another tab, would otherwise save A's profile into B's account. The server picks the account from the current cookie. This serves the anti-goal "one person's profile ends up in someone else's account".
   - **App:** the app may omit the field.
2. **Save-queue logic is a pure, unit-tested module** (`createProfileSaver`), not ad-hoc effect code. The spec's "never lose the newest edit, never out of order" rule is then pinned by tests.
3. **Known limitation, as the spec reads:** on a browser two accounts shared *before* this update, the first account to sign in after it replaces any other account's not-yet-uploaded browser profile with its own. Today that profile is already overwritten as soon as the second person edits theirs.
4. **Fuller AI-sharing disclosure.** The policy's AI-sharing bullet gains "job types" (work-type preferences). The 2026-10-16 final review found this omission; Task 6 fixes it while editing that file.

## Review Focus

These are the inputs most likely to bite a user. Each now has a test in the owning task.

1. **Fast typing on the Profile tab while a save is in flight:** the server ends with the newest edit, and an older save never lands last. Task 3, saver tests 1–2.
2. **A stale tab after another tab signed in as a different account:** that tab's save is refused (409) and never written into the other account. Task 1, acceptance section 4, `expectedEmail` mismatch.
3. **Server unreachable while a different account signs in on a shared browser:** the profile starts blank and another account's profile is never shown. Task 3, decision test "error + foreign owner".
4. **Old browser data** (no `profileOwner`; `profile.email` stamped by the old seeding code): the profile counts as owned by that email. Task 3, `resolveOwner` tests.
5. **An old tab sending a partial or old-shaped profile:** it is saved with defaults, not rejected. Task 2, `sanitizeProfile({ fullName: "Ann" })` test.

---

### Task 1: Table setup script and failing acceptance script

**Files:**
- Create: `database/setup/create-user-profiles.sql`
- Create: `scripts/verify-profile-sync.sh` (executable)

**Interfaces:**
- Produces: the `ITJC_SCRAPPER.dbo.user_profiles` table, and the acceptance script that Tasks 4 and 7 run.

- [ ] **Step 1: Write `database/setup/create-user-profiles.sql`.** Use the header-comment style of `database/setup/create-mobile-sessions.sql` (run once, idempotent), with `USE [ITJC_SCRAPPER]; GO`, then:

```sql
IF OBJECT_ID('dbo.user_profiles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_profiles (
        LoginUserID  INT           NOT NULL PRIMARY KEY,
        ProfileJson  NVARCHAR(MAX) NOT NULL,
        PrefFilters  BIT           NOT NULL DEFAULT 1,
        CreatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_profiles_login_user
            FOREIGN KEY (LoginUserID) REFERENCES dbo.login_users (ID)
    );
END
GO
```

- [ ] **Step 2: Write `scripts/verify-profile-sync.sh`.**
  - **Reuse from `scripts/verify-mobile-backend.sh`:** the header style, the `@example.com` / `ALLOW_ANY_EMAIL=1` guard (exit 2), and the helpers `die`, `ok`, `call`, `expect`, `json`, `no_store`, `bearer` and `JSON`. Also reuse section 1's cookie-login sequence and the section 5 PDF heredoc for the resume upload.
  - **Defaults:** `EMAIL=${VERIFY_EMAIL:-profile-verify@example.com}`, `PASSWORD=${VERIFY_PASSWORD:-Verify-Profile-2026x}`, `BASE=${1:-http://localhost:3000}`.
  - **Behavior:** stop at the first failure, and print `ALL $PASSED CHECKS PASSED` at the end.

  Sections and checks:

  0. **Fresh test account.**
     - `POST /api/auth/register`.
     - On 409, the account is left over from an earlier run: log in with `POST /api/mobile/login`, delete it with `POST /api/account/delete` (Bearer, `{password}`, expect 200), then register again.
     - Expect a final 200.
  1. **Sign-ins.**
     - Cookie login into `$JAR`.
     - `POST /api/mobile/login` → `TOKEN=.token`, `USER_ID=.user.id`; `AUTH=(-H "$(bearer "$TOKEN")")`.
  2. **Auth rules.**
     - `GET /api/profile` with no auth → 401.
     - `GET /api/profile` with the cookie jar **and** `Authorization: Bearer not-a-real-token` → 401.
     - `PUT /api/profile` with no auth → 401.
  3. **Empty profile.** `GET /api/profile` (cookie) → 200, `.profile == null`, `.prefFilters == true`, `.updatedAt == null`, and `no_store`.
  4. **Rejected PUTs** (cookie). Each checks the status and `.error`:
     - `content-type: text/plain` → 400 `"Invalid JSON body."`
     - body `not json` → 400 `"Invalid JSON body."`
     - body `[]` → 400 `"Invalid profile."`
     - body `{"profile":"x"}` → 400 `"Invalid profile."`
     - a body over 65,536 bytes (a `fullName` of 70,000 characters) → 400 `"Profile too large."`
     - `{"profile":{},"expectedEmail":"someone-else@example.com"}` → 409 `"Signed in as a different account."`
  5. **Own resume.** Upload the PDF with `POST /api/resume-upload` (Bearer) → 200; `OWN_ID=.id`.
  6. **Valid PUT** (cookie). Use `jq -n` to build:
     - `profile`:
       - `email: "someone-else@example.org"` and `isAdmin: true` (both should be dropped);
       - `fullName` of 600 `a`s, `school: "Verify U"`, `workAuthorization: "bogus"`;
       - `remotePreferences: ["remote","moon"]`, `targetRoles` of 60 items;
       - `resumes`: `{id:"r-own", label:"Own", fileName:"own.pdf", uploadedAt:"2026-10-20", parsed:true, dbId:$OWN_ID}` and `{id:"r-foreign", label:"Foreign", fileName:"f.pdf", uploadedAt:"2026-10-20", parsed:false, dbId:2147483000}`;
       - `primaryResumeId: "r-own"`;
     - `prefFilters: false`;
     - `expectedEmail`: `$EMAIL` uppercased, to prove case-insensitivity.

     Expect 200, then check:
     - `.profile.email == $EMAIL`, and `.profile | has("isAdmin")` is false;
     - `.profile.fullName | length == 500`, `.profile.school == "Verify U"`, `.profile.workAuthorization == "unspecified"`;
     - `.profile.remotePreferences == ["remote"]`, `.profile.targetRoles | length == 50`;
     - `.profile.resumes[0].dbId == $OWN_ID`, `.profile.resumes[1] | has("dbId")` is false, `.profile.resumes[1].id == "r-foreign"`;
     - `.prefFilters == false`, `.updatedAt != null`, and `no_store`.

     Save `.profile` to `$WORK/saved.json`.
  7. **Same profile both ways.**
     - `GET /api/profile` (Bearer): `.profile` equals `$WORK/saved.json`, compared with `jq -S`.
     - `PUT /api/profile` (Bearer) with `{profile: saved + {school:"Phone U"}}`, no `prefFilters` and no `expectedEmail` → 200.
     - `GET /api/profile` (cookie) → `.profile.school == "Phone U"` and `.prefFilters == false` (a missing `prefFilters` keeps the stored value).
  8. **Deletion.**
     - `POST /api/account/delete` (Bearer, `{password}`) → 200. A comment in the script explains why this proves the profile row was deleted: the FK means `login_users` can't be deleted while a `user_profiles` row points at it.
     - Then `GET /api/profile` (Bearer) → 401.

- [ ] **Step 3: Run it to verify it fails.** Run `chmod +x scripts/verify-profile-sync.sh && scripts/verify-profile-sync.sh`. Expected: sections 0–1 print `ok` lines, then `FAIL: GET /api/profile without auth: expected HTTP 401, got 404`.

- [ ] **Step 4: Commit.**

```bash
git add database/setup/create-user-profiles.sql scripts/verify-profile-sync.sh
git commit -m "test: user_profiles table setup and failing profile-sync acceptance script"
```

- [ ] **Step 5 (controller, not the implementer): live table.**
  - Before Task 4, a human must create the table on the live database. Ask the user. Earlier this needed auto mode switched off.
  - Then confirm the table exists with the scratchpad `table-exists.mjs` / `run-setup-sql.mjs` helpers.

### Task 2: Profile validator and the test runner

**Files:**
- Modify: `package.json` (scripts: add `"test": "node --test \"lib/**/*.test.ts\""`)
- Modify: `tsconfig.json` (`compilerOptions`: add `"allowImportingTsExtensions": true`. This is allowed because `noEmit` is already true, and the test files need it.)
- Create: `lib/profile/sanitizeProfile.ts`
- Test: `lib/profile/sanitizeProfile.test.ts`

**Interfaces:**
- Consumes: `ResumeProfile`, `ResumeFileRef`, `WorkAuthorization` and `RemoteType` (type-only) from `lib/careerOps/types.ts`.
- Produces:
  - `export const PROFILE_MAX_BYTES = 65536`, `TEXT_MAX = 500`, `LIST_MAX_ITEMS = 50`, `LIST_ITEM_MAX = 200`, `RESUMES_MAX = 20`;
  - `export type StoredProfile = Omit<ResumeProfile, "email">`;
  - `export function sanitizeProfile(input: unknown): StoredProfile | null`;
  - `export function stripForeignResumeIds(profile: StoredProfile, owned: ReadonlySet<number>): StoredProfile`.

**Sanitizing rules** (spec, "Shape and validation"):
- **Not a plain object** (`null`, arrays, primitives): return `null`.
- **Text fields** `fullName`, `linkedinUrl`, `githubUrl`, `portfolioUrl`, `school`, `major` and `graduationDate`: always present; trimmed; cut to 500 characters; `""` if not a string.
- **`phone`:** present only if a string, then trimmed and cut to 500 characters.
- **List fields** `locationPreferences`, `rolePreferences`, `targetRoles`, `techStack` and `preferredRoleTypes`: always present.
  - Keep only strings, trimmed, dropping blanks.
  - Cut each item to 200 characters and keep the first 50 items.
- **`remotePreferences`:** only `remote` / `hybrid` / `onsite`, de-duplicated, in first-seen order.
- **`workAuthorization`:** kept only if it is one of the six `WorkAuthorization` values; otherwise `"unspecified"`.
- **`resumes`:** the first 20 object entries.
  - Drop an entry whose `id` is not a non-empty string. Cut `id` to 200 characters.
  - `label`, `fileName`: strings cut to 500 characters, default `""`. `uploadedAt`: a string cut to 50 characters, default `""`.
  - `parsed`: a boolean, default `false`.
  - `dbId`: kept only if it's a positive integer number.
- **`primaryResumeId`:** present only if a non-empty string, cut to 200 characters.
- **Dropped:** `email` and every unknown key.

`stripForeignResumeIds` returns a copy in which any resume whose `dbId` is not in `owned` loses its `dbId`. The entry itself stays, and the input is not mutated.

- [ ] **Step 1: Write the failing tests** in `lib/profile/sanitizeProfile.test.ts`. Use `import { test } from "node:test"`, `import assert from "node:assert/strict"`, `./sanitizeProfile.ts`, and `{ DEFAULT_SWIPE_PROFILE } from "../swipe/defaultProfile.ts"`.

```ts
const BLANK = {
  fullName: "", linkedinUrl: "", githubUrl: "", portfolioUrl: "",
  school: "", major: "", graduationDate: "", workAuthorization: "unspecified",
  locationPreferences: [], rolePreferences: [], remotePreferences: [],
  targetRoles: [], techStack: [], preferredRoleTypes: [], resumes: [],
};
test("non-objects are rejected", () => {
  for (const v of [null, undefined, [], "x", 5, true]) assert.equal(sanitizeProfile(v), null);
});
test("an empty object becomes the blank profile", () => {
  assert.deepEqual(sanitizeProfile({}), BLANK);
});
test("a partial old-shaped profile is filled with defaults, not rejected", () => {
  assert.deepEqual(sanitizeProfile({ fullName: "Ann" }), { ...BLANK, fullName: "Ann" });
});
test("the default swipe profile round-trips without its email", () => {
  assert.deepEqual(sanitizeProfile(DEFAULT_SWIPE_PROFILE), BLANK);
});
test("email and unknown keys are dropped; text is trimmed", () => {
  const p = sanitizeProfile({ email: "x@y.com", isAdmin: true, fullName: "  Ann  " })!;
  assert.equal("email" in p, false);
  assert.equal("isAdmin" in p, false);
  assert.equal(p.fullName, "Ann");
});
test("text is capped at 500 characters", () => {
  assert.equal(sanitizeProfile({ fullName: "a".repeat(600) })!.fullName.length, 500);
});
test("lists keep trimmed non-blank strings, 50 items of up to 200 characters", () => {
  const many = Array.from({ length: 60 }, (_, i) => `role ${i}`);
  assert.equal(sanitizeProfile({ targetRoles: many })!.targetRoles!.length, 50);
  assert.equal(sanitizeProfile({ techStack: ["x".repeat(300)] })!.techStack![0].length, 200);
  assert.deepEqual(sanitizeProfile({ techStack: ["Go", 5, "  ", null, " Rust "] })!.techStack, ["Go", "Rust"]);
});
test("remote preferences keep only known values, once each", () => {
  assert.deepEqual(
    sanitizeProfile({ remotePreferences: ["remote", "moon", "remote", "hybrid"] })!.remotePreferences,
    ["remote", "hybrid"],
  );
});
test("work authorization falls back to unspecified", () => {
  assert.equal(sanitizeProfile({ workAuthorization: "bogus" })!.workAuthorization, "unspecified");
  assert.equal(sanitizeProfile({ workAuthorization: "opt_cpt" })!.workAuthorization, "opt_cpt");
});
test("resumes: at most 20, id required, dbId only as a positive integer", () => {
  const r = (i: number) => ({ id: `r${i}`, label: "L", fileName: "f.pdf", uploadedAt: "2026-10-20", parsed: true });
  assert.equal(sanitizeProfile({ resumes: Array.from({ length: 25 }, (_, i) => r(i)) })!.resumes.length, 20);
  const out = sanitizeProfile({ resumes: [
    { label: "no id" }, { ...r(1), dbId: 7 }, { ...r(2), dbId: "7" }, { ...r(3), dbId: -1 }, { ...r(4), parsed: "yes" },
  ] })!.resumes;
  assert.deepEqual(out.map((x) => x.id), ["r1", "r2", "r3", "r4"]);
  assert.equal(out[0].dbId, 7);
  assert.equal("dbId" in out[1], false);
  assert.equal("dbId" in out[2], false);
  assert.equal(out[3].parsed, false);
});
test("phone and primaryResumeId are kept only as strings", () => {
  assert.equal("phone" in sanitizeProfile({ phone: 555 })!, false);
  assert.equal(sanitizeProfile({ phone: " 555 " })!.phone, "555");
  assert.equal(sanitizeProfile({ primaryResumeId: "r1" })!.primaryResumeId, "r1");
  assert.equal("primaryResumeId" in sanitizeProfile({ primaryResumeId: 5 })!, false);
});
test("stripForeignResumeIds removes only unowned dbIds and does not mutate", () => {
  const p = sanitizeProfile({ resumes: [
    { id: "a", dbId: 1 }, { id: "b", dbId: 2 }, { id: "c" },
  ] })!;
  const out = stripForeignResumeIds(p, new Set([2]));
  assert.deepEqual(out.resumes.map((x) => [x.id, x.dbId]), [["a", undefined], ["b", 2], ["c", undefined]]);
  assert.equal("dbId" in out.resumes[0], false);
  assert.equal(p.resumes[0].dbId, 1);
});
```

- [ ] **Step 2: Run to verify the tests fail.** Run `npm test`. Expected: FAIL, because `./sanitizeProfile.ts` can't be found.
- [ ] **Step 3: Implement `lib/profile/sanitizeProfile.ts`** to the rules above. Use a module doc comment in the style of the existing `lib/` files.
- [ ] **Step 4: Run to verify the tests pass.** `npm test` should report all tests passing. `npx tsc --noEmit` should be clean. If `.next/` holds iCloud `" 2"` duplicate files that break tsc, delete them; they're a known sync artifact.
- [ ] **Step 5: Commit.**

```bash
git add package.json tsconfig.json lib/profile/sanitizeProfile.ts lib/profile/sanitizeProfile.test.ts
git commit -m "feat: profile validator with node:test unit tests"
```

### Task 3: Sync decisions and the save queue

**Files:**
- Create: `lib/profile/profileSync.ts`
- Test: `lib/profile/profileSync.test.ts`

**Interfaces:**
- Consumes: `ResumeProfile` (type-only).
- Produces:
  - `export const PROFILE_SAVE_DELAY_MS = 1000`.
  - `export function normalizeOwner(email: string): string`: trims and lowercases.
  - `export function resolveOwner(storedOwner: unknown, storedProfileEmail: unknown): string`.
    - A string `storedOwner` wins, normalized, **even when it is `""`**.
    - Otherwise use a string `storedProfileEmail`, normalized.
    - Otherwise `""`.
  - `export function isProfileFilled(profile: ResumeProfile | null | undefined): boolean`. True if any of these hold:
    - a non-blank (trimmed) text field among `fullName`, `phone`, `linkedinUrl`, `githubUrl`, `portfolioUrl`, `school`, `major` and `graduationDate`;
    - a non-empty list among `locationPreferences`, `rolePreferences`, `remotePreferences`, `targetRoles`, `techStack` and `preferredRoleTypes`;
    - `workAuthorization` other than `"unspecified"`;
    - a non-empty `resumes` list.

    `email` and `primaryResumeId` are ignored.
  - `export type ServerProfileResult = { kind: "found"; profile: ResumeProfile; prefFilters: boolean } | { kind: "none"; prefFilters: boolean } | { kind: "error" }`.
  - `export interface LocalProfileState { profile: ResumeProfile | null; owner: string; dirty: boolean }`.
  - `export type ProfileSyncDecision = "use-server" | "upload-local" | "use-local" | "start-blank"`.
  - `export function decideProfileSync(local: LocalProfileState, server: ServerProfileResult, account: string): ProfileSyncDecision`. `account` and `local.owner` are already normalized. The decision table follows the spec's "Sync runs whenever…" steps 2–4:

    | `server` | Condition | Decision |
    |---|---|---|
    | `found` | `local.dirty && local.owner === account` | `upload-local` |
    | `found` | anything else | `use-server` |
    | `none` | `isProfileFilled(local.profile) && (local.owner === "" \|\| local.owner === account)` | `upload-local` |
    | `none` | anything else | `start-blank` |
    | `error` | `local.owner === "" \|\| local.owner === account` | `use-local` |
    | `error` | anything else | `start-blank` |

  - `export interface ProfileSaveBody { profile: ResumeProfile; prefFilters: boolean; expectedEmail: string }`.
  - `export interface ProfileSaveJob { account: string; version: number; body: ProfileSaveBody }`.
  - `export interface ProfileSaver { schedule(job: ProfileSaveJob): void; flush(keepalive: boolean): void; cancel(): void }`.
  - `export function createProfileSaver(opts: { send: (body: ProfileSaveBody, keepalive: boolean) => Promise<boolean>; currentAccount: () => string; onSaved: (job: ProfileSaveJob) => void; delayMs?: number }): ProfileSaver`.

**Saver semantics:**
- **`schedule`:** replaces any not-yet-sent job and restarts the `delayMs` timer (default `PROFILE_SAVE_DELAY_MS`).
- **When the timer fires:**
  - If a send is in flight, the job waits and goes out right after that send settles.
  - Otherwise it is sent now.
  - **At most one send is in flight** (except `flush(true)`).
- **Before sending:** a job whose `account !== currentAccount()` is dropped.
- **After `send` resolves:**
  - On `true`, call `onSaved(job)` only if `job.account === currentAccount()` still holds.
  - On `false` or a rejection, nothing happens: no automatic retry. The store retries on the next edit or sync.
- **`flush(keepalive)`:** sends the waiting job immediately, if there is one, ignoring the timer and any in-flight send.
- **`cancel()`:** clears the timer and the waiting job.

- [ ] **Step 1: Write the failing tests.** Use the setup from Task 2 (imports `./profileSync.ts` and `../swipe/defaultProfile.ts`). Use `mock.timers.enable({ apis: ["setTimeout"] })` from `node:test` for the saver tests. To settle promises, use `await` on a deferred plus `await new Promise(setImmediate)` (`setImmediate` isn't mocked).

```ts
const A = "a@x.com", B = "b@x.com";
const filled = { ...DEFAULT_SWIPE_PROFILE, school: "U" };
const local = (o: Partial<LocalProfileState>): LocalProfileState => ({ profile: filled, owner: A, dirty: false, ...o });
const found: ServerProfileResult = { kind: "found", profile: DEFAULT_SWIPE_PROFILE, prefFilters: true };
const none: ServerProfileResult = { kind: "none", prefFilters: true };
const error: ServerProfileResult = { kind: "error" };

test("resolveOwner: stored owner wins, even when blank", () => {
  assert.equal(resolveOwner("Bob@X.com", "a@x.com"), "bob@x.com");
  assert.equal(resolveOwner("", "a@x.com"), "");
});
test("resolveOwner: legacy data falls back to the stamped profile email", () => {
  assert.equal(resolveOwner(undefined, " A@X.com "), "a@x.com");
  assert.equal(resolveOwner(undefined, undefined), "");
});
test("isProfileFilled", () => {
  assert.equal(isProfileFilled(null), false);
  assert.equal(isProfileFilled(DEFAULT_SWIPE_PROFILE), false);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, email: "a@x.com" }), false);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, fullName: "   " }), false);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, workAuthorization: "us_citizen" }), true);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, techStack: ["Go"] }), true);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, resumes: [{ id: "r", label: "", fileName: "", uploadedAt: "", parsed: false }] }), true);
});
test("decide: server profile exists", () => {
  assert.equal(decideProfileSync(local({ dirty: true }), found, A), "upload-local");
  assert.equal(decideProfileSync(local({ dirty: true, owner: "" }), found, A), "use-server");
  assert.equal(decideProfileSync(local({ dirty: false }), found, A), "use-server");
  assert.equal(decideProfileSync(local({ dirty: true, owner: B }), found, A), "use-server");
});
test("decide: no server profile (one-time copy-up and the shared-computer guard)", () => {
  assert.equal(decideProfileSync(local({ owner: "" }), none, A), "upload-local");
  assert.equal(decideProfileSync(local({ owner: A }), none, A), "upload-local");
  assert.equal(decideProfileSync(local({ owner: B }), none, A), "start-blank");
  assert.equal(decideProfileSync(local({ owner: "", profile: DEFAULT_SWIPE_PROFILE }), none, A), "start-blank");
  assert.equal(decideProfileSync(local({ owner: "", profile: null }), none, A), "start-blank");
});
test("decide: server unreachable never shows another account's profile", () => {
  assert.equal(decideProfileSync(local({ owner: "" }), error, A), "use-local");
  assert.equal(decideProfileSync(local({ owner: A }), error, A), "use-local");
  assert.equal(decideProfileSync(local({ owner: B }), error, A), "start-blank");
});
```

  The saver tests build `job(v, account = A)` with `body.profile.school = \`v${v}\`` and record `send` calls as `[school, keepalive]`:

  1. **`saver coalesces edits inside the delay into one save of the newest body`:** schedule v1, tick 500, schedule v2, tick 1000. Expect sends `[["v2", false]]` and `onSaved` once, with version 2.
  2. **`saver never overlaps saves and sends the newer edit after the in-flight one settles`:** `send` returns a deferred. Schedule v1, tick 1000 (one send). Schedule v2, tick 1000; there is still one send. Resolve the first send with `true`. Expect `onSaved` with version 1, then a second send of `"v2"`.
  3. **`saver drops a save when the signed-in account changed before sending`:** `currentAccount` returns `B`. Schedule `job(1, A)`, tick 1000. Expect no sends.
  4. **`saver ignores the response when the account changed while in flight`:** start a send for `A`, switch `currentAccount` to `B`, resolve `true`. Expect no `onSaved`.
  5. **`saver does not retry a failed save on its own`:** `send` resolves `false`. Schedule v1, tick 1000, then tick 10000. Expect one send and no `onSaved`.
  6. **`flush sends the waiting edit at once with keepalive`:** schedule v1, then `flush(true)`. Expect sends `[["v1", true]]` with no tick. Tick 1000 afterwards: still one send.
  7. **`cancel drops a waiting edit`:** schedule v1, `cancel()`, tick 1000. Expect no sends.

- [ ] **Step 2: Run to verify the tests fail.** `npm test` → FAIL, because `./profileSync.ts` can't be found.
- [ ] **Step 3: Implement `lib/profile/profileSync.ts`** to the interfaces and semantics above.
- [ ] **Step 4: Run to verify the tests pass.** `npm test` should be all green, and `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.**

```bash
git add lib/profile/profileSync.ts lib/profile/profileSync.test.ts
git commit -m "feat: profile sync decisions and ordered save queue, unit-tested"
```

### Task 4: Profile storage, API routes and account deletion

**Files:**
- Create: `lib/profile/profileRepository.ts` (`import "server-only"`)
- Create: `app/api/profile/route.ts`
- Modify: `lib/auth/deleteAccount.ts` (add the `user_profiles` delete inside the transaction, before `login_users`; update the doc comment's order note)

**Interfaces:**
- Consumes:
  - `sanitizeProfile`, `stripForeignResumeIds`, `StoredProfile` and `PROFILE_MAX_BYTES` (Task 2);
  - `getRequestUser` / `RequestUser` `{ id, email }`, `noStoreJson`, and `normalizeEmail` from `lib/auth/users.ts`.
- Produces (repository):
  - `export interface ProfileRow { profile: StoredProfile; prefFilters: boolean; updatedAt: Date }`.
  - `export async function getProfileRow(userId: number): Promise<ProfileRow | null>`.
    - Parses `ProfileJson` and runs it through `sanitizeProfile`.
    - If the JSON is unparseable or sanitizes to `null`, log `[profile] stored profile unreadable for user <id>` and return `null`.
  - `export async function upsertProfile(userId: number, profile: StoredProfile, prefFilters: boolean | undefined): Promise<ProfileRow>`.
    - One `MERGE ... WITH (HOLDLOCK)` on `LoginUserID`, so two simultaneous first saves can't collide.
    - Sets `ProfileJson` and `UpdatedAt = SYSUTCDATETIME()`.
    - `PrefFilters = COALESCE(@prefFilters, target.PrefFilters)` on update, and `COALESCE(@prefFilters, 1)` on insert.
    - Returns the stored row, via `OUTPUT inserted.*` or a re-select.
  - `export async function getOwnResumeUploadIds(userId: number, email: string): Promise<Set<number>>`. Selects `ID FROM resume_upload WHERE LoginUserID = @id OR Email = @email`, the same match as `deleteAccount`.
- Produces (HTTP; the spec's API section plus decision 1):
  - **`GET /api/profile`**
    - 401 if not signed in.
    - 200 `{ ok: true, profile: row ? { ...row.profile, email: user.email } : null, prefFilters: row?.prefFilters ?? true, updatedAt: row ? row.updatedAt.toISOString() : null }`.
    - 500 `"Could not load profile."`
  - **`PUT /api/profile`**, checked in this order:
    1. 401 if not signed in.
    2. 400 `"Invalid JSON body."` unless `content-type` starts with `application/json`.
    3. Read `await req.text()`. If `Buffer.byteLength(text, "utf8") > PROFILE_MAX_BYTES`, 400 `"Profile too large."`
    4. If `JSON.parse` fails, 400 `"Invalid JSON body."`
    5. If the body is not a plain object, or `sanitizeProfile(body.profile)` is `null`, 400 `"Invalid profile."`
    6. If `typeof body.expectedEmail === "string"` and `normalizeEmail(body.expectedEmail) !== normalizeEmail(user.email)`, 409 `"Signed in as a different account."`
    7. Then: `prefFilters = typeof body.prefFilters === "boolean" ? body.prefFilters : undefined`; strip foreign resume ids using `getOwnResumeUploadIds`; `upsertProfile`; respond with the same 200 shape as GET.
    8. 500 `"Could not save profile."`
  - The file's doc comment follows `app/api/account/delete/route.ts`: what the route does, that it works with the cookie or Bearer, and the body shape.

- [ ] **Step 1: Confirm the failing check.** The controller has confirmed `user_profiles` exists on the live database (Task 1, Step 5). Run `scripts/verify-profile-sync.sh`. Expected: `FAIL: GET /api/profile without auth: expected HTTP 401, got 404`.
- [ ] **Step 2: Implement the repository, the route and the `deleteAccount` change.**
- [ ] **Step 3: Run the acceptance script against a fresh dev server.** Restart `npm run dev` first; route additions can serve stale bundles. Run `scripts/verify-profile-sync.sh`. Expected: `ALL <N> CHECKS PASSED`. Also re-run `npm test` and `npx tsc --noEmit`.
- [ ] **Step 4: Regression check on deletion.** Run `STOP_BEFORE_DELETE=1 scripts/verify-mobile-backend.sh && scripts/verify-mobile-backend.sh`. Expected: both pass (57 checks in the full run).
- [ ] **Step 5: Commit.**

```bash
git add lib/profile/profileRepository.ts app/api/profile/route.ts lib/auth/deleteAccount.ts
git commit -m "feat: GET/PUT /api/profile backed by user_profiles; account deletion removes the profile"
```

### Task 5: Website sync in the swipe store

**Files:**
- Create: `lib/profile/profileApi.ts` (client-safe fetch helpers; no `"server-only"`)
- Modify: `lib/swipe/swipeStore.tsx` (the `Persisted` interface; the hydration effect at roughly L340–476; the persist effect at roughly L479–525; `updateProfile`, `setUsePreferenceFilters` and `reset`; plus a new save effect and a page-hide listener)

**Interfaces:**
- Consumes:
  - `normalizeOwner`, `resolveOwner`, `decideProfileSync`, `createProfileSaver`, `ServerProfileResult`, `ProfileSaveBody` and `ProfileSaveJob` (Task 3);
  - `GET`/`PUT /api/profile` (Task 4).
- Produces:
  - `export async function fetchServerProfile(): Promise<ServerProfileResult>`:
    - 200 with `ok` and a profile → `found`, merged over `DEFAULT_SWIPE_PROFILE`;
    - 200 with `profile: null` → `none`;
    - any other status, or a network error → `error`.
  - `export async function sendServerProfile(body: ProfileSaveBody, keepalive: boolean): Promise<boolean>`: `PUT` with `content-type: application/json` and `keepalive` passed through. Returns `res.ok`, or `false` on a network error.
  - The `Persisted` blob gains optional `profileOwner?: string` and `profileDirty?: boolean`. The action surface of `useSwipeStore()` is unchanged.

**Store behavior** (spec, "Website behavior"; apply exactly):
1. **New state:** `profileOwner: string` and `profileDirty: boolean`.
   - Keep refs for the current account key (`isLoggedIn && sessionEmail ? normalizeOwner(sessionEmail) : ""`) and an edit-version counter.
   - Keep one saver per account key: created in an effect keyed on the account key, with `cancel()` in its cleanup. Its `send` is `sendServerProfile`, its `currentAccount` reads the account ref, and its `onSaved` clears `profileDirty` only when `job.version` equals the current edit version.
2. **Hydration, signed in.**
   - **Read the blob first:** take `owner = resolveOwner(parsed.profileOwner, parsed.profile?.email)` *before* `sessionEmail` is stamped onto the profile, and `dirty = parsed.profileDirty === true`.
   - **Then:** `await fetchServerProfile()`, return if cancelled, and `decideProfileSync(...)`.
   - **Apply the decision:**

     | Decision | Profile | Preference switch | Owner / dirty |
     |---|---|---|---|
     | `use-server` | server profile | server value | owner = account, dirty = false |
     | `upload-local` | local profile | local value | owner = account, dirty = true, and bump the version. The save effect (item 4) then uploads it. |
     | `use-local` | local profile | local value | unchanged |
     | `start-blank` | `DEFAULT_SWIPE_PROFILE` | the server value, or true when the server errored | owner = account, dirty = false |

     In every case, stamp `email: sessionEmail` onto the profile.
   - **Ordering:** this all happens **before** `maybeImport` and the first job fetch, and that fetch's preferences come from the resolved profile and switch. It does not use the pre-sync seeded values.
3. **Hydration as a guest:** unchanged. `profileOwner` and `profileDirty` are loaded from the blob and carried through untouched.
4. **Edits while signed in** (`updateProfile`, `setUsePreferenceFilters` and `reset`): set owner = account and dirty = true, and bump the edit version.
   - A save effect on `[profile, usePreferenceFilters, profileDirty, hydrated]` calls `saver.schedule({ account, version, body: { profile, prefFilters: usePreferenceFilters, expectedEmail: sessionEmail } })` when signed in, hydrated and dirty.
   - Profile changes applied by sync itself never mark dirty.
   - Guest edits never mark dirty.
5. **Page hide:** on `visibilitychange` to `hidden`, and on `pagehide`, call `saver.flush(true)` while dirty.
6. **Persist effect:** both branches write `profileOwner` and `profileDirty` alongside the existing fields. It stays the only writer of the blob.

- [ ] **Step 1: Implement `lib/profile/profileApi.ts` and the store changes.**
- [ ] **Step 2: Static checks.** Run `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: all clean, with `ƒ /api/profile` in the build's route list.
- [ ] **Step 3: Smoke test against a restarted dev server.** As a guest, `curl -s -o /dev/null -w '%{http_code}' localhost:3000/swipe` should return 200. Re-run `scripts/verify-profile-sync.sh` and expect all checks to pass. The browser walkthrough is in Task 7.
- [ ] **Step 4: Commit.**

```bash
git add lib/profile/profileApi.ts lib/swipe/swipeStore.tsx
git commit -m "feat: website keeps the signed-in profile in sync with the server"
```

### Task 6: Privacy policy and docs

**Files:**
- Modify: `components/legal/PrivacyPolicy.tsx`
- Modify: `README.md`
- Modify: `SQL_INTEGRATION.md`

**Interfaces:** none (copy only). `app/support/page.tsx` needs no change: it doesn't list what deletion removes (checked 2026-10-23).

- [ ] **Step 1: Privacy policy** (keep `POLICY_IS_DRAFT = true` and every placeholder):
  - **Doc comment:** replace the "When the profile moves server-side … rewrite the paragraph" note with `Profile storage updated for spec 2026-10-20 (server-side profile).`
  - **"What we collect":** add this item after "Resumes you upload": `<strong>Your profile:</strong> what you enter on the Profile page — your name, phone number, LinkedIn, GitHub and portfolio links, school, major, graduation date, work authorization, and your job preferences (locations, roles, remote or on-site, target roles, technologies and job types) — along with the names of your uploaded resumes and whether to filter jobs by your preferences.`
  - **"Stored only on your device" paragraph:** replace it with `<strong>Your profile is stored with your account,</strong> so it is the same on the website and in the app. Your browser or the app also keeps a copy on your device. It is sent to the AI provider only when you ask for a job to be scored, and is used only to produce that score.`
  - **AI-sharing bullet:** change `skills, and target roles and locations` to `skills, job types, and target roles and locations`.
  - **Deletion paragraph:** `removes your account, your job activity and notes,` → `removes your account, your profile, your job activity and notes,`.
  - **Browser paragraph:** `Deleting your account on the website also clears the copy of your profile stored in that browser. To clear a copy on another browser or device, clear that site&apos;s data or uninstall the app.`
- [ ] **Step 2: `README.md`:**
  - Add a Features bullet after "Account deletion": `**Profile sync** — signed-in users' profiles live with the account (`GET`/`PUT /api/profile`, cookie or Bearer), so the website and the app share one profile; existing browser profiles are copied up on first sign-in.`
  - Rewrite the Known-limitations bullet "The profile is per-browser" to say that guests' profiles stay in the browser only, and that signed-in users' profiles sync through `user_profiles`.
- [ ] **Step 3: `SQL_INTEGRATION.md`:**
  - **New section "## Profiles (write)"** before "## Mobile sessions and account deletion (write)". Cover:
    - the table;
    - the setup script, which must run once before deploying;
    - GET/PUT;
    - MERGE upsert;
    - the size and shape limits, pointing to `lib/profile/sanitizeProfile.ts`;
    - the 409 on account mismatch.
  - **Deletion section:** add `user_profiles` to the tables deleted.
  - **Write-surface bullet:** add `user profiles (MERGE into user_profiles)`, and change "those five tables" to "those six tables".
- [ ] **Step 4: Check it renders.** Run `curl -s localhost:3000/privacy | grep -o 'Your profile is stored with your account' | head -1` → prints the phrase. Run `npm run lint` → clean.
- [ ] **Step 5: Commit.**

```bash
git add components/legal/PrivacyPolicy.tsx README.md SQL_INTEGRATION.md
git commit -m "docs: privacy policy and docs describe the server-side profile"
```

### Task 7: Final verification

**Files:** none. A step that fails goes back to the owning task.

- [ ] **Step 1: Run the full automated pass:** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: all clean.
- [ ] **Step 2: Run both acceptance scripts** against a restarted dev server: `scripts/verify-profile-sync.sh` and then `scripts/verify-mobile-backend.sh`. Expected: `ALL … CHECKS PASSED` from both.
- [ ] **Step 3: Browser walkthrough (human; the merge gate).** This is the spec's list, at `localhost:3000`:
  1. **Existing user.**
     - On `main` (before this branch), sign in as a test account and fill in the profile.
     - Switch to this branch, restart, and reload.
     - The profile is unchanged, and `GET /api/profile` (DevTools → Network) returns it.
  2. **A second browser** (or a private window) signed in to the same account shows the same profile.
  3. **An edit in browser B** shows in browser A after a reload.
  4. **Shared computer.**
     - User A signs out, and user B signs in on the same browser. B sees B's own profile or a blank one, never A's, and A's server profile is unchanged.
     - Repeat with the dev server stopped during B's sign-in: B starts blank.
  5. **A guest** (signed out) can swipe and use "filter by my preferences" as before.
  6. **Failed save.** Stop the dev server, edit the profile, start the server again and reload. The edit is kept, and the server now has it.
  7. **Typing on the Profile tab** feels the same as on `main`, with no new messages or spinners.
- [ ] **Step 4: Hand-off notes for the PR.**
  - `create-user-profiles.sql` must run on the live DB before deploy. It was already run if the controller did Task 1, Step 5.
  - There are no new environment variables. This ships with the pending redeploy.
  - The privacy policy is still a draft for ITJobCafe.
  - The known limitation from "Plan decisions beyond the spec" item 3.
