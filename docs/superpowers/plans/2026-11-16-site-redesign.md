# Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole site to the client mockup's gradient look, add the new logo, and add the AI Tools, How It Works and FAQ pages behind a shared marketing header.

**Architecture:** Theme tokens in `app/globals.css` and the shared `components/ui/*` pieces change first, so every screen moves together. Public pages move into an `app/(marketing)` route group with one header, banner and footer. App screens keep their layouts; a per-screen pass removes the leftover flat styling. Logic stays the same, except for one refactor: `scoreUtils` exports a score-band table so the pages can't drift from the scoring thresholds.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19, Tailwind v4 (`@theme`, `@utility`), `class-variance-authority`, `lucide-react`, `next/image`. Tests use `node --test` (Node 22.18+ strips TypeScript types without flags).

**Spec:** `docs/superpowers/specs/2026-11-16-site-redesign-design.md`. Visual reference (local, git-ignored): `.superpowers/redesign-demo/*.dc.html` and `client-mockup.png`. Take geometry from the demos. Take all copy from the spec; it wins wherever the two differ.

## Global Constraints

- Before touching routing, images, links or metadata, read the bundled Next docs:
  - `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`: use `preload`, never `priority`.
  - `.../03-file-conventions/route-groups.md`
  - `.../02-components/link.md`
  - `.../04-functions/use-pathname.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md`
- No new dependencies. `package.json` and `package-lock.json` stay unchanged.
- **Do not edit:**
  - `components/legal/PrivacyPolicy.tsx`
  - `components/settings/DeleteAccountCard.tsx`
  - `app/api/profile/route.ts`
  - `lib/swipe/swipeStore.tsx`
  - `package.json`
  - `eslint.config.mjs`
  - `.gitignore`
  - `components/swipe/DraggableCard.tsx`
  - `components/swipe/SwipeDeck.tsx`

  `tsconfig.json` gets exactly one line, in Task 1. It is identical to the line `feat/server-side-profile` adds, so the later merge stays clean.
- Copy is verbatim from the spec. New copy writes "ITJobCafé". Use typographic characters literally (’ “ ” – é ✦). Don't use `&apos;` in new copy.
- Components use tokens, not hex literals. Allowed exceptions:
  - company brand colors (job data)
  - the Google logo in `LoginForm`
  - illustration and band art under `components/marketing/**` and `app/(marketing)/**`
- Text meets WCAG AA: 4.5:1, or 3:1 for text at 24px+ or 18.66px+ bold. `lib/design/contrast.test.ts` enforces this for the tokens.
- Every hover or press movement is prefixed with `motion-safe:`. Never use `hover:scale-*` or `active:scale-*`.
- Every interactive element shows `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
- In new code, a link styled as a button is `<Link className={buttonVariants({...})}>`. Never nest `<Link><Button/></Link>`.
- Don't `setState` inside `useEffect` (eslint `react-hooks` flags it). Close menus from event handlers instead.
- **Checks** (run at the end of every task):
  1. `node --test "lib/**/*.test.ts"`
  2. `npx tsc --noEmit`
  3. `npm run lint`

  All three must be clean. Run `npm run build` too wherever a task says so.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The repo is public: no commit, comment or doc text may discuss unpatched security issues.
- Never stage `scripts/store-sync-harness/`, `.superpowers/` or `itjclogo.png` at the repo root. The logo is committed only under `public/brand/`.
- Run the browser checks against `npm run dev` (http://localhost:3000). Signed-in checks need an account in the database that `.env.local` points to. **Ask the user for a test login.** Don't create an account there without their OK.

## Review Focus

1. **Phones at 360–390px:** no page scrolls sideways, the landing illustration still reads, and the banner wraps cleanly. Pinned by the overflow checks in Tasks 5–9.
2. **Keyboard and screen reader on the new header and landing:**
   - Tab order runs logo → links → CTA, each with a visible ring.
   - The menu opens and closes by keyboard, and Escape returns focus to the menu button.
   - The floating "5.0" card is a reachable link outside the illustration's `role="img"`.

   Pinned in Tasks 5 and 6.
3. **Swiping must feel exactly as before.** Drag, stamps, fly-out and snap-back are unchanged, the new radius and shadow don't clip the stamps, and the drag files are untouched. Pinned in Task 11.
4. **Guest vs signed-in states:**
   - Header CTA text and target.
   - The three score states: guest blur, "Ask AI to score", and scored.
   - Guests sent from "Set Up Profile" to `/login`.

   Pinned in Tasks 5, 6 and 11.
5. **Long or odd real job data on the restyled card and dialogs:** long titles and company names, no compensation, no description. Nothing overflows sideways. Pinned in Task 11.

---

### Task 1: Score-band table in `scoreUtils`

**Files:**
- Modify: `lib/careerOps/scoreUtils.ts`. Add the table and the text-color helper, and make `getScoreTier` read from the table (lines 40–86 today).
- Modify: `tsconfig.json`. Add `"allowImportingTsExtensions": true,` on its own line directly after `"noEmit": true,`, with the same indentation.
- Test: `lib/careerOps/scoreUtils.test.ts` (new)

**Interfaces:**
- Produces:
  - `type ScoreBand = "excellent" | "strong" | "good" | "possible" | "weak" | "not-recommended"`
  - `interface ScoreBandRow { band: ScoreBand; min: number; label: string; shortLabel: string; tier: ScoreTier; token: ScoreTierMeta["token"]; description: string }`
  - `const SCORE_BANDS: readonly ScoreBandRow[]`, ordered high to low. The last row has `min: SCORE_MIN`.
  - `getScoreTextColorVar(score: CareerOpsScore): string`, which returns `"var(--<token>-text)"`.

  `getScoreTier` keeps its signature and returns exactly `{ tier, label, token, description }`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCORE_BANDS, SCORE_MIN, getScoreTier, getScoreTextColorVar, scoreFraction } from "./scoreUtils.ts";

test("SCORE_BANDS lists six bands high to low with the Career-Ops cutoffs", () => {
  assert.deepEqual(SCORE_BANDS.map((b) => [b.band, b.min, b.label, b.shortLabel, b.tier, b.token]), [
    ["excellent", 4.5, "Excellent fit", "Excellent", "excellent", "excellent"],
    ["strong", 4.0, "Strong fit", "Strong", "recommended", "recommended"],
    ["good", 3.5, "Good fit", "Good", "review", "caution"],
    ["possible", 3.0, "Possible fit", "Possible", "review", "caution"],
    ["weak", 2.5, "Weak fit", "Weak", "low", "low"],
    ["not-recommended", SCORE_MIN, "Not recommended", "Not recommended", "low", "low"],
  ]);
});

test("getScoreTier agrees with SCORE_BANDS at and just below every cutoff", () => {
  SCORE_BANDS.forEach((b, i) => {
    assert.equal(getScoreTier(b.min).label, b.label);
    if (i < SCORE_BANDS.length - 1) assert.equal(getScoreTier(b.min - 0.01).label, SCORE_BANDS[i + 1].label);
  });
});

test("getScoreTier keeps its old shape and answers", () => {
  assert.deepEqual(getScoreTier(4.2), {
    tier: "recommended", label: "Strong fit", token: "recommended",
    description: "Matches most important requirements — worth applying.",
  });
  assert.equal(getScoreTier(0).label, "Not recommended");
  assert.equal(getScoreTier(Number.NaN).label, "Not recommended");
  assert.equal(getScoreTier(9).label, "Excellent fit");
});

test("landing rings fill 100%, 75% and 25% for 5.0, 4.0 and 2.0", () => {
  assert.equal(scoreFraction(5.0), 1);
  assert.equal(scoreFraction(4.0), 0.75);
  assert.equal(scoreFraction(2.0), 0.25);
});

test("score text uses the dark shade of the tier color", () => {
  assert.equal(getScoreTextColorVar(4.7), "var(--excellent-text)");
  assert.equal(getScoreTextColorVar(4.0), "var(--recommended-text)");
  assert.equal(getScoreTextColorVar(3.1), "var(--caution-text)");
  assert.equal(getScoreTextColorVar(1.5), "var(--low-text)");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test lib/careerOps/scoreUtils.test.ts`

