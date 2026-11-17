# ITJobCafé Style Guide

Light, soft-gradient design. Tokens live in `app/globals.css`; components use tokens and
utilities, never hex literals (exceptions: company brand colors, the Google logo, and art
under `components/marketing/**` and `app/(marketing)/**`).

## Principles
1. **Soft depth**: tinted shadows and gradients add warmth. Shadows are low and wide, never gray or harsh.
2. **Blue to violet**: the brand runs `primary` (blue) into `primary-end` (violet); the banner and headline gradients extend it toward pink.
3. **Hairlines over blocks**: cards and sections are white with a 1px lavender border.
4. **Readable first**: all text passes WCAG AA (4.5:1; 3:1 for 24px+ or 18.66px+ bold). Gradient text is for large headlines only.
5. **Round and friendly**: `--radius` is 0.875rem (`rounded-lg` 14px, `rounded-md` 12px, `rounded-sm` 10px). Cards go to 20-24px.
6. **Calm motion**: small lifts, never scaling.

## Tokens (`:root`)
| Group | Tokens |
|---|---|
| Surfaces | `background` #fff, `surface` #f7f5fd, `card` #fff, `card-hover` #faf8ff, `elevated` #f4f2fb |
| Borders | `border` #ece7f7 (cards, sections), `border-input` #e6e1f5 (inputs, white buttons), `border-strong` #c9bff0 (hover) |
| Text | `foreground` #141a3a, `muted` #4b5268 (body), `muted-foreground` #636a82 (secondary) |
| Brand | `primary` #2563eb, `primary-end` #7c3aed, `primary-soft` #eef2ff + `primary-soft-foreground` #3730a3, `accent` #4c3fc4 (links), `accent-strong` #5b45d6 (active/hover), `eyebrow` #6b46c1, `button-ink` #2e2a6b |
| Danger | `danger` #c0392b, `danger-border` #f3c7c7 |
| Focus | `ring` #5b45d6 |
| Stops | `banner-1..4`, `headline-1..4`, `wash-1..3`, `panel-1..2` |

Every color has a `--color-*` mapping, so `text-accent-strong`, `bg-elevated`, `border-border-input` etc. work.

## Gradients
| Utility | Built from | Use |
|---|---|---|
| `bg-brand` | 90deg primary to primary-end | Primary buttons, active accents |
| `bg-banner` | 90deg banner-1..4 (0/32/66/100%) | Top banner; white bold text |
| `text-gradient` | 90deg headline-1..4 (0/42/74/100%) | Large headline words only |
| `bg-wash` | 115deg wash-1..3 (0/45/100%) | Hero and app page background |
| `bg-panel` | 120deg panel-1 to panel-2 | Feature panels, callouts |

`banner-1` is tuned darker than the mockup so white text passes 3:1. Headline stops are checked against the wash.

## Shadows
`shadow-card` (cards), `shadow-deep` (hero art, dialogs), `shadow-button` / `-hover` / `-press` (gradient buttons), `shadow-white` (white buttons), `shadow-up` (sticky bottom bars).

## Components
- **Buttons**: primary is `bg-brand`, white bold text, `shadow-button`; hover lifts 1px, brighter, `shadow-button-hover`; press sinks 1px with `shadow-button-press`; disabled is 45% opacity, no shadow. Secondary/outline is white with a 1.5px `border-input`, `text-button-ink`, `shadow-white`; hover lifts and uses `border-strong`. Danger is white with `danger-border` and `text-danger`. Ghost/link is `text-accent`, no fill. A link styled as a button is `<Link className={buttonVariants(...)}>`.
- **Cards**: white, 20-24px radius, 1px `border`, `shadow-card`.
- **Pills/tags**: fully rounded; `bg-primary-soft text-primary-soft-foreground`, or `bg-elevated text-muted`.
- **Inputs**: white, 1px `border-input`, rounded-md; focus shows the ring.
- **Dialogs**: large radius, soft navy backdrop, `shadow-deep`.
- **Skeleton**: pale lavender (`--border`) with a soft pulse.
- **Focus**: every interactive element uses `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

## Score colors
Fills (`excellent`, `recommended`, `caution`, `low`, `info`) are for bars, rings and tints. Score *text* uses the `-text` shades (`excellent-text`, `recommended-text`, `caution-text`, `low-text`, `info-text`), which pass AA. In code, `getScoreTextColorVar(score)` returns the right `var(--*-text)`. Score meter bars are a short light-to-dark gradient inside the tier color on a white or tinted track. `scale-none` and `scale-possible` color the skill-scale dots.

## Logo
The logo PNG has an opaque white background. On white it is invisible; on tinted or gradient surfaces (the wash, the translucent app top bar) add `mix-blend-mode: multiply` (`mix-blend-multiply`) so the white drops out. Don't edit the file.

## Motion
Every hover or press movement is prefixed `motion-safe:` (e.g. `motion-safe:hover:-translate-y-px`). Never use `hover:scale-*` or `active:scale-*`.

## Contrast test
`lib/design/contrast.test.ts` reads the hex tokens from `:root` and checks: text tokens on every light surface (4.5:1), white on gradient buttons, danger and success (4.5:1), badge text on its 12% tint (4.5:1), and banner/headline stops for large text (3:1). Change a color token and run `node --test "lib/**/*.test.ts"`. Keep gradient stops and text tokens as 6-digit hex so the test can read them.
