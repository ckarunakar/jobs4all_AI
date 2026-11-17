# Site redesign: gradient look, new logo, public pages

**Date:** 2026-11-16 · **Branch:** `feat/landing-redesign` (from `main`) · **Delivery:** one PR, merged to `main`

## Why

ITJobCafe supplied a mockup of a new landing page (made by someone outside the team) and wants
essentially that exact look for the whole site. The mockup's copy was written without knowledge
of the app, so it is corrected wherever it would promise something the app doesn't do. A set of
demo pages built from the mockup (landing, AI Tools, How It Works, FAQ, a button sheet and the
swipe screen) was reviewed and approved; this document records everything in them that a builder
needs.

**Reference material (local only, not committed):** `.superpowers/redesign-demo/` (git-ignored)
holds the client mockup (`client-mockup.png`) and the approved demo sources (`Main`, `AiTools`,
`HowItWorks`, `Faq`, `Buttons`, `SwipeScreen` `.dc.html`). They are HTML with inline styles plus
a small templating layer (`<x-dc>`, `{{holes}}`). Read them for geometry, spacing and the
illustration's construction, which this document only describes in prose. Where the copy in this
document differs from the demos, **this document wins**: some demo text was corrected for accuracy
after the review.

## Goals

1. The landing page (`/`) matches the mockup's look: logo header with five nav links and a
   gradient sign-in button, a full-width gradient tagline banner, a two-column hero with a big
   gradient headline and an illustrated score panel, and a four-item stats strip.
2. The nav links all work: **Home** `/`, **Find Matches** `/swipe`, **AI Tools** `/ai-tools`,
   **How It Works** `/how-it-works`, **FAQ** `/faq`. The last three are new pages.
3. Every app screen (swipe, dashboard, applications, profile, settings, login, signup, privacy,
   support, and their dialogs) gets the same visual style. Layouts stay as they are.
4. The new logo image (`itjclogo.png`, currently untracked at the repo root) replaces the old
   icon-plus-text logo everywhere.

## Non-goals

- Changing any screen's layout, behavior, data, API or scoring. This is a visual restyle plus
  three static content pages.
- Dark mode (the app is light-only and stays that way).
- Favicon and app icons.
- New animation beyond hover/press feedback.
- Styling the future Expo app (it will copy this style later from the rewritten style guide).
- FAQ answers for "Is it free?" and "Where do the jobs come from?" (unknown; left out).

## Anti-goals (failure even if it "works")

- The marketing pages promising things the app doesn't do: percentage scores, a "top 10" list,
  automatic applying.
- Text on gradients or tints that fails contrast.
- Swiping that feels worse: the swipe card's drag, stamps and fly-out must behave exactly as now.
- Merge conflicts with `feat/server-side-profile` caused by needless edits to the files it
  touches (`components/legal/PrivacyPolicy.tsx`, `components/settings/DeleteAccountCard.tsx`,
  `app/api/profile/route.ts`).

## Constraints

- **Next.js 16.2.9** with React 19 and Tailwind v4. Per `AGENTS.md`, read the relevant guide in
  `node_modules/next/dist/docs/` before writing code. Known differences that matter here:
  `next/image`'s `priority` is deprecated (use `preload`, or `loading="eager"` /
  `fetchPriority="high"`); route groups `(name)` work as usual (`app/(marketing)/...`), and two
  groups must not resolve to the same URL, so `app/page.tsx` must go when
  `app/(marketing)/page.tsx` arrives.
- No new dependencies. Icons come from `lucide-react`; `framer-motion` is already present.
- Font stays **Outfit** (already loaded in `app/layout.tsx`, weights 400–800).
- All text meets WCAG AA: 4.5:1, or 3:1 for large text (24px+, or 18.66px+ bold).
- The repo is public. Commits, comments, docs and PR text must not discuss unpatched security
  issues.
- Hover lifts and transitions respect `prefers-reduced-motion`.

## Approaches considered

