import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Concatenated source text of the given repo-relative files and directories
 * (directories are walked recursively for .ts/.tsx files). JSX `{" "}` becomes
 * a space and whitespace collapses to single spaces, so copy split across
 * lines still matches. A missing path throws, so a typo can't pass silently.
 */
function source(...paths: string[]): string {
  const parts: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) walk(join(p, name));
    } else if (/\.tsx?$/.test(p)) {
      parts.push(readFileSync(p, "utf8"));
    }
  };
  for (const p of paths) walk(p);
  return parts
    .join("\n")
    .replace(/\{" "\}/g, " ")
    .replace(/\s+/g, " ");
}

/** Phrases from the old demo copy or overclaims that must not come back. */
const STALE = [
  "location and score",
  "every time you look at a job",
  "We read your skills",
  "Every job gets one score",
  "Sort your saved jobs by fit",
  "then sign up to keep your progress",
  "Together they become your career profile",
  "AI scores each tech job",
  "Your scores get sharper",
  "No. You can browse",
  "fill in your profile: skills, target roles and locations",
  "add a PDF or .docx and fill in your job preferences",
];

test("no stale demo copy or overclaims anywhere on the public pages", () => {
  const all = source("app/(marketing)", "components/marketing");
  for (const s of STALE) assert.ok(!all.includes(s), `stale: ${s}`);
  assert.ok(!/top 10/i.test(all), "no 'top 10'");
});

test("landing carries the corrected copy", () => {
  const s = source("app/(marketing)/page.tsx", "components/marketing/landing");
  for (const t of [
    "Know Your Job",
    "Matching Score.",
    "Find Your Fit.",
    "AI-POWERED CAREER MATCHING",
    "Find My Matches",
    "Set Up Profile",
    "Personalized job scores",
    "Skills gap insights",
    "You choose when to apply",
    "Filter fit",
    "Narrow jobs by skills, city, type and date",
    "1.0–5.0",
    "Explainable fit score",
    "One résumé",
    "Build your career profile",
    "All devices",
    "Website, Android and iPhone",
  ])
    assert.ok(s.includes(t), `missing: ${t}`);
});

test("AI Tools carries the corrected copy and reads tiers from SCORE_BANDS", () => {
  const s = source("app/(marketing)/ai-tools");
  for (const t of [
    "Four tools work together to find the jobs worth your time. Here is what each one does, and what it never does.",
    "Upload your résumé and the AI suggests your target roles and skills. Check them, add your locations, and the AI reads both every time it scores a job for you.",
    "Once your résumé is uploaded, ask the AI to score a job, or the next 10 at once. 4.0 and up is worth applying; 4.5 and up is an excellent fit.",
    "Narrow the feed by skills, city, job type and date posted, or let your profile preferences filter for you. Then filter your applications by fit.",
    "The AI scores and explains. You decide.",
    "Nothing is ever applied automatically.",
    "Up to 5 MB",
    "SCORE_BANDS",
  ])
    assert.ok(s.includes(t), `missing: ${t}`);
  assert.ok(
    !s.includes("Not recommended") && !s.includes("Possible"),
    "tier labels must come from SCORE_BANDS",
  );
});

test("How It Works carries the corrected copy and reads the scale from SCORE_BANDS", () => {
  const s = source("app/(marketing)/how-it-works", "components/marketing/ScoreScale.tsx");
  for (const t of [
    "No account needed to start: browse and swipe as a guest. Sign up and add your résumé to see your fit scores.",
    "Create an account and add a PDF or .docx. The AI suggests your target roles and skills from it; check them and add your locations. That’s your career profile.",
    "Ask the AI to score a job, or the next 10 at once. Each gets a 1.0–5.0 score with the reasons behind it.",
    "Start swiping now as a guest. Sign up and add your résumé to see your fit scores.",
    "4.0 is where we recommend applying.", "SCORE_BANDS"])
    assert.ok(s.includes(t), `missing: ${t}`);
  assert.ok(!s.includes("Not recommended") && !s.includes("Possible"), "tier labels must come from SCORE_BANDS");
});

test("FAQ carries the corrected copy", () => {
  const s = source("app/(marketing)/faq");
  for (const t of [
    "Not to look around: you can browse and swipe as a guest. To see fit scores, create an account and upload your résumé.",
    "When you upload your résumé, we send its text to one of our AI providers, Anthropic or DeepSeek, to suggest target roles and skills for your profile.",
    "PDF or Word (.docx), up to 5 MB.", "Anthropic or DeepSeek", "Android and iPhone apps are on the way.",
    "Go to Settings and choose Delete account, then confirm.", "Still have a question?", "/support", "/privacy"])
    assert.ok(s.includes(t), `missing: ${t}`);
});
