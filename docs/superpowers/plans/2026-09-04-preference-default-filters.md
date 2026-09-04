# Preference-Based Default Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The profile's Preferences (locations, role prefs + target roles, tech stack) apply as an always-on baseline filter to every feed fetch — OR within a category, AND across categories and manual filters — with a "Use my preferences" toggle and a preference-aware empty state.

**Architecture:** Three new repeated query params (`prefLoc`, `prefRole`, `prefTech`) flow client → route → three parameterized OR-groups in the existing WHERE builder, reusing the skill filter's pattern helpers. A pure `lib/swipe/prefFilters.ts` derives params from the profile; the store threads them through every deck fetch behind a persisted toggle; the panel gets a toggle row, the header a status chip, the swipe page a preference-aware empty state.

**Tech Stack:** Next.js 16.2.9 App Router, TypeScript, `mssql` parameterized queries, existing UI components (`Checkbox`, `Badge`, `EmptyState`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-04-preference-default-filters-design.md`. Read it first.
- Param names exactly: `prefLoc` (cap **5** × 60 chars), `prefRole` (cap **6** × 60), `prefTech` (cap **3** × 40 — identical rules to `skill`). Cleaning everywhere = trim → truncate → drop empties → CI-dedupe → cap (first N).
- Semantics: OR within each category's group, AND across the three groups, manual filters, and all existing WHERE clauses. `prefTech`/`prefRole` use the existing `skillPattern()` whole-word engine (`prefRole` against `(' ' + Title + ' ')` only); `prefLoc` is a contains-match (`%escaped%`, no boundaries) over `city`/`state`/`Location`, and a tag containing `remote` (CI) additionally ORs `Isremote = 1` **within that tag's clause**.
- The pref groups stay separate from the manual `skill` OR-group — `skill=python&prefTech=react` must require BOTH.
- Toggle default ON; persisted as optional `prefFilters?: boolean` in the existing localStorage payload (absent ⇒ true); guests identical to logged-in.
- Exact UI copy — toggle row title: `Use my preferences`; caption with prefs: `<summary> — set on your profile` (summary like `2 locations · 4 roles · 3 tech`); caption without prefs: `Add preferences on your profile to filter by default`; header chip: `Preferences on`; empty state title: `No jobs match your preferences`; buttons: `Show all jobs`, `Edit preferences`.
- **Disclosed spec deviation (approved via this plan):** the indicator chip renders next to the Filters button in the header (inside `JobFilterButton`, which owns the panel-open state) rather than "near the progress row" — same tap-opens-panel behavior, much simpler wiring.
- All SQL values bound parameters; patterns built in Node and bound whole. No changes to sort, seen-exclusion, TOP, scoring, or tracked-pipeline behavior.
- No test framework — every task verifies with `npx tsc --noEmit && npm run lint`; Task 4 adds `npm run build` + curl. Commit after every task with the message given.
- Follow existing conventions: `"use client"` where hooks are used, `@/` imports, JSDoc file headers, existing Tailwind idioms.

---

### Task 1: Server — types, three SQL OR-groups, route parsing

**Files:**
- Modify: `types/jobListing.ts`
- Modify: `lib/db/jobsRepository.ts`
- Modify: `app/api/jobs/route.ts`

**Interfaces:**
- Consumes: existing `escapeLike`/`skillPattern`/`SKILL_BOUNDARY` helpers, `request.input` + `where.push` builder pattern, the route's `MAX_SKILLS`/`MAX_SKILL_LEN` constants and `parseSkills` helper.
- Produces: `JobFilters.prefLocations/prefRoles/prefTech?: string[]`; `GET /api/jobs?prefLoc=&prefRole=&prefTech=` filtering; a generalized `cleanKeywordList(values, maxLen, maxCount)` replacing `parseSkills`. Tasks 2–3 rely on the exact param names.

- [ ] **Step 1: `types/jobListing.ts` — filter fields.** In `JobFilters`, after the `skills?: string[];` line add:

```ts
  /** Preference baseline: location tags (contains-match, max 5). */
  prefLocations?: string[];
  /** Preference baseline: role/title keywords (whole-word vs Title, max 6). */
  prefRoles?: string[];
  /** Preference baseline: tech keywords (whole-word vs title+description, max 3). */
  prefTech?: string[];
```

- [ ] **Step 2: `lib/db/jobsRepository.ts` — contains helper.** Below `skillPattern` add:

```ts
/** Plain contains LIKE pattern (no word boundaries) — for location tags. */
function containsPattern(text: string): string {
  return `%${escapeLike(text)}%`;
}
```

- [ ] **Step 3: `lib/db/jobsRepository.ts` — the three OR-groups.** In `fetchJobListings`, directly after the manual-skills block and before the recency block, add:

```ts
  // Preference baseline (2026-09-04 spec): three independent OR-groups,
  // ANDed with each other and with every manual filter. Kept separate from
  // the manual skills group so a preference tag can never satisfy a manual
  // skill filter.
  const prefTech = (filters.prefTech ?? []).filter(Boolean);
  if (prefTech.length > 0) {
    const clauses = prefTech.map((t, i) => {
      request.input(`prefTech${i}`, sql.NVarChar, skillPattern(t));
      return `(' ' + Title + ' ' + ISNULL(description, '') + ' ') LIKE @prefTech${i} ESCAPE '\\'`;
    });
    where.push(`(${clauses.join(" OR ")})`);
  }

  // Role/target-role keywords: whole-word/phrase against the title only.
  const prefRoles = (filters.prefRoles ?? []).filter(Boolean);
  if (prefRoles.length > 0) {
    const clauses = prefRoles.map((r, i) => {
      request.input(`prefRole${i}`, sql.NVarChar, skillPattern(r));
      return `(' ' + Title + ' ') LIKE @prefRole${i} ESCAPE '\\'`;
    });
    where.push(`(${clauses.join(" OR ")})`);
  }

  // Location tags: contains-match on the location columns; a tag containing
  // "remote" also accepts flagged-remote rows.
  const prefLocations = (filters.prefLocations ?? []).filter(Boolean);
  if (prefLocations.length > 0) {
    const clauses = prefLocations.map((tag, i) => {
      request.input(`prefLoc${i}`, sql.NVarChar, containsPattern(tag));
      const cols = `(city LIKE @prefLoc${i} ESCAPE '\\' OR state LIKE @prefLoc${i} ESCAPE '\\' OR Location LIKE @prefLoc${i} ESCAPE '\\')`;
      return /remote/i.test(tag) ? `(${cols} OR Isremote = 1)` : cols;
    });
    where.push(`(${clauses.join(" OR ")})`);
  }
```

- [ ] **Step 4: `app/api/jobs/route.ts` — generalize the cleaner, parse the params.** Replace the `parseSkills` function (keep `MAX_SKILLS`/`MAX_SKILL_LEN`) with:

```ts
const MAX_PREF_LOC = 5;
const MAX_PREF_ROLE = 6;
const MAX_PREF_LEN = 60;

/** Clean a repeated keyword param: trim, truncate, dedupe (CI), cap. */
function cleanKeywordList(
  values: string[],
  maxLen: number,
  maxCount: number,
): string[] | undefined {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const s = raw.trim().slice(0, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === maxCount) break;
  }
  return out.length ? out : undefined;
}
```

In the `filters` object literal, replace the `skills:` line and add the three pref lines:

```ts
    skills: cleanKeywordList(searchParams.getAll("skill"), MAX_SKILL_LEN, MAX_SKILLS),
    prefLocations: cleanKeywordList(searchParams.getAll("prefLoc"), MAX_PREF_LEN, MAX_PREF_LOC),
    prefRoles: cleanKeywordList(searchParams.getAll("prefRole"), MAX_PREF_LEN, MAX_PREF_ROLE),
    prefTech: cleanKeywordList(searchParams.getAll("prefTech"), MAX_SKILL_LEN, MAX_SKILLS),
