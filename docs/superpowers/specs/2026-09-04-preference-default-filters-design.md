# Preference-Based Default Filters — Design

**Date:** 2026-09-04
**Goal:** The profile page's Preferences section acts as an always-on baseline
filter for the jobs feed: jobs must match the user's location preferences AND
their role/target-role keywords AND their preferred tech stack (any one tag
within each category suffices). Manual filters from the Filters panel stack on
top. A visible toggle turns the baseline off.

## Decisions (approved)

- **Baseline + toggle:** preference filters AND into every feed fetch as a
  baseline; the Filters panel stacks on top. A "Use my preferences" switch
  (panel row + swipe-page indicator chip) shows the state and turns it off.
- **Fields (v1) and their matching:**
  - `locationPreferences` → contains-match against city/state/location text;
    a tag containing "remote" also accepts `Isremote = 1` jobs.
  - `rolePreferences` ∪ `targetRoles` → whole-word/phrase match against the
    job TITLE only.
  - `techStack` → whole-word match against title + description (same engine
    and 3-tag perf cap as the manual skill filter).
  - `remotePreferences`, `preferredRoleTypes`, `workAuthorization` are
    excluded from v1 — no reliable DB column (text-inferred client-side);
    filtering on them would wrongly exclude jobs.
- **Semantics:** OR within a category, AND across categories and with all
  manual filters ("even 1 tech-stack match displays it").
- **Empty feed:** a preference-aware empty state (no auto-fallback): "No jobs
  match your preferences" with one-tap **Show all jobs** (toggle off +
  refetch) and **Edit preferences** (→ /profile).
- Applies to guests and logged-in users alike (the profile lives client-side
  either way).

## Section 1 — Data flow & query params

The profile is client-side (swipe store / localStorage), so the client
derives the baseline. A pure helper in `lib/swipe/` maps the profile to
params; the store appends them to every feed fetch when the toggle is on:

- `derivePrefFilterParams(profile): { prefLoc: string[]; prefRole: string[]; prefTech: string[] }`
  - `prefLoc` = cleaned `locationPreferences`, cap **5**, ≤ 60 chars each.
  - `prefRole` = cleaned `rolePreferences` ∪ `targetRoles` (CI-deduped),
    cap **6**, ≤ 60 chars each (title-only matching keeps these cheap).
  - `prefTech` = cleaned `techStack`, cap **3**, ≤ 40 chars each (identical
    cleaning to the manual skill filter).
  - Cleaning = trim → truncate → drop empties → CI-dedupe → cap (first N).
- New repeated query params on `GET /api/jobs`: `prefLoc=`, `prefRole=`,
  `prefTech=`. They are **separate from `skill=`** deliberately: merging
  pref tech into the manual OR-group would let a preference tag satisfy a
  manual skill filter and break its meaning. The server re-cleans each list
  (same rules, defense in depth) into `JobFilters.prefLocations`,
  `prefRoles`, `prefTech`.

## Section 2 — SQL (`lib/db/jobsRepository.ts`)

Three new parenthesized OR-groups pushed into the existing `where` array
(each ANDs with the others and with every existing filter). All values are
bound parameters; patterns are built in Node and bound whole, reusing the
skill filter's `escapeLike` / `SKILL_BOUNDARY` / `skillPattern` helpers:

- **prefTech** — per tag `i`: haystack
  `(' ' + Title + ' ' + ISNULL(description, '') + ' ') LIKE @prefTech{i} ESCAPE '\'`
  with `skillPattern(tag)` — byte-identical semantics to the manual skill
  filter.
- **prefRole** — per tag: `(' ' + Title + ' ') LIKE @prefRole{i} ESCAPE '\'`
  with `skillPattern(tag)` — whole-word/phrase against the title only
  (multi-word tags like "Backend New Grad" phrase-match).
- **prefLoc** — per tag: contains-match, no word boundaries:
  `(city LIKE @prefLoc{i} OR state LIKE @prefLoc{i} OR Location LIKE @prefLoc{i})`
  with pattern `%<escapeLike(tag)>%`; if the raw tag contains `remote`
  (case-insensitive), the tag's group additionally ORs `Isremote = 1`.
  Free-text tags that match nothing ("Bay Area") are an accepted risk — the
  preference-aware empty state is the relief.

## Section 3 — Store (`lib/swipe/swipeStore.tsx`)

- New state `usePreferenceFilters: boolean`, default **true**, persisted as
  an optional `prefFilters?: boolean` field in the existing localStorage
  payload (guests and logged-in users identical; absent ⇒ true).
