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