```

Update the route's JSDoc header to list `prefLoc/prefRole/prefTech` (repeatable).

- [ ] **Step 5: verify + commit.**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add types/jobListing.ts lib/db/jobsRepository.ts app/api/jobs/route.ts
git commit -m "feat: preference-baseline filter params in jobs query + API"
```

---

### Task 2: Derivation helper + store wiring

**Files:**
- Create: `lib/swipe/prefFilters.ts`
- Modify: `lib/swipe/swipeStore.tsx`

**Interfaces:**
- Consumes: Task 1 param names; `ResumeProfile` from `@/lib/careerOps/types`; existing `buildJobsUrl`/`fetchJobs`/`loadFilteredJobs`/`clearJobFilters`/`reset`/persistence-effect/`filterReqRef` machinery.
- Produces (Task 3 relies on these exact names): store fields `usePreferenceFilters: boolean`, `prefFilterSummary: string | null` (summary of PROFILE prefs, independent of the toggle; null when the profile has none), action `setUsePreferenceFilters(on: boolean): void`; helper exports `derivePrefFilterParams`, `hasPrefFilters`, `prefFilterSummaryText`, `PrefFilterParams`.

- [ ] **Step 1: create `lib/swipe/prefFilters.ts`.**

```ts
/**
 * Preference-baseline filters — pure derivation from the profile.
 * Client-safe; mirrors the server's cleaning rules (the route re-enforces
 * them). See docs/superpowers/specs/2026-09-04-preference-default-filters-design.md.
 */

import type { ResumeProfile } from "@/lib/careerOps/types";

export interface PrefFilterParams {
  prefLoc: string[];
  prefRole: string[];
  prefTech: string[];
}

const MAX_LOC = 5;
const MAX_ROLE = 6;
const MAX_TECH = 3;
const MAX_LOC_ROLE_LEN = 60;
const MAX_TECH_LEN = 40;

function cleanList(
  values: string[],
  maxLen: number,
  maxCount: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const s = raw.trim().slice(0, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === maxCount) break;
  }
  return out;
}

/** Map profile preferences to feed query params (empty lists when unset). */
export function derivePrefFilterParams(
  profile: ResumeProfile,
): PrefFilterParams {
  return {
    prefLoc: cleanList(profile.locationPreferences ?? [], MAX_LOC_ROLE_LEN, MAX_LOC),
    prefRole: cleanList(
      [...(profile.rolePreferences ?? []), ...(profile.targetRoles ?? [])],
      MAX_LOC_ROLE_LEN,
      MAX_ROLE,
    ),
    prefTech: cleanList(profile.techStack ?? [], MAX_TECH_LEN, MAX_TECH),
  };
}

/** True when at least one preference category has tags. */
export function hasPrefFilters(p: PrefFilterParams): boolean {
  return p.prefLoc.length > 0 || p.prefRole.length > 0 || p.prefTech.length > 0;
}

/** Compact caption ("2 locations · 4 roles · 3 tech"); null when empty. */
export function prefFilterSummaryText(p: PrefFilterParams): string | null {
  const parts: string[] = [];
  if (p.prefLoc.length)
    parts.push(`${p.prefLoc.length} location${p.prefLoc.length === 1 ? "" : "s"}`);
  if (p.prefRole.length)
    parts.push(`${p.prefRole.length} role${p.prefRole.length === 1 ? "" : "s"}`);
  if (p.prefTech.length) parts.push(`${p.prefTech.length} tech`);
  return parts.length ? parts.join(" · ") : null;
}
```

