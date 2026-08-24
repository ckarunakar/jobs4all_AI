# Skill Keyword Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Skills" chip row in the job filter panel — up to 5 keywords, whole-word-matched (ANY-match) against job title + description in SQL, composing with all existing filters.

**Architecture:** One new parameterized OR-group in the existing WHERE-clause builder (`fetchJobListings`); repeated `?skill=` query params on `GET /api/jobs`; `skills?: string[]` threaded through `JobFilters` → `JobFilterState` → `buildJobsUrl`; the filter panel reuses the existing `TagInput` chip component with a cleaning wrapper. No schema, auth, or scoring changes.

**Tech Stack:** Next.js 16.2.9 App Router, TypeScript, `mssql` parameterized queries, existing UI components.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-23-skill-keyword-filter-design.md`. Read it first.
- Query param name is `skill` (repeated): `?skill=python&skill=react`.
- Caps everywhere (client mirror + server defense): trim → truncate to **40** chars → drop empties → dedupe case-insensitively → keep first **3**.
- Word-boundary class is exactly `[^a-z0-9+#.]`; haystack is exactly `(' ' + Title + ' ' + ISNULL(description, '') + ' ')`; LIKE escape char is `\` with escape order `\` → `%` → `_` → `[`.
- Skills count as ONE active filter in the badge count, regardless of chip count.
- Exact UI copy — label: `Skills`; placeholder: `e.g. python, react, c++…`; helper text: `Matches whole words in the job title and description — e.g. python, react, c++`.
- All SQL values are bound parameters; the pattern (including boundary classes) is built in Node and bound whole — never concatenated into SQL text.
- No test framework — every task verifies with `npx tsc --noEmit && npm run lint`; Task 3 adds `npm run build` + a curl suite. Commit after every task with the message given.
- Follow existing conventions: `"use client"` where hooks are used, `@/` imports, JSDoc comments matching each file's density, existing Tailwind idioms.

---

### Task 1: Server — types, repository clause, route parsing

**Files:**
- Modify: `types/jobListing.ts`
- Modify: `lib/db/jobsRepository.ts`
- Modify: `app/api/jobs/route.ts`

**Interfaces:**
- Consumes: existing `JobFilters`, `fetchJobListings` WHERE-builder pattern (`request.input` + `where.push`), route's `clean`/parse helpers.
- Produces: `JobFilters.skills?: string[]` (cleaned, max 5×40); `GET /api/jobs?skill=a&skill=b` filters results. Task 2 relies on the param name `skill` and the cleaning rules.

- [ ] **Step 1: `types/jobListing.ts` — add the filter field.** In the `JobFilters` interface, after the `jobType?: string;` line add:

```ts
  /** Whole-word skill keywords (max 5) — matches if ANY appears in title/description. */
  skills?: string[];
```

- [ ] **Step 2: `lib/db/jobsRepository.ts` — pattern helpers.** Below the `str()` helper near the top of the file, add:

```ts
/** Escape LIKE metacharacters in user text (used with ESCAPE '\').
 *  Order matters: the escape char itself must be escaped first. */
function escapeLike(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[");
}

/** Anything NOT part of a skill token ("java" ≠ "javascript"/"java8";
 *  "c++", "c#", ".net", "node.js" match whole). */
const SKILL_BOUNDARY = "[^a-z0-9+#.]";

/** Whole-word LIKE pattern for one skill, built in Node and bound whole. */
function skillPattern(skill: string): string {
  return `%${SKILL_BOUNDARY}${escapeLike(skill)}${SKILL_BOUNDARY}%`;
}
```

- [ ] **Step 3: `lib/db/jobsRepository.ts` — the OR-group clause.** In `fetchJobListings`, directly after the `if (filters.jobType) { ... }` block and before the recency block, add:

```ts
  // Skill keywords: whole-word match against title + description (ANY-match).
  // The full pattern (boundary classes included) is built in Node and bound
  // as one parameter; the haystack is space-padded so boundaries work at the
  // start/end of the text.
  const skills = (filters.skills ?? []).filter(Boolean);
  if (skills.length > 0) {
    const clauses = skills.map((s, i) => {
      request.input(`skill${i}`, sql.NVarChar, skillPattern(s));
      return `(' ' + Title + ' ' + ISNULL(description, '') + ' ') LIKE @skill${i} ESCAPE '\\'`;
    });
    where.push(`(${clauses.join(" OR ")})`);
  }
```

- [ ] **Step 4: `app/api/jobs/route.ts` — parse the repeated param.** Below the `clean()` helper add:

```ts
const MAX_SKILLS = 5;
const MAX_SKILL_LEN = 40;

/** Clean repeated ?skill= params: trim, truncate to 40, dedupe (CI), cap 5. */
function parseSkills(values: string[]): string[] | undefined {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const s = raw.trim().slice(0, MAX_SKILL_LEN);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === MAX_SKILLS) break;
  }
  return out.length ? out : undefined;
}
```

In the `filters` object literal inside `GET`, after the `jobType:` line add:

```ts
    skills: parseSkills(searchParams.getAll("skill")),
```

Also update the route's JSDoc header line listing query params to include `skill` (repeatable).

- [ ] **Step 5: verify + commit.**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add types/jobListing.ts lib/db/jobsRepository.ts app/api/jobs/route.ts
git commit -m "feat: whole-word skill keyword filter in jobs query + API"
```

---

### Task 2: Client — store plumbing, filter-panel chips, README

**Files:**
- Modify: `lib/swipe/swipeStore.tsx`
- Modify: `components/swipe/JobFilterButton.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1's `skill` param contract; existing `TagInput` (`values`, `onChange`, `placeholder` props — no cap of its own); `draft: JobFilterState` panel state.
- Produces: `JobFilterState.skills?: string[]`; skills chips in the panel; badge counts skills as one filter.

- [ ] **Step 1: `lib/swipe/swipeStore.tsx` — three small edits.**

In `JobFilterState`, after `city?: string;` add:

```ts
  skills?: string[];
```

In `countActiveFilters`, after the `if (f.city) n++;` line add:

```ts
  if (f.skills && f.skills.length > 0) n++;
```

In `buildJobsUrl`, after the `if (filters.city) ...` line add:

```ts
  for (const s of filters.skills ?? []) p.append("skill", s);
```

- [ ] **Step 2: `components/swipe/JobFilterButton.tsx` — chips section.**

Add the import: `import { TagInput } from "@/components/profile/TagInput";`

Below the `RECENCY_OPTIONS` const add:

```ts
// Client mirror of the server's skill rules (route re-enforces them).
const MAX_SKILLS = 5;
const MAX_SKILL_LEN = 40;
```

Inside the component, next to the other handlers (e.g. after `clearCity`), add:

```tsx
  // Clean chips like the server will: trim, truncate, CI-dedupe, cap at 5.
  const setSkills = (next: string[]) => {
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of next) {
      const s = raw.trim().slice(0, MAX_SKILL_LEN);
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(s);
      if (cleaned.length === MAX_SKILLS) break;
    }
    setDraft((d) => ({ ...d, skills: cleaned.length ? cleaned : undefined }));
  };
```

In the JSX, between the Job type section and the City autocomplete section, add:

```tsx
          {/* Skills */}
          <div className="space-y-2">
            <Label>Skills</Label>
            <TagInput
              values={draft.skills ?? []}
              onChange={setSkills}
              placeholder="e.g. python, react, c++…"
            />
            <p className="text-xs text-muted-foreground">
              Matches whole words in the job title and description — e.g.
              python, react, c++
            </p>
          </div>
```

(No changes to `applyFilters`/`clearAll` — `draft.skills` flows through both already; `clearAll` resets the whole draft.)

- [ ] **Step 3: `README.md` — one line.** In the Features section's Swipe feed bullet, change `with filters (type, city, recency)` to `with filters (type, city, recency, skill keywords)`.

- [ ] **Step 4: verify + commit.**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add lib/swipe/swipeStore.tsx components/swipe/JobFilterButton.tsx README.md
git commit -m "feat: skills chip filter in the job filter panel"
```

---

### Task 3: Build + curl verification

**Files:** none (verification only)

- [ ] **Step 1: build.** Run `npm run build` — clean.

- [ ] **Step 2: curl suite.** Start `npm run dev`, wait for it, then (all against `http://localhost:3000`):

```bash
# 1. Whole-word positive/negative: every job in the result must contain
#    whole-word "python" in title or description (spot-check with node).
curl -s 'http://localhost:3000/api/jobs?skill=python&limit=50' > /tmp/skill-python.json
node -e '
const d=require("/tmp/skill-python.json");
const re=/(^|[^a-z0-9+#.])python([^a-z0-9+#.]|$)/i;
const bad=d.jobs.filter(j=>!re.test(" "+j.title+" "+(j.description||"")+" "));
console.log("count:",d.count,"| non-matching leaked:",bad.length);
'
# Expected: non-matching leaked: 0

# 2. java must not match javascript-only jobs.
curl -s 'http://localhost:3000/api/jobs?skill=java&limit=50' > /tmp/skill-java.json
node -e '
const d=require("/tmp/skill-java.json");
const word=/(^|[^a-z0-9+#.])java([^a-z0-9+#.]|$)/i;
const bad=d.jobs.filter(j=>!word.test(" "+j.title+" "+(j.description||"")+" "));
console.log("count:",d.count,"| javascript-only leaked:",bad.length);
'
# Expected: javascript-only leaked: 0

# 3. Union + composition sanity.
curl -s 'http://localhost:3000/api/jobs?skill=python&skill=react&limit=200' | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log("union count:",JSON.parse(s).count))'
curl -s 'http://localhost:3000/api/jobs?skill=python&jobType=Full-time&limit=200' | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log("composed count:",JSON.parse(s).count))'
# Expected: union ≥ each single-skill count; composed ≤ python-only count.

# 4. Caps: 7 skills sent, at most 3 applied (no error).
curl -s -o /dev/null -w "HTTP %{http_code}\n" 'http://localhost:3000/api/jobs?skill=a1&skill=a2&skill=a3&skill=a4&skill=a5&skill=a6&skill=a7&limit=5'
# Expected: HTTP 200

# 5. LIKE metacharacters are inert (no SQL error, plausibly zero results).
curl -s -o /dev/null -w "HTTP %{http_code}\n" 'http://localhost:3000/api/jobs?skill=%25%5Bx_%5D&limit=5'
# Expected: HTTP 200
```

- [ ] **Step 3: UI pass (browser or hand off to user).** Open /swipe → Filters: add chips (Enter and + both work), 4th chip is ignored, duplicate "Python"/"python" collapses to one, badge shows skills as one filter, Apply toasts a count, Clear filters empties chips, and a guest window can use the filter.

- [ ] **Step 4: commit any fixes** surfaced by verification, message: `fix: <what verification surfaced>`.
