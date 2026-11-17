import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every .ts/.tsx path under the given repo-relative dirs (recursive). */
function filesUnder(...dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p)) walk(join(p, name));
    } else if (/\.tsx?$/.test(p)) {
      out.push(p);
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

// PrivacyPolicy and DeleteAccountCard are outside this restyle's scope.
const EXCLUDED = [
  "components/legal/PrivacyPolicy.tsx",
  "components/settings/DeleteAccountCard.tsx",
];
const FILES = filesUnder("app", "components").filter(
  (f) => !f.endsWith(".test.ts") && !EXCLUDED.includes(f),
);
const offenders = (re: RegExp) => FILES.filter((f) => re.test(readFileSync(f, "utf8")));

test("no scale-on-hover or scale-on-press", () => {
  assert.deepEqual(offenders(/\b(hover|active):scale-/), []);
});
test("every hover/press movement respects reduced motion", () => {
  assert.deepEqual(offenders(/(?<!motion-safe:)\b(hover|active):-?translate-/), []);
});
test("no 2px borders", () => {
  assert.deepEqual(offenders(/\bborder(-[tblr])?-2\b/), []);
});
test("no fill colors used as text", () => {
  assert.deepEqual(offenders(/text-\[var\(--(excellent|recommended|caution|info)\)\]/), []);
});
test("no flat grid/soft backgrounds", () => {
  assert.deepEqual(offenders(/\bbg-(grid|soft)\b/), []);
});