- [ ] **Step 2: `lib/swipe/swipeStore.tsx` — URL/fetch plumbing.**

Add imports:

```ts
import {
  derivePrefFilterParams,
  hasPrefFilters,
  prefFilterSummaryText,
  type PrefFilterParams,
} from "@/lib/swipe/prefFilters";
```

Change `buildJobsUrl` to accept prefs and append them:

```ts
function buildJobsUrl(
  filters: JobFilterState,
  prefs?: PrefFilterParams,
  limit = 100,
): string {
```

and before the `return` add:

```ts
  for (const v of prefs?.prefLoc ?? []) p.append("prefLoc", v);
  for (const v of prefs?.prefRole ?? []) p.append("prefRole", v);
  for (const v of prefs?.prefTech ?? []) p.append("prefTech", v);
```

Change `fetchJobs` to `async function fetchJobs(filters: JobFilterState = {}, prefs?: PrefFilterParams)` and pass `prefs` to `buildJobsUrl(filters, prefs)`.

- [ ] **Step 3: toggle state + persistence.**

In `Persisted`, add `prefFilters?: boolean;`. In the provider, next to the other state:

```ts
  // Preference-baseline toggle — default ON; absent in storage means true.
  const [usePreferenceFilters, setUsePreferenceFiltersState] = useState(true);
```

In the hydration effect's localStorage `try` block (same place `statuses`/`storedNotes`/`persistedProfile` are read), add a local `let prefFiltersOn = true;` before the try, and inside: `if (parsed.prefFilters === false) prefFiltersOn = false;`. After the profile seeding line add `setUsePreferenceFiltersState(prefFiltersOn);`. In `load()`, compute the prefs from the SAME locals the effect already has (not from state, which isn't visible yet):

```ts
      const seededProfile = sessionEmail ? { ...base, email: sessionEmail } : base;
      const derived = derivePrefFilterParams(seededProfile);
      const prefs = prefFiltersOn && hasPrefFilters(derived) ? derived : undefined;
```