- Every deck fetch — initial load, `loadFilteredJobs`, `clearJobFilters`,
  `reset` — appends `derivePrefFilterParams(profile)` to the URL when the
  toggle is on AND at least one param list is non-empty. `buildJobsUrl`
  gains an optional pref-params argument.
- New action `setUsePreferenceFilters(on: boolean)`: persists the flag and
  refetches the deck through the existing filtered-fetch path (stale-response
  guard and `replaceDeck` semantics included — tracked/swiped jobs survive,
  as with any deck replacement).
- Store exposes `prefFilterSummary` (derived): a compact caption of the
  profile's preference tags (e.g. `2 locations · 4 roles · 3 tech`, zeros
  omitted); null only when the profile has no preference tags. Deliberately
  independent of the toggle — the panel's toggle row shows the caption even
  while the baseline is off, so the user can see what enabling it would do.
- Editing preferences on /profile takes effect on the NEXT fetch — no
  refetch-on-keystroke.

## Section 4 — UI

- **Filters panel** (`JobFilterButton.tsx`): a "Use my preferences" toggle
  row at the top, with a caption built from `prefFilterSummary`
  (e.g. "2 locations · 4 roles · 3 tech — set on your profile"). When the
  profile has no preference tags at all, the row shows muted helper text
  ("Add preferences on your profile to filter by default") instead of the
  toggle. Flipping the toggle applies immediately (refetch), independent of
  Apply/Cancel.
- **Swipe page indicator chip**: shown only while the baseline is active —
  small pill near the progress row ("Preferences on"); tapping opens the
  Filters panel. The panel's badge continues to count only manual filter
  rows.
- **Empty state** (swipe page): when the fetch returned zero jobs and the
  baseline was applied, show "No jobs match your preferences" with buttons
  **Show all jobs** (calls `setUsePreferenceFilters(false)`) and
  **Edit preferences** (link to /profile). Precedence: this state wins
  whenever the baseline was part of the zero-result fetch, even if manual
  filters were also active (the toggle relieves the broadest constraint;
  manual filters remain clearable in the panel). The existing
  filtered/unfiltered empty states remain for fetches where the baseline
  was off.

## Section 5 — Error handling & edge cases

- Toggle on but every pref list empty → no params sent, zero query cost, no
  indicator chip (behaves as today).
- Oversized/duplicate tags can't reach SQL: helper caps client-side, route
  re-caps server-side.
- Injection surface unchanged: bound parameters only; reuses the proven
  escape path.
- Tracked pipeline, seen-history, and scoring are untouched; scoring draws
  candidates from whatever deck is loaded (now pref-filtered), consistent
  with how manual filters already behave.

## Section 6 — Performance (accepted, documented)

Each `prefTech` tag adds a full-scan description LIKE (seconds per clause —
the reason the cap is 3, matching the manual skill filter). With tech prefs
set, every feed load pays this cost: expect ~15–25s instead of ~8s; worst
case with 3 manual skill chips stacked ≈ 30–40s, under the 60s pool
requestTimeout raised in the skill-filter project. `prefRole` (short Title
column) and `prefLoc` (short columns) clauses are comparatively cheap. The
loading skeleton covers the wait; the toggle is the relief valve. This
raises the priority of the open perf follow-up (index/FTS or dedicated feed
pool) but does not block v1.

## Section 7 — Verification (no test framework; build + curl + UI pass)

1. `npm run build` + `npm run lint` clean.
2. curl semantics (against the live dev server):
   - `prefTech=python` behaves identically to `skill=python` (same result
     invariant: every job whole-word-matches).
   - `prefRole=engineer` → every returned TITLE whole-word-matches
     "engineer"; a description-only match is NOT sufficient.
   - `prefLoc=Austin` → every job's city/state/location contains "Austin";
     `prefLoc=Remote%20(US)` → returns `Isremote=1` jobs too.
   - AND across categories: `prefLoc=Austin&prefTech=python` ⊆ each single
     list; OR within: two `prefTech` values return the union.
   - Separation: `skill=python&prefTech=react` requires BOTH (a react-only
     job is excluded).
   - Caps: 7 `prefTech` values → capped to 3, HTTP 200.
3. UI: toggle row + caption; chip appears/disappears; Show-all-jobs path
   refetches unfiltered; guest window gets the same behavior; profile edits
   apply on next fetch.

## Out of scope

- Remote/role-type/work-auth preference filtering (no reliable column).
- Server-side profile storage (separate project; this feature reads the
  client profile wherever it lives).
- Any scoring, seen-history, or tracked-pipeline changes.
- Query performance work (tracked separately; see Section 6).