1. **Restyle the shared pieces first, then polish each screen. Chosen.** Change the theme tokens
   in `app/globals.css` and the shared components (`components/ui/*`, the app shell, bottom tabs,
   score meter) once so every screen moves together, then a per-screen pass for screen-specific
   touches. One source of truth the Expo app can later copy. Risk: a shared change hits every
   screen at once, so every screen gets a browser pass before the PR.
2. **Screen by screen, shared pieces untouched.** Lower risk per change, but the same styling gets
   copied into dozens of places and drifts; no single source for the Expo app. Rejected.
3. **New look on the public pages only; app screens just get new colors.** Smallest, but not what
   was asked: the app would still look like the old flat design. Rejected.

## Visual language

These values come from the approved demos. Token and utility names are the builder's call.

| Thing | Value |
|---|---|
| Heading text (foreground) | `#141a3a` |
| Body text | `#4b5268` · secondary text `#636a82` |
| Accent purple (links, active nav, eyebrow) | `#5b45d6` (active/hover), `#4c3fc4` (links, stat values), `#6b46c1` (eyebrow pill text) |
| Hairline borders | `#ece7f7` (cards, sections), `#e6e1f5` (white buttons, inputs) |
| **Button gradient** | 90° `#2563eb → #7c3aed` (see "Calls" for why these are deeper than the demo's `#3b82f6 → #8b5cf6`) |
| Banner gradient | 90° `#4fb3e0 0% → #5a74e2 32% → #8b5bd6 66% → #d862a6 100%`, white bold text. Tune stops or text size so the text passes contrast where it sits. |
| Headline gradient text | 90° `#3b82f6 → #6d5ce8 42% → #ae4fca 74% → #e0569a` (large text only) |
| Page wash (hero, app background) | 115° `#f8f2fc 0% → #f4f1fc 45% → #edf3fd 100%` |
| Card | white, radius 20–24px, 1px `#ece7f7`, shadow `0 20px 40px -28px rgba(60,40,140,.35)` |
| Primary button | gradient, white bold text, radius 12px (14px at hero size), shadow `0 14px 28px -10px rgba(99,102,241,.6)`; hover lifts 1px + slightly brighter + deeper shadow; pressed sinks 1px, smaller shadow; disabled 45% opacity, no shadow |
| White button | white, 1.5px `#e6e1f5` border, text `#2e2a6b`, shadow `0 8px 20px -12px rgba(60,40,120,.35)`; hover lifts, border `#c9bff0` |
| Danger button | white, 1.5px `#f3c7c7` border, red text (`#c0392b`-ish, must pass AA) |
| Ghost / link | no fill, purple `#4c3fc4` text |
| Pills / tags | fully rounded; tinted backgrounds (`#eef2ff` text `#3730a3`; `#f4f2fb` text `#4b5268`) |
| Focus | visible 2px purple ring with offset on every interactive element |

**Score colors.** Keep the existing tier fills (`--excellent`, `--recommended`, `--caution`,
`--low`) for bars and rings, but render score *text* in darker shades so it passes contrast
(e.g. emerald-700, green-700, amber-700, gray-600). The score meter bar becomes a short gradient
within the tier's color (light to dark), on a white/tinted track.

## Shared pieces

- **`app/globals.css`**: replace the flat tokens with the values above; add tokens/utilities for
  the brand gradient, banner gradient, headline gradient text, page wash, and the two shadows.
  Remove `.bg-grid` / `.bg-soft` if nothing uses them afterward. Update the header comment.
- **`types/design.md`**: rewrite it as the new style guide (it currently mandates the flat
  "no shadows, no gradients" look, which this redesign reverses). `globals.css` points to it.
- **`components/ui/button.tsx`**: keep every variant and size name so callers don't change.
  `primary` = gradient; `secondary` and `outline` = white button; `danger` = danger button;
  `ghost`/`link` = purple text. Replace the current `hover:scale` with the lift.
- **`card.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `checkbox.tsx`,
  `dialog.tsx`, `toast.tsx`, `skeleton.tsx`**: restyle to the table (rounder, hairline borders,
  soft tinted shadows; dialogs get a large radius and a soft navy backdrop; skeleton pulses a
  pale lavender). `Badge` keeps its variant names; `primary` becomes a blue-to-violet tint.
- **`components/layout/Logo.tsx`**: render the logo image with `next/image`, alt "ITJobCafé".
  Move the file to `public/brand/itjobcafe-logo.png` (230×64). Sizes: 52px tall in the site
  header, 30px in the app top bar, 34px in the footer, about 44px on login/signup. Drop the
  `showWordmark` prop and update its callers. The file is small, so it may look slightly soft on
  high-density screens; swap in a larger file or an SVG if ITJobCafe provides one.
  **The PNG has an opaque white background** (no transparent pixels). On white surfaces that's
  invisible; wherever the logo sits on a tinted or gradient surface (login/signup on the page
  wash, the slightly translucent app top bar), apply `mix-blend-mode: multiply` so the white
  drops out. Don't edit the image file.

## Public pages

### Shared frame: `app/(marketing)/layout.tsx`

Wraps `/`, `/ai-tools`, `/how-it-works`, `/faq`, and also `/privacy` and `/support` (moved into
the group; URLs unchanged; `LegalPage` keeps only its content frame and drops its own logo/links).

- **Header** (white, sticky, bottom hairline): logo left (links to `/`); nav right with the five
  links (15px, semibold, `#1b2140`; hover purple). The current page's link is purple and bold
  with a 2.5px violet underline (`aria-current="page"`). Then the gradient button:
  signed out "Sign in / Sign up →" to `/login`; signed in "Open the app →" to `/swipe`.
- **Narrow screens**: below the width where the nav fits on one line, the links and button
  collapse behind a menu button (`aria-expanded`, closes on Escape and on navigation). The
  breakpoint and panel style are the builder's call.
- **Banner** under the header (scrolls away): "✦ Your skills. Your score. Your next big move. ✦"
- **Footer**: logo (34px), "AI-ranked job discovery for tech careers", links Privacy policy and
  Support.

### `/` landing (replaces `app/page.tsx` and `components/landing/Landing.tsx`)

Hero on the page wash, with faint decoration (a large pale-lavender ring bottom-left, a soft pink
rounded blob top-right behind the illustration). Two columns on wide screens, stacked on narrow.

Left column:
- Eyebrow pill (white, hairline, small soft shadow): "✦ AI-POWERED CAREER MATCHING" (12px, 800,
  0.12em tracking, `#6b46c1`).
- H1 (Outfit 800, about 78px at desktop, tight leading and tracking), three lines:
  "Know Your Job" / **"Matching Score."** in the headline gradient / "Find Your Fit."
- Paragraph (19px): "Upload your résumé once. Discover your **best-fit tech jobs**, see why each
  role fits, and build your career with confidence."
- Buttons: primary "Find My Matches ↗" to `/swipe`; white "Set Up Profile →" to `/profile`
  (guests get sent to login by the existing protected layout; that's fine).
- Check row (green checks): "Personalized job scores" · "Skills gap insights" · "You choose when
  to apply".

Right column, the illustration (built in markup/CSS/inline SVG, no image files; one
`role="img"` with an `aria-label` describing it; decoration inside is `aria-hidden`):
- White 7px frame, radius about 30px, deep shadow. Inside: a blue panel
  (145° `#2a5ad6 → #1f49bd → #142f8c`) with soft lighter-blue wave shapes and a dot grid in the
  bottom-right corner.
- Left: a stacked résumé card (light blue gradient, white border; a white "document" with a person
  icon and three lines; under it a dashed upload box with an upload arrow), with a second card
  peeking behind it.
- A connector line to a round node with a briefcase icon, then a vertical branch to three rows.
- Three glassy light-blue rows, each with a line icon (laptop, people, target), two placeholder
  bars, and a score ring: **5.0** (full ring), **4.0** (three-quarter ring), **2.0**
  (quarter ring). Rings fill on the app's own scale, `(score − 1) / 4`. Ring color: blue
  `#2563eb` for all three on a pale-blue track.
- Floating white card overlapping the frame's bottom-left: "**5.0**" (big, dark green) /
  "Excellent fit" / "See your job-fit insights" with a ↗ arrow; links to `/swipe`.
- It must still read at a 360px-wide screen; simplifying it there (e.g. hiding the bars) is the
  builder's call.

Stats strip under the hero (white, hairlines above and below, four columns with dividers, wraps
on narrow screens). Value (25px, 700, `#4c3fc4`) over label (14px, `#636a82`):
- "Filter fit" / "Narrow jobs by skills, city, type and date"
- "1.0–5.0" / "Explainable fit score"
- "One résumé" / "Build your career profile"
- "All devices" / "Website, Android and iPhone" (kept on purpose; the apps are coming)

Then the footer. Nothing else on the landing page.

### `/ai-tools`

Shorter hero on the page wash: eyebrow "✦ AI TOOLS"; H1 "The AI behind your" / "matching
score." (gradient); paragraph "Four tools work together to find the jobs worth your time. Here
is what each one does, and what it never does."

Four cards (2×2, stack on narrow), each with a gradient icon tile, title, body, a small visual
and a link:
1. **Résumé reader** (file icon). "Upload your résumé and fill in your profile: skills, target
   roles and locations. The AI reads both every time it scores a job for you." Pills: PDF ·
   Word (.docx) · Up to 5 MB. Link "Set Up Profile →" to `/profile`.
2. **Fit score, 1.0 to 5.0** (gauge icon). "Once your résumé is uploaded, ask the AI to score a
   job, or the next 10 at once. 4.0 and up is worth applying; 4.5 and up is an excellent fit."
   Tier pills: 4.5+
   Excellent · 4.0+ Strong · 3.5+ Good · 3.0+ Possible · 2.5+ Weak · Below 2.5 Not
   recommended. Link "Find My Matches ↗" to `/swipe`.
3. **Strengths and skill gaps** (list-check icon). "See why a job scored the way it did: the
   strengths that match, the gaps to close, and anything to watch for before you apply."
   A sample box with one green strength and one amber warning (illustrative). Link
   "See it on a real job ↗" to `/swipe`.
4. **Smart filters** (sliders icon). "Narrow the feed by skills, city, job type and date
   posted, or let your profile preferences filter for you. Then filter your applications by
   fit."
   Pills: Skills: Java + React · City · Job type · Past 7 days · Use my preferences. Link
   "Try the filters ↗" to `/swipe`.

Then a dark navy band (120° `#141a3a → #23286a → #3b2a7a`) with a shield-check tile:
"The AI scores and explains. You decide." / "Nothing is ever applied automatically. Swiping
right means “review and apply”, and you submit every application yourself."

The tier thresholds and labels must come from `lib/careerOps/scoreUtils.ts`, not be retyped,
so they can't drift.

### `/how-it-works`

Hero: eyebrow "✦ HOW IT WORKS"; H1 "From résumé to **right fit**" (gradient) / "in four steps.";
paragraph "No account needed to start: browse and swipe as a guest. Sign up and add your résumé
to see your fit scores."

Four step cards with numbered gradient circles:
1. **Upload your résumé**: "Create an account, add a PDF or .docx and fill in your job
   preferences. That’s your career profile."
2. **Get your fit scores**: "Ask the AI to score a job, or the next 10 at once. Each gets a
   1.0–5.0 score with the reasons behind it."
3. **Swipe and filter**: "Swipe right on jobs you like, left to skip, or save for later. Filter
   by skills, city, type and date."
4. **Review and apply**: "Work through the checklist, then apply on the employer’s site when
   you’re ready. Track every job in Applications."

"Reading your score" section: a horizontal 1.0–5.0 bar split at 2.5 / 3.0 / 3.5 / 4.0 / 4.5
(gray, darker gray, light amber, amber, light green, emerald), labels under each segment
(Not recommended 1.0–2.4, Weak 2.5+, Possible 3.0+, Good 3.5+, Strong 4.0+, Excellent 4.5+),
caption "4.0 is where we recommend applying. Below that, read the gaps before you spend your
time." Thresholds from `scoreUtils.ts`. One `role="img"` with a text description.

Closing band in the banner gradient: "Ready to find your fit?" / "Start swiping now as a guest.
Sign up and add your résumé to see your fit scores." with a white "Find My Matches ↗" and a
white-outline
"Set Up Profile →".

### `/faq`

Hero: eyebrow "✦ FAQ"; H1 "Questions, **answered.**" (gradient). Then expandable white cards
(native `<details>`/`<summary>`, first one open):
1. **What is a matching score?** A score from 1.0 to 5.0 for how well a job fits your résumé and
   preferences. 4.0 and up is worth applying, and 4.5 and up is an excellent fit. Every score
   comes with the strengths and gaps behind it.
2. **Do I need an account?** Not to look around: you can browse and swipe as a guest. To see
   fit scores, create an account and upload your résumé. Your account also saves your profile
   and progress, and what you did as a guest comes with you.
3. **Does ITJobCafé apply to jobs for me?** Never. Swiping right means you are interested. You
   review each job and submit the application yourself on the employer’s site.
4. **What résumé files can I upload?** PDF or Word (.docx), up to 5 MB.
5. **Who sees my résumé?** To score a job, we send your résumé text, your profile details and
   the job description to one of our AI scoring providers, Anthropic or DeepSeek. We don’t sell
   your information or show ads. The privacy policy (link to `/privacy`) has the details.
6. **Is there a mobile app?** Android and iPhone apps are on the way. Until then, the website
   works on any phone.
7. **How do I delete my account?** Go to Settings and choose Delete account, then confirm. This
   removes your account and everything saved with it.

Then a tinted box "Still have a question?" with a gradient "Contact support →" to `/support`.

Answers 4 and 5 must stay true to `app/api/resume-upload/route.ts` and the privacy policy; if
either changes before merge, update the FAQ.

### Metadata

Each new page sets its own title. The root title/description change to the new message, e.g.
"ITJobCafé — Know your job matching score" and a description drawn from the hero paragraph.

## App screens (same layouts, new look)

- **App background**: the page wash instead of white.
- **`SwipeShell` top bar**: white, logo image (30px, links to `/`), a 3px banner-gradient line
  under the bar. Filters (white button with sliders icon), Reset (ghost), Log in (small gradient
  button, guests only). Drop the "Swipe" badge; the active tab already says where you are.
- **`MobileNav` bottom tabs**: white with a soft upward shadow and a top hairline; the active tab
  is purple bold text with a blue-to-violet tinted pill behind its icon.
- **Swipe card** (`SwipeJobCard`): white, radius about 24px, soft deep shadow; keep the company
  color strip on top (it's data). Meta badges as pills (job type in the blue-to-violet tint).
  Score panel tinted (120° `#eef4ff → #f3efff`) with "✦ AI SCORED", tier label and number in
  the tier's dark shade, and the gradient-in-tier bar. Strengths with green thumbs-up, warning
  in amber-700, skill tags as tinted pills. Drag stamps restyled to match.
- **Swipe actions** (`SwipeActionButtons`): white circles with tinted borders and soft shadows,
  Skip red (56px), Save blue (48px), Details gray (48px), Interested as a gradient circle (56px);
  "Review & apply" full-width gradient button.
- **Dashboard, Applications, Profile, Settings, dialogs, empty states, banners, toasts**: pick
  up the shared pieces; adjust any one-off colors, borders (`border-2`) or hard-coded hex values
  so nothing still looks flat.
- **Login / Signup**: page wash background, logo (about 44px, links to `/`), white card with the
  card shadow and a larger radius, gradient submit button. No site nav.
- **Privacy / Support**: inside the marketing frame (above), content in a readable column.

## Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean. (`main` has no `npm test`
  script; that arrives with a different branch.)
- Screenshots of the public pages and the swipe screen at both widths, compared side by side
  with the demo reference in `.superpowers/redesign-demo/`; differences fixed or listed in the
  hand-over.
- A browser pass of every route at about 1440px and 390px wide, signed out and signed in
  (`/`, `/ai-tools`, `/how-it-works`, `/faq`, `/privacy`, `/support`, `/login`, `/signup`,
  `/swipe`, `/dashboard`, `/applications`, `/profile`, `/settings`), opening each dialog
  (filters, job details, review & apply, delete account), swiping a few cards by drag and by
  button, and tabbing through each page to check focus rings.
- Contrast checked for: banner text, gradient button text, score text, secondary text.

## Delivery

One PR from `feat/landing-redesign` to `main`, then merged (the owner asked for the merge so
`main` is ready to deploy). Commit the logo under `public/brand/`. Don't commit the leftover
untracked `scripts/store-sync-harness/` files. This change adds no database, environment or
server steps of its own. `main` already carries earlier merged work that hasn't been deployed
yet, with its own deploy notes (for example the `mssql` note in `next.config.ts`); the PR text
should say this change adds nothing to that list, not that deploying `main` is "just a rebuild".

**Merge order:** this branch merges on its own, from `main`. `feat/server-side-profile` stays a
separate branch and will merge later; keeping edits out of the three files it touches (see
Anti-goals) keeps that merge clean.

## Calls made without explicit sign-off (flagged for review)

- **Button gradient deepened** to `#2563eb → #7c3aed` from the demo's `#3b82f6 → #8b5cf6`:
  white text on the demo's lighter blue is about 3.7:1 and fails AA. The look stays close.
- **Score text in darker tier shades** (fills unchanged), for the same contrast reason.
- **Ring color** stays the mockup's blue for all three rings (the demo also offered the app's
  tier colors).
- **The landing page carries only what the mockup shows**; the old feature sections move to
  AI Tools and How It Works.
- **Header is sticky; the banner scrolls away.** Active link gets a purple underline (not in
  the mockup).
- **"Swipe" badge dropped** from the app top bar.
- **Privacy and Support move into the marketing frame** so every public page shares one header.
- **Login/Signup keep a minimal frame** (logo only, no nav).
- **New copy says "ITJobCafé"** to match the logo; existing legal text is left as is.
- **Footer tagline** follows the mockup's broader audience ("for tech careers") instead of
  "students and new grads".
- **Copy corrected after the demos were approved**, so nothing promises more than the app does:
  scores need an account and an uploaded résumé (guests see a blurred meter); scoring happens on
  request (one job or the next 10), not automatically; the profile is filled in by the user, not
  extracted from the résumé; nothing sorts saved jobs by fit (Applications filters by fit, the
  Dashboard lists top matches); the feed can't be filtered by score. Changed: stats-strip label,
  AI Tools intro and cards 1, 2 and 4, How It Works intro, steps 1–2 and closing band, FAQ 2.
- **Logo on tinted surfaces uses a multiply blend** instead of an edited image.
- **Implementation details settled during review:** export a tier table from
  `lib/careerOps/scoreUtils.ts` (no behavior change) so pages read thresholds and labels from
  it; add the two extra shades the six-segment score bar needs; keep the clickable floating
  "5.0" card outside the illustration's `role="img"` so screen readers reach the link; leave the
  draft banner inside `PrivacyPolicy.tsx` as it is.

## Left to the builder

Token and utility names; component file splits; the nav collapse breakpoint and menu panel;
how the illustration simplifies at narrow widths; banner gradient stop tuning for contrast;
exact shadow values within the spirit above; commit granularity.