Expected: FAIL. `SCORE_BANDS` and `getScoreTextColorVar` aren't exported yet.

- [ ] **Step 3: Implement the change**
  1. Add `SCORE_BANDS`, taking the six descriptions verbatim from today's `getScoreTier` branches.
  2. Rewrite `getScoreTier` as: the first row with `score >= row.min`, else the last row. Map the row to `{ tier, label, token, description }`.
  3. Add `getScoreTextColorVar`.
  4. Add the `tsconfig.json` line.

- [ ] **Step 4: Run the Checks.** Expected: 5 tests pass; tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add lib/careerOps/scoreUtils.ts lib/careerOps/scoreUtils.test.ts tsconfig.json
git commit -m "feat: export score-band table and text-color helper from scoreUtils"
```

---

### Task 2: Theme tokens, style guide, contrast test

**Files:**
- Modify: `app/globals.css`. Replace `:root` and add to `@theme inline` (lines 10–79 today). Add a second `@theme` block for shadows and `@utility` blocks. Update the header comment and `.skeleton`. Leave `.bg-grid`/`.bg-soft` for Task 6.
- Modify: `types/design.md`. Rewrite it as the new style guide.
- Modify: `app/layout.tsx:6`. Change the comment's "flat" wording only.
- Test: `lib/design/contrast.test.ts` (new)

**Interfaces:**
- Produces these `:root` tokens (6-digit hex where shown; the test reads them by name):

| Group | Tokens |
|---|---|
| Surfaces | `--background #ffffff`, `--surface #f7f5fd`, `--card #ffffff`, `--card-hover #faf8ff`, `--elevated #f4f2fb` |
| Borders | `--border #ece7f7`, `--border-input #e6e1f5`, `--border-strong #c9bff0` |
| Text | `--foreground #141a3a`, `--muted #4b5268`, `--muted-foreground #636a82` |
| Brand | `--primary #2563eb`, `--primary-end #7c3aed`, `--primary-foreground #ffffff`, `--primary-soft #eef2ff`, `--primary-soft-foreground #3730a3`, `--accent #4c3fc4`, `--accent-strong #5b45d6`, `--eyebrow #6b46c1`, `--button-ink #2e2a6b`, `--secondary #10b981`, `--warning #f59e0b` |
| Gradient stops | `--banner-1 #3b8fd0` (tuned from `#4fb3e0` so white text passes 3:1), `--banner-2 #5a74e2`, `--banner-3 #8b5bd6`, `--banner-4 #d862a6`; `--headline-1 #3b82f6`, `--headline-2 #6d5ce8`, `--headline-3 #ae4fca`, `--headline-4 #e0569a`; `--wash-1 #f8f2fc`, `--wash-2 #f4f1fc`, `--wash-3 #edf3fd`; `--panel-1 #eef4ff`, `--panel-2 #f3efff` |
| Score fills (unchanged) | `--excellent #10b981`, `--recommended #22c55e`, `--caution #f59e0b`, `--low #6b7280`, `--info #3b82f6` |
| Score text | `--excellent-text #047857`, `--recommended-text #166534`, `--caution-text #a74b06`, `--low-text #4b5563`, `--info-text #1d4ed8` |
| Scale extras | `--scale-none #d1d5db`, `--scale-possible #fcd34d` |
| Danger | `--danger #c0392b` (was `#ef4444`; this makes existing danger text pass AA with no edits to `DeleteAccountCard`), `--danger-border #f3c7c7` |
| Other | `--ring #5b45d6`, `--radius 0.875rem` (so `rounded-lg` 14px, `rounded-md` 12px, `rounded-sm` 10px) |
| Gradients | `--gradient-brand` 90° primary → primary-end; `--gradient-banner` 90° stops at 0/32/66/100%; `--gradient-headline` 90° stops at 0/42/74/100%; `--gradient-wash` 115° stops at 0/45/100%; `--gradient-panel` 120° panel-1 → panel-2. Each one is built from the stop tokens with `var()`. |

- `@theme inline` adds a `--color-*` mapping for every new color token, so classes such as `text-caution-text`, `bg-elevated`, `border-border-input`, `text-accent-strong` and `text-button-ink` exist.
- `@theme` (not inline) defines these shadows:
  - `--shadow-card: 0 20px 40px -28px rgb(60 40 140 / .35)`
  - `--shadow-deep: 0 30px 60px -30px rgb(60 40 140 / .45)`
  - `--shadow-button: 0 14px 28px -10px rgb(99 102 241 / .6)`
  - `--shadow-button-hover: 0 18px 32px -10px rgb(99 102 241 / .7)`
  - `--shadow-button-press: 0 8px 16px -10px rgb(99 102 241 / .6)`
  - `--shadow-white: 0 8px 20px -12px rgb(60 40 120 / .35)`
  - `--shadow-up: 0 -8px 24px -16px rgb(60 40 140 / .25)`