(Reuse the existing `base` variable; replace the current inline `setProfile(...)` argument with `seededProfile` so it's computed once.) Pass `prefs` to BOTH `fetchJobs()` calls in `load()` (logged-in `Promise.all` branch and guest branch): `fetchJobs({}, prefs)`.

In the persistence effect, add `prefFilters: usePreferenceFilters` to the payload object in BOTH branches (logged-in preserved-write and guest write), and add `usePreferenceFilters` to that effect's dependency array.

- [ ] **Step 4: thread prefs through the deck-replacing fetches.**

Add a helper above `loadFilteredJobs`:

```ts
  /** Current pref params when the baseline is on and the profile has any. */
  const activePrefs = useCallback(
    (on: boolean): PrefFilterParams | undefined => {
      const derived = derivePrefFilterParams(profile);
      return on && hasPrefFilters(derived) ? derived : undefined;
    },
    [profile],
  );
```

In `loadFilteredJobs`, change the fetch line to `const res = await fetchJobs(active, activePrefs(usePreferenceFilters));` and add `activePrefs, usePreferenceFilters` to its dependency array. Same change in `clearJobFilters` (`fetchJobs({}, activePrefs(usePreferenceFilters))`) and in BOTH `reset` branches' `fetchJobs()` calls. Update those dependency arrays likewise.

- [ ] **Step 5: the toggle action + summary.**

Below `clearJobFilters`, add:

```ts
  // Flip the preference baseline and refetch the deck immediately. The new
  // value is passed explicitly — state set on the previous line isn't
  // visible to activePrefs yet.
  const setUsePreferenceFilters = useCallback(
    (on: boolean) => {
      setUsePreferenceFiltersState(on);
      const reqId = ++filterReqRef.current;
      setFiltering(true);
      fetchJobs(jobFilters, activePrefs(on))
        .then((res) => {
          if (reqId !== filterReqRef.current) return;
          replaceDeck(res.jobs);
          setError(res.error);
        })
        .finally(() => {
          if (reqId === filterReqRef.current) setFiltering(false);
        });
    },
    [jobFilters, activePrefs, replaceDeck],
  );
```

Add the derived summary (near the other `useMemo`s):

```ts
  // Summary of the PROFILE's preference tags (independent of the toggle) —
  // null when the profile has none. UI shows toggle + captions from this.
  const prefFilterSummary = useMemo(
    () => prefFilterSummaryText(derivePrefFilterParams(profile)),
    [profile],
  );
```

Extend the `SwipeStore` interface (after the `filtering` field):

```ts
  /** Preference-baseline toggle (default true; persisted). */
  usePreferenceFilters: boolean;
  /** Caption of the profile's pref tags ("2 locations · 3 tech"); null when none. */
  prefFilterSummary: string | null;
  /** Flip the preference baseline and refetch the deck. */
  setUsePreferenceFilters: (on: boolean) => void;
```

and add all three to the provider `value` object.

- [ ] **Step 6: verify + commit.**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (nothing consumes the new fields yet — that's Task 3).

```bash
git add lib/swipe/prefFilters.ts lib/swipe/swipeStore.tsx
git commit -m "feat: preference-baseline toggle and param threading in swipe store"
```

---

### Task 3: UI — panel toggle row, header chip, empty state, README

**Files:**
- Modify: `components/swipe/JobFilterButton.tsx`
- Modify: `app/(app)/swipe/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 2's `usePreferenceFilters` / `prefFilterSummary` / `setUsePreferenceFilters`; existing `Checkbox` (`checked`, `onCheckedChange`), `Badge`, `EmptyState` (`icon`, `title`, `description`, `action`).
- Produces: the three UI surfaces per the Global Constraints copy.

- [ ] **Step 1: `JobFilterButton.tsx` — toggle row + header chip.**

Extend the store destructure:

```ts
  const {
    jobFilters,
    activeFilterCount,
    loadFilteredJobs,
    clearJobFilters,
    filtering,
    usePreferenceFilters,
    prefFilterSummary,
    setUsePreferenceFilters,
  } = useSwipeStore();
```

Add the import: `import { Checkbox } from "@/components/ui/checkbox";`

At the TOP of the panel body's `<div className="space-y-5">`, add the toggle row:

```tsx
          {/* Preference baseline */}
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="f-prefs">Use my preferences</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {prefFilterSummary
                    ? `${prefFilterSummary} — set on your profile`
                    : "Add preferences on your profile to filter by default"}
                </p>
              </div>
              {prefFilterSummary && (
                <Checkbox
                  id="f-prefs"
                  checked={usePreferenceFilters}
                  onCheckedChange={setUsePreferenceFilters}
                  disabled={filtering}
                />
              )}
            </div>
          </div>
```

Next to the Filters button (inside the fragment, before the `<Dialog>`), render the header chip — a tap opens the panel:

```tsx
      {usePreferenceFilters && prefFilterSummary && (
        <button
          type="button"
          onClick={openPanel}
          className="rounded-full border border-primary/40 bg-primary-soft px-2.5 py-1 text-xs font-medium text-accent"
        >
          Preferences on
        </button>
      )}
```

(Place it BEFORE the Filters `<Button>` so the header reads chip → Filters → Reset.)

- [ ] **Step 2: `app/(app)/swipe/page.tsx` — preference-aware empty state.**

Extend the store destructure with `usePreferenceFilters` and `setUsePreferenceFilters` and `prefFilterSummary`. Replace the `jobs.length === 0` branch's `<EmptyState .../>` with:

```tsx
            {usePreferenceFilters && prefFilterSummary ? (
              <EmptyState
                icon={Inbox}
                title="No jobs match your preferences"
                description="Your profile preferences are filtering the feed. Show everything, or adjust them."
                action={
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button onClick={() => setUsePreferenceFilters(false)}>
                      Show all jobs
                    </Button>
                    <Link href="/profile">
                      <Button variant="secondary" className="w-full">
                        Edit preferences
                      </Button>
                    </Link>
                  </div>
                }
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title={
                  activeFilterCount > 0
                    ? "You've reviewed all jobs matching these filters"
                    : "You're all caught up"
                }
                description={
                  activeFilterCount > 0
                    ? "Try clearing filters or check back later for new jobs."
                    : "Check back later for new jobs."
                }
              />
            )}
```

(This implements the spec's precedence: the preference-aware state wins whenever the baseline was active, even with manual filters also set.)

- [ ] **Step 3: `README.md` — one line.** In the Features section's Swipe feed bullet, extend the filters parenthetical: `(type, city, recency, skill keywords, plus an always-on preference baseline from the profile)`.

- [ ] **Step 4: verify + commit.**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add components/swipe/JobFilterButton.tsx "app/(app)/swipe/page.tsx" README.md
git commit -m "feat: preference-baseline toggle row, header chip, and empty state"
```

---

### Task 4: Build + curl verification

**Files:** none (verification only)

- [ ] **Step 1: build.** Run `npm run build` — clean.

- [ ] **Step 2: curl suite.** Start `npm run dev` in the background, wait for 200 on `/`, then (all against `http://localhost:3000`, using node to check invariants like the skill-filter suite; whole-word regex `/(^|[^a-z0-9+#.])WORD([^a-z0-9+#.]|$)/i`):

1. `prefTech=python&limit=50` → every job's title+description whole-word-matches python (same invariant as `skill=python`).
2. `prefRole=engineer&limit=50` → every job's TITLE whole-word-matches engineer; then assert at least one job in an unfiltered fetch has engineer in description only (proving title-only matters).
3. `prefLoc=Austin&limit=50` → every job's `city+state+location` contains "Austin" (case-insensitive substring).
4. `prefLoc=Remote%20(US)&limit=50` → HTTP 200; jobs with `isRemote: true` may appear even without the literal text (spot-check at least one).
5. AND across: `prefLoc=Austin&prefTech=python&limit=200` count ≤ each single-param count; OR within: `prefTech=python&prefTech=react` count ≥ `prefTech=python` count (same seed caveat: counts vary with the random default sort — use `sort=newest` on ALL comparison queries to make result sets deterministic).
6. Separation: `skill=python&prefTech=react&limit=50` → every job whole-word-matches BOTH python and react.
7. Caps: 7 `prefTech` params → HTTP 200 (capped to 3); `prefLoc` with `%` and `_` characters → HTTP 200, no SQL error.

Kill the dev server after.

- [ ] **Step 3: UI pass (hand off to the human).** Toggle row shows summary caption; unchecking refetches (spinner) and the chip disappears; empty-state path: set an impossible location pref → feed empties → "No jobs match your preferences" → Show all jobs recovers; guest window behaves identically; profile edits apply on next fetch.

- [ ] **Step 4: commit any fixes** surfaced by verification, message: `fix: <what verification surfaced>`.
