# Skill Keyword Filter — Design

**Date:** 2026-08-23
**Goal:** A "Skills" row in the job filter panel: the user types skill keywords
(languages, libraries, frameworks — e.g. `python`, `react`, `c++`) as chips, and
the feed narrows to jobs whose title or description mentions at least one of
them as a whole word. The filter runs in SQL against the whole jobs table and
composes with every existing filter (job type, city, recency, sort).

## Decisions (approved)

- **Multiple skills, ANY-match:** up to 3 skill chips; a job matches if its
  text contains at least one of them. The skill clauses OR together inside one
  group, which ANDs with all other active filters.
- **Whole-word LIKE matching** (not plain substring, not SQL Full-Text):
  `java` matches Java jobs but not JavaScript jobs; `go` doesn't match "good".
  Implemented with SQL Server LIKE character classes — no new server features,
  no index changes on the scraper-owned table.
- **Title counts as matchable text** alongside the description: a
  "Python Developer" posting with a terse description still matches.
- Available to guests and logged-in users alike, like all existing filters.

## Section 1 — SQL (`lib/db/jobsRepository.ts`)

`JobFilters` (in `types/jobListing.ts`) gains `skills?: string[]`. In
`fetchJobListings`, when `filters.skills` is non-empty (after cleaning), add
one parenthesized OR-group to the WHERE clauses:

- For each skill `i`, Node builds the full pattern and binds it as one
  parameter `@skill{i}` (`sql.NVarChar`):
  `%[^a-z0-9+#.]<escaped skill>[^a-z0-9+#.]%`
- The skill text is LIKE-escaped first with escape char `\`
  (order matters: `\` → `\\`, then `%` → `\%`, `_` → `\_`, `[` → `\[`).
- Each clause matches against the space-padded haystack so boundary classes
  work at the start/end of text:
  `(' ' + Title + ' ' + ISNULL(description, '') + ' ') LIKE @skill{i} ESCAPE '\'`
- Clauses join as `(clause0 OR clause1 OR ...)` and the group ANDs with the
  existing WHERE list. No other query changes (sort, seen-exclusion, TOP
  untouched).

Semantics notes (accepted, documented here deliberately):

- **Word characters are `a-z 0-9 + # .`** — so `c++`, `c#`, `.net`, `node.js`
  match correctly, `java` does not match `javascript` or `java8`, and matching
  is case-insensitive under the server's default collation (same behavior the
  existing Title/company search relies on).
- **Full scan, like every existing filter.** The default sort already scans
  the table (`NEWID()` round-robin); acceptable at current volume. Full-Text
  indexing was considered and rejected (ops change on the client-managed SQL
  Server for a scraper-owned table). Verified live 2026-08-24: each skill
  clause adds seconds of scan time; the cap is 3 (a 5-skill query exceeded
  the previous 20s request timeout), and the pool requestTimeout is raised
  to 60s as a safety net.

## Section 2 — API (`app/api/jobs/route.ts`)

Repeated query params: `GET /api/jobs?skill=python&skill=react`. The route
reads `searchParams.getAll("skill")` and cleans server-side (defense in depth,
mirroring the client rules): trim each, drop empties, truncate each to 40 chars,
dedupe case-insensitively, keep the first 3. The cleaned array goes into
`filters.skills`. No auth change — the route already serves guests.

## Section 3 — Store (`lib/swipe/swipeStore.tsx`)

- `JobFilterState` gains `skills?: string[]`.
- `buildJobsUrl` appends `p.append("skill", s)` for each skill.
- `countActiveFilters` counts a non-empty skills list as **one** active filter
  (it is one panel row; the badge shows filter rows in use, not chip count).
- Nothing else changes: apply/clear, deck replacement (`replaceDeck` keeping
  tracked jobs), session score re-attachment, and scoring drawing candidates
  from the current filtered deck all already handle a replaced deck.

## Section 4 — UI (`components/swipe/JobFilterButton.tsx`)

A new "Skills" section in the filter panel (between Job type and City),
reusing the existing `TagInput` chip component (`components/profile/TagInput.tsx`)
unchanged:

- `TagInput` itself has no cap and dedupes exact-case only, so the panel's
  `onChange` wrapper enforces the rules: trim, truncate to 40 chars per
  skill, case-insensitive dedupe, ignore additions beyond 3 chips.
- Draft state lives in the existing `draft: JobFilterState` (chips seed from
  the applied filters when the panel opens, same as every other field).
- Helper text under the input:
  `Matches whole words in the job title and description — e.g. python, react, c++`.
- Apply/Cancel/Clear filters flow through the existing handlers with zero new
  plumbing; the existing result toast ("Showing N matching jobs" / "No jobs
  matched those filters") covers feedback, and the existing filtered
  empty-state covers zero-match decks.

## Section 5 — Error handling & edge cases

- Zero matches → existing empty-state + toast; Clear filters recovers.
- A skill of only punctuation (e.g. `++`) is allowed through — it matches
  wherever it appears between word boundaries; harmless and parameterized.
- Oversized input can't reach SQL: client caps chips, server re-caps.
- All values are bound parameters; the boundary classes live in the bound
  pattern string, never concatenated SQL. Injection surface unchanged.

## Section 6 — Verification (no test framework; build + curl + UI pass)

1. `npm run build` + `npm run lint` clean.
2. `curl '/api/jobs?skill=python&limit=50'` — every returned job's
   title+description contains whole-word `python` (spot-check); a
   `skill=java` result set contains no JavaScript-only jobs; `skill=go`
   returns no jobs that only contain "good".
3. Union: `skill=python&skill=react` ⊇ each individual result set (same other
   filters); composition: adding `city=`/`jobType=` narrows it.
4. UI: chips add/remove/Enter; 4th chip ignored; badge counts skills as one
   filter; Clear filters empties chips; guest (logged-out) filtering works.

## Out of scope

- SQL Full-Text Search / any index or schema change.
- Skill autocomplete/suggestions, including seeding chips from the profile's
  tech-stack tags (future nicety).
- Any change to scoring, seen-history, or the tracked pipeline.
- Synonym/alias matching (e.g. `js` ≠ `javascript`).