- `@utility` adds:
  - `bg-brand`, `bg-banner`, `bg-wash` and `bg-panel`, each setting `background-image` to its gradient.
  - `text-gradient`, which sets `background-image: var(--gradient-headline)`, `-webkit-background-clip: text`, `background-clip: text` and `color: transparent`.
- `.skeleton` background becomes `var(--border)`.

- [ ] **Step 1: Write the failing test** `lib/design/contrast.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const start = css.indexOf(":root");
const root = css.slice(start, css.indexOf("}", start));
const token = (name: string): string => {
  const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  assert.ok(m, `--${name} must be a 6-digit hex in :root`);
  return m[1];
};
// ratio(a, b): WCAG 2.x contrast ratio of two hex colors.
// over(hex, alpha): hex composited over white at alpha, returned as hex.
// Implement both helpers in this file from the WCAG relative-luminance formula.

const TEXT = ["foreground", "muted", "muted-foreground", "accent", "accent-strong", "eyebrow", "button-ink",
  "danger", "excellent-text", "recommended-text", "caution-text", "low-text", "info-text", "primary-soft-foreground"];
const SURFACES = ["background", "surface", "elevated", "wash-1", "wash-2", "wash-3", "panel-1", "panel-2", "primary-soft"];

test("text tokens pass AA on every light surface", () => {
  for (const t of TEXT) for (const s of SURFACES)
    assert.ok(ratio(token(t), token(s)) >= 4.5, `${t} on ${s}`);
});
test("white text passes AA on gradient buttons, danger and success toasts", () => {
  for (const b of ["primary", "primary-end", "danger", "recommended-text"])
    assert.ok(ratio("#ffffff", token(b)) >= 4.5, `white on ${b}`);
});
test("badge text passes AA on its own 12% tint", () => {
  for (const k of ["excellent", "recommended", "caution", "low", "info"])
    assert.ok(ratio(token(`${k}-text`), over(token(k), 0.12)) >= 4.5, k);
  assert.ok(ratio(token("danger"), over(token("danger"), 0.1)) >= 4.5, "danger");
});
test("large text passes 3:1: banner on every stop, headline stops on the wash", () => {
  for (let i = 1; i <= 4; i++) assert.ok(ratio("#ffffff", token(`banner-${i}`)) >= 3, `banner-${i}`);
  for (let h = 1; h <= 4; h++) for (let w = 1; w <= 3; w++)
    assert.ok(ratio(token(`headline-${h}`), token(`wash-${w}`)) >= 3, `headline-${h} on wash-${w}`);
});
```

- [ ] **Step 2: Run** `node --test lib/design/contrast.test.ts`. Expected: FAIL, with `--wash-1 must be a 6-digit hex in :root` or a failing ratio.

- [ ] **Step 3: Rewrite the tokens** in `app/globals.css` per the Interfaces above. Keep the existing `html`, `body`, heading and scrollbar rules.

- [ ] **Step 4: Rewrite `types/design.md`** as the new style guide (≤150 lines). Cover:
  - principles
  - the token table
  - gradients and where each is used
  - shadows
  - buttons, cards, pills, inputs and dialogs
  - score fills vs text shades
  - logo usage: multiply blend on tints
  - motion (`motion-safe:`)
  - the contrast test

  Drop every "no shadows / no gradients" rule.

- [ ] **Step 5: Run the Checks.** Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css types/design.md app/layout.tsx lib/design/contrast.test.ts
git commit -m "feat: gradient theme tokens, new style guide and contrast test"
```

---

### Task 3: Shared UI components

**Files:**
- Modify:
  - `components/ui/button.tsx`
  - `components/ui/card.tsx`
  - `components/ui/badge.tsx`
  - `components/ui/input.tsx`
  - `components/ui/select.tsx`
  - `components/ui/textarea.tsx`
  - `components/ui/checkbox.tsx`
  - `components/ui/dialog.tsx`
  - `components/ui/toast.tsx`
  - `components/ui/skeleton.tsx` (comment only)
- Test: `lib/design/styleRules.test.ts` (new; scoped to `components/ui` for now)

**Interfaces:**
- Consumes: Task 2 tokens and utilities.
- Produces:
  - The same exports and variant names as today. `Button`: primary, secondary, outline, ghost, danger, link; sizes sm, md, lg, icon. `Badge`: default, outline, primary, excellent, recommended, caution, low, danger, info.
  - `buttonVariants` stays exported. Later tasks use it on `<Link>`.

**Values:**

| Piece | Style |
|---|---|
| Button base | `rounded-md font-semibold transition-[transform,box-shadow,filter,border-color,color] motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px disabled:opacity-45 disabled:shadow-none`, plus the focus ring. Remove `hover:scale`/`active:scale`. |
| primary | `bg-brand text-primary-foreground font-bold shadow-button hover:shadow-button-hover hover:brightness-110 active:shadow-button-press` |
| secondary, outline | `border-[1.5px] border-border-input bg-card text-button-ink shadow-white hover:border-border-strong` |
| danger | `border-[1.5px] border-danger-border bg-card text-danger shadow-white hover:border-danger` |
| ghost | `text-accent hover:bg-elevated hover:text-accent-strong` |
| link | `text-accent underline-offset-4 hover:underline h-auto p-0 shadow-none motion-safe:hover:translate-y-0` |
| Button sizes | `sm` h-9 px-3.5 text-xs; `md` h-11 px-5; `lg` h-14 px-7 text-base rounded-lg; `icon` size-11 |
| Card | `rounded-[20px] border border-border bg-card shadow-card`. `interactive` → `motion-safe:hover:-translate-y-0.5 hover:border-border-strong` |
| Badge | `rounded-full font-semibold border-transparent`. `default` bg-elevated text-muted; `outline` border-border-input bg-card text-muted; `primary` bg-panel text-primary-soft-foreground; tier and info variants `bg-[var(--X)]/12 text-X-text`; danger `bg-[var(--danger)]/10 text-danger` |
| Input, Select, Textarea | `rounded-md border-[1.5px] border-border-input bg-card` with a hover border-border-strong and a focus ring. Drop the gray `bg-elevated` fill. |
| Checkbox | Unchecked: `border-[1.5px] border-border-strong bg-card`. Checked: `border-transparent bg-brand text-white`. |
| Dialog | Backdrop `bg-foreground/45`. Center modal `rounded-3xl border border-border shadow-deep`. Right panel `border-l border-border shadow-deep`. The close button gets the focus ring. |
| Toast | `rounded-full shadow-card`. Tones: default `bg-foreground text-white`; success `bg-recommended-text text-white`; warning `bg-[var(--caution)] text-foreground`; danger `bg-danger text-white`. |

- [ ] **Step 1: Write the failing test** `lib/design/styleRules.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// filesUnder(...dirs): every .ts/.tsx path under the given repo-relative dirs (recursive).
const FILES = filesUnder("components/ui");
const offenders = (re: RegExp) => FILES.filter((f) => re.test(readFileSync(f, "utf8")));

test("no scale-on-hover or scale-on-press", () => {
  assert.deepEqual(offenders(/\b(hover|active):scale-/), []);
});
test("every hover/press movement respects reduced motion", () => {
  assert.deepEqual(offenders(/(?<!motion-safe:)\b(hover|active):-?translate-/), []);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, listing `components/ui/button.tsx` and `components/ui/card.tsx`.

- [ ] **Step 3: Restyle the ten files** per the Values table.

- [ ] **Step 4: Run the Checks**, then check in the browser:
  - `/login` (input, primary button).
  - `/swipe`, Filters panel (right dialog, checkbox, select, badges).
  - Tab to a gradient button: the ring is visible against the gradient.

- [ ] **Step 5: Commit**

```bash
git add components/ui lib/design/styleRules.test.ts
git commit -m "feat: restyle shared UI components to the gradient look"
```

---

### Task 4: Logo image

**Files:**
- Move: `itjclogo.png` → `public/brand/itjobcafe-logo.png`. It's untracked, so use `mkdir -p public/brand && mv`. Confirm 230×64 with `sips -g pixelWidth -g pixelHeight`.
- Modify: `components/layout/Logo.tsx`
- Modify callers:
  - `components/swipe/SwipeShell.tsx:34-42`: replace the Logo, the text spans and the "Swipe" badge with `<Logo height={30} />`. Give the link `aria-label="ITJobCafé home"`. Remove the unused `Badge` import.
  - `app/login/page.tsx:18` and `app/signup/page.tsx:18`: `<Link href="/" aria-label="ITJobCafé home"><Logo height={44} className="mix-blend-multiply" /></Link>`.
  - `app/page.tsx` and `components/legal/LegalPage.tsx`: no change needed (default height). Both are replaced in Tasks 5–6.

**Interfaces:**
- Produces: `Logo({ height = 52, className, preload = false }: { height?: number; className?: string; preload?: boolean })`.
  - Renders `next/image` with `src="/brand/itjobcafe-logo.png"`, `alt="ITJobCafé"`, `height={height}` and `width={Math.round(height * 230 / 64)}`, passing `preload` through.
  - No link inside; callers wrap it.
  - `showWordmark` is gone.

- [ ] **Step 1: Move the image and rewrite `Logo.tsx`** per the Interfaces.
- [ ] **Step 2: Run** `npx tsc --noEmit`. Expected: FAIL at `SwipeShell.tsx`, because `showWordmark` no longer exists. This confirms the old prop is gone.
- [ ] **Step 3: Update the callers** listed above.
- [ ] **Step 4: Run the Checks and `npm run build`.** Then check in the browser: the logo shows on `/swipe` (30px) and `/login` (44px, no white box once Task 12 adds the wash).
- [ ] **Step 5: Commit**

```bash
git add public/brand/itjobcafe-logo.png components/layout/Logo.tsx components/swipe/SwipeShell.tsx app/login/page.tsx app/signup/page.tsx
git commit -m "feat: replace icon logo with the ITJobCafé logo image"
```

---

### Task 5: Marketing frame (header, banner, footer) with Privacy and Support inside it

**Files:**
- Create:
  - `app/(marketing)/layout.tsx`
  - `components/marketing/SiteHeader.tsx` (client)
  - `components/marketing/SiteFooter.tsx`
  - `components/marketing/nav-links.ts`
  - `components/marketing/primitives.tsx`
- Move (`git mv`):
  - `app/privacy/page.tsx` → `app/(marketing)/privacy/page.tsx`
  - `app/support/page.tsx` → `app/(marketing)/support/page.tsx`

  Contents stay the same.
- Modify: `components/legal/LegalPage.tsx`.
  - Drop the Logo link, `LegalLinks` and the `<main>` wrapper; render `<div className="mx-auto max-w-2xl px-5 py-12">`, the title, then children.
  - Keep the `LEGAL_H2`/`LEGAL_P`/`LEGAL_UL` exports unchanged, because `PrivacyPolicy.tsx` imports them.

**Interfaces:**
- Produces:
  - `SITE_NAV_LINKS: readonly { label: string; href: string }[]`: Home `/`, Find Matches `/swipe`, AI Tools `/ai-tools`, How It Works `/how-it-works`, FAQ `/faq`.
  - `SiteHeader({ loggedIn }: { loggedIn: boolean })`.
  - `SiteFooter()`.
  - `Eyebrow({ children }: { children: React.ReactNode })`.
  - `GradientText({ children }: { children: React.ReactNode })`, a `<span className="text-gradient">`.
  - `PageHero({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode })`: the shorter inner-page hero on `bg-wash`, used by Tasks 7–9.
- Layout: `MarketingLayout({ children })`, an async server component. It calls `auth()`, then renders:
  1. `<SiteHeader loggedIn={Boolean(session?.user)} />`
  2. The banner: a `<p>` with `bg-banner`, white bold text, **≥19px at every width**, centered and wrapping. The ✦ glyphs sit in `aria-hidden` spans.
  3. `<main id="main" className="flex-1">{children}</main>`
  4. `<SiteFooter />`

Behavior (from the spec's "Shared frame" section):
- **Header**
  - White, `sticky top-0 z-40`, bottom hairline. Logo at height 52 with `preload`, linking to `/`.
  - Links are 15px semibold, `text-foreground`, hover `text-accent-strong`.
  - Active means `usePathname() === href`: `aria-current="page"`, `text-accent-strong font-bold`, and a 2.5px underline using `bg-brand`.
  - CTA: `buttonVariants()` Link. Signed out: "Sign in / Sign up" + `ArrowRight` to `/login`. Signed in: "Open the app" + `ArrowRight` to `/swipe`.
- **Narrow screens:** below `lg` (adjust if the row wraps between 1024 and 1440px), the links and CTA move into a panel behind a menu button.
  - The button has `aria-expanded`, `aria-controls` and the label "Menu".
  - Escape closes the panel and returns focus to the button. Use a keydown listener while open, with a ref to the button.
  - Each panel link's `onClick` closes the panel.
- **Footer:** Logo at height 34, "AI-ranked job discovery for tech careers", and `<LegalLinks />`.

- [ ] **Step 1: Create the files and moves above.** Then run `npm run build`. Expected: PASS, with `/privacy` and `/support` still listed as routes.
- [ ] **Step 2: Run the Checks.**
- [ ] **Step 3: Browser checks**
  1. `/privacy` and `/support` show the header, banner and footer at 1440px and 390px.
  2. Signed out, the CTA reads "Sign in / Sign up" and opens `/login`. Signed in, it reads "Open the app" and opens `/swipe`.
  3. At 1440px, Tab from the address bar: logo → five links → CTA. Each shows a ring.
  4. At 390px:
     - The menu button toggles `aria-expanded`.
     - Escape closes the menu and focus lands on the menu button.
     - Clicking a menu link closes the menu.
  5. At 360px on `/privacy`, `document.documentElement.scrollWidth === innerWidth` is `true`.
- [ ] **Step 4: Commit**

```bash
git add "app/(marketing)" components/marketing components/legal/LegalPage.tsx
git commit -m "feat: shared marketing header, banner and footer; privacy and support move inside"
```

---

### Task 6: Landing page

**Files:**
- Create:
  - `app/(marketing)/page.tsx`
  - `components/marketing/landing/LandingHero.tsx`
  - `components/marketing/landing/MatchIllustration.tsx`
  - `components/marketing/landing/StatsStrip.tsx`
- Delete (`git rm`):
  - `app/page.tsx` (it must go in the same commit; two groups can't both resolve `/`)
  - `components/landing/Landing.tsx`
- Modify:
  - `app/globals.css`: delete `.bg-soft` and `.bg-grid`.
  - `app/layout.tsx:19-23`: title "ITJobCafé — Know your job matching score"; description "Upload your résumé once. Discover your best-fit tech jobs, see why each role fits, and build your career with confidence."
  - `components/swipe/ScoreGate.tsx:16`: comment only. Drop "(landing preview card)"; the optional store stays.
- Test: `lib/design/marketingCopy.test.ts` (new)

**Interfaces:**
- Consumes:
  - Task 5: `Eyebrow`, `GradientText`.
  - Task 3: `buttonVariants`.
  - Task 1: `scoreFraction`, `getScoreLabel`.
- Produces: `MatchIllustration()` and `StatsStrip()` (no props). `marketingCopy.test.ts` helpers that Tasks 7–9 extend:
  - `source(...paths): string` returns the concatenated file text under the given repo-relative files and dirs. It turns `{" "}` into a space and collapses whitespace to single spaces.
  - `STALE` is the list of stale phrases.

Content and layout come from the spec's "`/` landing" section and `Main.dc.html`:
- **Hero copy and buttons:**
  - Copy verbatim.
  - Buttons are `buttonVariants({ size: "lg" })` Links. "Find My Matches" + `ArrowUpRight` goes to `/swipe`. "Set Up Profile" + `ArrowRight` uses the `secondary` variant and goes to `/profile`.
  - Check icons use `text-excellent-text`.
- **`MatchIllustration`:**
  - One wrapper with `role="img"` and `aria-label="Your résumé matched to three jobs with fit scores of 5.0, 4.0 and 2.0"`. Everything inside is `aria-hidden`.
  - Rings are conic gradients filled to `scoreFraction(score) * 100%` for `[5.0, 4.0, 2.0]`. Hex art is allowed here.
  - The floating card is a sibling `Link` to `/swipe`, outside the `role="img"` element. Its big number is "5.0" in `text-excellent-text`, its label is `getScoreLabel(5.0)`, and it reads "See your job-fit insights" with `ArrowUpRight`.
  - At <640px, hide the placeholder bars and keep the rings, the résumé card and the floating card.

- [ ] **Step 1: Write the failing test** `lib/design/marketingCopy.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
// source(...paths) as described in Interfaces (readdirSync/readFileSync, recursive, whitespace-normalized).

const STALE = ["location and score", "every time you look at a job", "We read your skills", "Every job gets one score",
  "Sort your saved jobs by fit", "then sign up to keep your progress", "Together they become your career profile",
  "AI scores each tech job", "Your scores get sharper", "No. You can browse"];

test("no stale demo copy or overclaims anywhere on the public pages", () => {
  const all = source("app/(marketing)", "components/marketing");
  for (const s of STALE) assert.ok(!all.includes(s), `stale: ${s}`);
  assert.ok(!/top 10/i.test(all), "no 'top 10'");
});

test("landing carries the corrected copy", () => {
  const s = source("app/(marketing)/page.tsx", "components/marketing/landing");
  for (const t of ["Know Your Job", "Matching Score.", "Find Your Fit.", "AI-POWERED CAREER MATCHING",
    "Find My Matches", "Set Up Profile", "Personalized job scores", "Skills gap insights", "You choose when to apply",
    "Filter fit", "Narrow jobs by skills, city, type and date", "1.0–5.0", "Explainable fit score",
    "One résumé", "Build your career profile", "All devices", "Website, Android and iPhone"])
    assert.ok(s.includes(t), `missing: ${t}`);
});
```

- [ ] **Step 2: Run** `node --test lib/design/marketingCopy.test.ts`. Expected: FAIL on the landing test, because the files don't exist yet.
- [ ] **Step 3: Build the page and delete the old landing.** Run `npm run build`. Expected: PASS, with `/` served from `(marketing)`.
- [ ] **Step 4: Run the Checks.**
- [ ] **Step 5: Browser checks**
  1. At 1440px, compare a screenshot of `/` side by side with `client-mockup.png` and `Main.dc.html`. Fix any layout differences, or list them for the hand-over.
  2. At 390px and 360px, the hero stacks, the illustration reads, and `scrollWidth === innerWidth`.
  3. Tab reaches "Find My Matches", "Set Up Profile", then the floating card. A screen reader (VoiceOver rotor or the accessibility tree) shows one image with the label above and the card as a link.
  4. Signed out, "Set Up Profile" lands on `/login`.
- [ ] **Step 6: Commit**

```bash
git add "app/(marketing)/page.tsx" components/marketing/landing app/globals.css app/layout.tsx components/swipe/ScoreGate.tsx lib/design/marketingCopy.test.ts
git rm app/page.tsx components/landing/Landing.tsx
git commit -m "feat: new landing page matching the client mockup"
```

---

### Task 7: AI Tools page

**Files:**
- Create: `app/(marketing)/ai-tools/page.tsx`. Split out card components under `components/marketing/ai-tools/` only if the page passes ~200 lines.
- Test: extend `lib/design/marketingCopy.test.ts`.

**Interfaces:**
- Consumes: `PageHero`, `GradientText`, `buttonVariants`, `SCORE_BANDS`.
- Produces: `metadata = { title: "AI Tools · ITJobCafé" }`.

Content comes verbatim from the spec's `/ai-tools` section, with layout from `AiTools.dc.html`:
- Four cards, 2×2 on `md+`.
- Icons: `FileText`, `Gauge`, `ListChecks`, `SlidersHorizontal`.
- The navy band uses `ShieldCheck`.
- Tier pills come from `SCORE_BANDS`:
  - `${min.toFixed(1)}+ ${shortLabel}` for every band except the last.
  - The last band reads `Below ${SCORE_BANDS.at(-2).min.toFixed(1)} ${shortLabel}`.
  - Color pills with the badge tier variants by `token`.

- [ ] **Step 1: Add the failing test**

```ts
test("AI Tools carries the corrected copy and reads tiers from SCORE_BANDS", () => {
  const s = source("app/(marketing)/ai-tools");
  for (const t of [
    "Four tools work together to find the jobs worth your time. Here is what each one does, and what it never does.",
    "Upload your résumé and fill in your profile: skills, target roles and locations. The AI reads both every time it scores a job for you.",
    "Once your résumé is uploaded, ask the AI to score a job, or the next 10 at once. 4.0 and up is worth applying; 4.5 and up is an excellent fit.",
    "Narrow the feed by skills, city, job type and date posted, or let your profile preferences filter for you. Then filter your applications by fit.",
    "The AI scores and explains. You decide.", "Nothing is ever applied automatically.", "Up to 5 MB", "SCORE_BANDS"])
    assert.ok(s.includes(t), `missing: ${t}`);
  assert.ok(!s.includes("Not recommended") && !s.includes("Possible"), "tier labels must come from SCORE_BANDS");
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Build the page.**
- [ ] **Step 4: Run the Checks and `npm run build`.** In the browser:
  - Compare 1440px against `AiTools.dc.html`.
  - 390px stacks with `scrollWidth === innerWidth`.
  - The "AI Tools" nav link is active.
- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/ai-tools" components/marketing lib/design/marketingCopy.test.ts
git commit -m "feat: AI Tools page"
```

---

### Task 8: How It Works page and score scale

**Files:**
- Create:
  - `app/(marketing)/how-it-works/page.tsx`
  - `components/marketing/ScoreScale.tsx`
- Test: extend `lib/design/marketingCopy.test.ts`.

**Interfaces:**
- Consumes: `PageHero`, `GradientText`, `buttonVariants`, `SCORE_BANDS`, `SCORE_MAX`, `SCORE_MIN`.
- Produces:
  - `ScoreScale()`, which renders bands left to right from low to high.
    - Segment `flex-grow` = `upper − min`, where `upper` is `SCORE_MAX` for the top band and otherwise the next-higher band's `min`.
    - Colors by band: not-recommended `--scale-none`, weak `--low`, possible `--scale-possible`, good `--caution`, strong `--recommended`, excellent `--excellent`.
    - Labels show `shortLabel` over `${min.toFixed(1)}+`. The lowest band shows `${SCORE_MIN.toFixed(1)}–${(upper - 0.1).toFixed(1)}` ("1.0–2.4").
    - Strong and excellent labels use their `-text` color.
    - One `role="img"` with an `aria-label` built from the same table.
  - `metadata = { title: "How It Works · ITJobCafé" }`.

Content comes verbatim from the spec's `/how-it-works` section, with layout from `HowItWorks.dc.html`.

The closing band uses `bg-banner` with two CTAs:
- White "Find My Matches": `buttonVariants({ variant: "secondary" })`.
- White-outline "Set Up Profile": local classes `border-[1.5px] border-white/80 text-white hover:bg-white/10`, plus the base size, radius and focus ring.

Its text is ≥19px bold, or 24px+.

- [ ] **Step 1: Add the failing test**

```ts
test("How It Works carries the corrected copy and reads the scale from SCORE_BANDS", () => {
  const s = source("app/(marketing)/how-it-works", "components/marketing/ScoreScale.tsx");
  for (const t of [
    "No account needed to start: browse and swipe as a guest. Sign up and add your résumé to see your fit scores.",
    "Create an account, add a PDF or .docx and fill in your job preferences.",
    "Ask the AI to score a job, or the next 10 at once. Each gets a 1.0–5.0 score with the reasons behind it.",
    "Start swiping now as a guest. Sign up and add your résumé to see your fit scores.",
    "4.0 is where we recommend applying.", "SCORE_BANDS"])
    assert.ok(s.includes(t), `missing: ${t}`);
  assert.ok(!s.includes("Not recommended") && !s.includes("Possible"), "tier labels must come from SCORE_BANDS");
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Build the page and the scale.**
- [ ] **Step 4: Run the Checks and `npm run build`.** In the browser:
  - Compare 1440px against `HowItWorks.dc.html`. Segment widths should match the demo's 1.5 : 0.5 × 5.
  - At 390px, the scale labels don't overlap. Stacking or abbreviating them is the builder's call. Check `scrollWidth === innerWidth`.
- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/how-it-works" components/marketing/ScoreScale.tsx lib/design/marketingCopy.test.ts
git commit -m "feat: How It Works page with score scale"
```

---

### Task 9: FAQ page

**Files:**
- Create: `app/(marketing)/faq/page.tsx`
- Test: extend `lib/design/marketingCopy.test.ts`.

**Interfaces:**
- Consumes: `PageHero`, `GradientText`, `buttonVariants`.
- Produces: `metadata = { title: "FAQ · ITJobCafé" }`.

Content comes verbatim from the spec's `/faq` section, with layout from `Faq.dc.html`:
- Seven native `<details>`/`<summary>` white cards. The first has `open`.
- The summary gets the focus ring, and its chevron rotates when open.
- Answer 5 links "privacy policy" to `/privacy`.
- The closing tinted box links "Contact support" + `ArrowRight` to `/support` as a primary button.
- Answers 4 and 5 must still match `app/api/resume-upload/route.ts` (pdf/docx, 5 MB) and `PrivacyPolicy.tsx` (Anthropic, DeepSeek). Re-read both before writing.

- [ ] **Step 1: Add the failing test**

```ts
test("FAQ carries the corrected copy", () => {
  const s = source("app/(marketing)/faq");
  for (const t of [
    "Not to look around: you can browse and swipe as a guest. To see fit scores, create an account and upload your résumé.",
    "PDF or Word (.docx), up to 5 MB.", "Anthropic or DeepSeek", "Android and iPhone apps are on the way.",
    "Go to Settings and choose Delete account, then confirm.", "Still have a question?", "/support", "/privacy"])
    assert.ok(s.includes(t), `missing: ${t}`);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Build the page.**
- [ ] **Step 4: Run the Checks and `npm run build`.** In the browser:
  - Compare 1440px against `Faq.dc.html`.
  - Each question opens with Enter and Space.
  - At 390px, `scrollWidth === innerWidth`.
- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/faq" lib/design/marketingCopy.test.ts
git commit -m "feat: FAQ page"
```

---

### Task 10: App shell (top bar, bottom tabs, Filters button)

**Files:**
- Modify: `components/swipe/SwipeShell.tsx`
  - Root `bg-background` → `bg-wash`.
  - Header: solid `bg-card`, with a `relative` 3px `bg-banner` line along the bottom edge (`absolute inset-x-0 bottom-0 h-[3px]`). Remove `border-b-2`.
  - Reset stays `ghost`.
  - Guest "Log in": replace `<Link><Button size="sm">` with `<Link className={buttonVariants({ size: "sm" })}>`.
- Modify: `components/swipe/MobileNav.tsx`
  - `border-t border-border bg-card shadow-up` (no `border-t-2`).
  - The active link gets `aria-current="page"` and `text-accent-strong font-bold`. Its icon sits in a `bg-panel rounded-full px-4 py-1` pill.
  - Inactive links: `text-muted hover:text-foreground`.
- Modify: `components/swipe/JobFilterButton.tsx:180-188`. The trigger becomes `variant="secondary"` with `SlidersHorizontal` in place of `Filter`. Badge and behavior stay.

**Interfaces:**
- Consumes: Task 2 utilities, Task 3 `buttonVariants`.
- Produces: the same component props as today.

- [ ] **Step 1: Make the changes.**
- [ ] **Step 2: Run the Checks.**
- [ ] **Step 3: Browser checks** at 390px and 1440px on `/swipe`, `/dashboard`, `/applications`, `/profile` and `/settings`:
  - The gradient line shows under the bar.
  - The active tab has the pill.
  - The Filters panel opens from the new button.
  - Content isn't hidden behind the bottom bar.
- [ ] **Step 4: Commit**

```bash
git add components/swipe/SwipeShell.tsx components/swipe/MobileNav.tsx components/swipe/JobFilterButton.tsx
git commit -m "feat: restyle app top bar, bottom tabs and Filters button"
```

---

### Task 11: Swipe card, score meter and swipe actions

**Files:**
- Modify: `components/swipe/SwipeJobCard.tsx`
  - Line 47: `rounded-3xl border border-border bg-card shadow-deep`.
  - The comment at line 48 now describes the company color strip (data), which stays.
  - Line 101: the panel uses `bg-panel`.
  - Lines 108–111: "AI scored" becomes `✦ AI SCORED`: 11px, bold, `tracking-[0.12em]`, `text-accent`.
  - Line 125: `text-recommended-text`.
  - Line 170: `text-caution-text`.
  - Stamp (lines 206–209):
    - `rounded-xl border-[3px] bg-card/85 shadow-card`, with `text-recommended-text border-[var(--recommended)]` or `text-danger border-danger`.
    - Keep the rotation, position and opacity logic exactly as it is.
  - Details chip: `bg-card border-border-input`.
- Modify: `components/swipe/ScoreMeter.tsx`
  - The label and number use `getScoreTextColorVar(score)`.
  - Track `bg-card/80`.
  - Bar `backgroundImage: linear-gradient(90deg, ${getScoreColorVar(score)}, ${getScoreTextColorVar(score)})`, with the same width.
- Modify: `components/jobs/ScoreBreakdown.tsx:14-32`
  - The number uses `getScoreTextColorVar(item.score)`.
  - The bar uses the same gradient as ScoreMeter.
- Modify: `components/swipe/ScoreGate.tsx:73`: `text-caution-text`.
- Modify: `components/swipe/SwipeActionButtons.tsx`
  - `RoundButton` base: `rounded-full border-[1.5px] bg-card shadow-white motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-px`, with the focus ring. Remove `hover:scale-110`/`active:scale-95`.
  - Skip: `size-14 border-danger-border text-danger`.
  - Save: `size-12 border-[var(--info)]/30 text-info-text`.
  - Details: `size-12 border-border-input text-muted`.
  - Interested: `size-14 border-transparent bg-brand text-white shadow-button`.
  - "Review & Apply" stays `Button size="lg"`, now gradient.
- Modify: `components/swipe/TagPill.tsx`
  - `rounded-full`.
  - Tones: default `border-transparent bg-elevated text-muted`; primary `border-transparent bg-primary-soft text-primary-soft-foreground`; muted `border-border text-muted-foreground`.

**Interfaces:**
- Consumes: Task 1 `getScoreTextColorVar` and `getScoreColorVar`; Task 2 tokens.
- Produces: the same component props as today.

- [ ] **Step 1: Make the changes.**
- [ ] **Step 2: Run the Checks.** Then run `git diff --quiet main -- components/swipe/DraggableCard.tsx components/swipe/SwipeDeck.tsx`. Expected: exit 0.
- [ ] **Step 3: Swipe checks** at 390px and 1440px on `/swipe`:
  1. Drag a card right past the threshold: the INTERESTED stamp fades in, the card flies out, the next card appears.
  2. Drag left: SKIP does the same.
  3. Release a short drag: the card snaps back.
  4. The stamps aren't clipped by the rounded corners.
  5. The Skip, Save, Details and Interested buttons and "Review & Apply" still work, and the dialogs open.
  6. Compare a screenshot at 390px with `SwipeScreen.dc.html`.
- [ ] **Step 4: State checks**
  1. Signed out: blurred meter with "Log in to see AI ratings".
  2. Signed in, unscored: "Ask AI to score".
  3. Scored: label and number in the tier's dark shade, with the bar gradient.
- [ ] **Step 5: Long-data check** in DevTools on one card:
  - Set the title to 120 characters and the company to 60.
  - Hide compensation.
  - The card and Job details dialog don't overflow sideways at 360px.
- [ ] **Step 6: Commit**

```bash
git add components/swipe/SwipeJobCard.tsx components/swipe/ScoreMeter.tsx components/jobs/ScoreBreakdown.tsx components/swipe/ScoreGate.tsx components/swipe/SwipeActionButtons.tsx components/swipe/TagPill.tsx
git commit -m "feat: restyle swipe card, score meter and swipe actions"
```

---

### Task 12: Remaining screens, with the style rules widened to the whole app

**Files:**
- Modify: `lib/design/styleRules.test.ts`.
  - `FILES = filesUnder("app", "components")`, minus `components/legal/PrivacyPolicy.tsx` and `components/settings/DeleteAccountCard.tsx` (not ours to edit).
  - Add these tests:
    - No `border-2` / `border-[tblr]-2`.
    - No `text-[var(--(excellent|recommended|caution|info))]`, i.e. no fill colors used as text.
    - No `bg-grid` / `bg-soft`.
- Modify:
  - `app/login/page.tsx` and `app/signup/page.tsx`: main `bg-wash`; card `rounded-3xl border border-border bg-card p-6 shadow-card`.
  - `app/(app)/swipe/page.tsx`: line 104 `bg-brand`; line 143 `border` (not `border-2`) with `text-caution-text`.
  - `app/(app)/(protected)/profile/page.tsx:118`: `bg-brand`.
  - `components/swipe/ProfileCompletionCard.tsx`: line 35 `bg-brand`; line 44 `text-recommended-text`.
  - `components/shared/PipelineErrorBanner.tsx:10`: `border` and `text-caution-text`.
  - `components/dashboard/StatCard.tsx:16-22`: tinted chips `rounded-xl`.
    - primary: `bg-panel text-accent`
    - other accents: `bg-[var(--X)]/12 text-X-text`
    - Update the comment.
  - `components/shared/EmptyState.tsx:26`: icon chip `bg-panel text-accent`.
  - `components/swipe/JobDetailModal.tsx`: line 134 `bg-panel`; line 177 `text-recommended-text`; line 191 `text-caution-text`.
  - Anything else the widened test or the browser pass turns up.

- [ ] **Step 1: Widen the test.** Run `node --test lib/design/styleRules.test.ts`. Expected: FAIL. The listed offenders are the worklist.
- [ ] **Step 2: Fix every offender.**
- [ ] **Step 3: Run the Checks and `npm run build`.**
- [ ] **Step 4: Browser pass, signed in, at 390px and 1440px:**
  - Dashboard, Applications, Profile and Settings, with every dialog: Job details, Review & apply, Filters, Delete account (open, then cancel).
  - Résumé upload card, empty states, toasts (save a job).
  - Login and signup: no white box behind the logo.

  Nothing should still look flat (gray blocks, 2px borders, bright-amber text).
- [ ] **Step 5: Commit**

```bash
git add -A app components lib/design/styleRules.test.ts
git status --short   # confirm nothing from scripts/, .superpowers/ or the root itjclogo.png is staged
git commit -m "feat: carry the new look through the remaining app screens"
```

---

### Task 13: Full verification

**Files:** none, except fixes the pass turns up (commit them as `fix: …`).

- [ ] **Step 1:** Run the Checks and `npm run build`. Expected: all clean.
- [ ] **Step 2:** Run `git diff --stat main -- components/legal/PrivacyPolicy.tsx components/settings/DeleteAccountCard.tsx app/api/profile/route.ts lib/swipe/swipeStore.tsx package.json package-lock.json eslint.config.mjs .gitignore components/swipe/DraggableCard.tsx components/swipe/SwipeDeck.tsx`. Expected: empty.
- [ ] **Step 3:** Run `git merge-tree --write-tree HEAD feat/server-side-profile`. Expected: exit 0 with no `CONFLICT` lines.
- [ ] **Step 4: Browser pass** of every route at about 1440px and 390px, signed out and signed in:

  `/`, `/ai-tools`, `/how-it-works`, `/faq`, `/privacy`, `/support`, `/login`, `/signup`, `/swipe`, `/dashboard`, `/applications`, `/profile`, `/settings`

  On each route:
  - Tab through the page and confirm the focus rings.
  - Check `scrollWidth === innerWidth` at 390px.
- [ ] **Step 5: Screenshots.** Take them of `/`, `/ai-tools`, `/how-it-works`, `/faq` and `/swipe` at both widths. Compare them side by side with the demos. Fix the differences, or list them for the hand-over.
- [ ] **Step 6: Spot-check contrast** in the browser for:
  - banner text at 390px
  - gradient button text
  - score text in all six bands
  - secondary text on the wash

---

## Delivery (controller, after the final whole-branch review)

1. Scan `git log -p main..HEAD` for security wording, using the keyword list kept in the controller's memory notes, not in this repo. Expected: only the generic constraint line in the spec.
2. Push: `git push -u origin feat/landing-redesign`.
3. Open the PR with `gh pr create --base main`. The body:
   - Summary of the redesign.
   - Lists the new routes.
   - Says this change **adds no deploy steps**. `main` already carries earlier undeployed work with its own notes, for example the `mssql` note in `next.config.ts`.
   - Notes that `feat/server-side-profile` merges later and that a trial merge is clean.
   - Lists any differences from the demos left open.
   - Ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
4. Merge with `gh pr merge <N> --merge`. If that's blocked, run `git checkout main && git pull && git merge --no-ff feat/landing-redesign -m "Merge pull request #<N> from <owner>/feat/landing-redesign"`, then `git push origin main`.
5. Update memory (`site-redesign.md`, `MEMORY.md`): merged, PR number, not deployed.
