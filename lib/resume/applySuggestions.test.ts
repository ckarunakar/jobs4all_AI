import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSuggestions, fillToastMessage, foundNoTech, NO_TECH_FOUND_MESSAGE } from "./applySuggestions.ts";

const S = { targetRoles: ["Software Engineer", "Frontend Developer"], techStack: ["React", "TypeScript", "Node.js"] };

test("fills both fields on an empty profile", () => {
  assert.deepEqual(mergeSuggestions({ targetRoles: [], rolePreferences: [], techStack: [] }, S),
    { patch: { targetRoles: S.targetRoles, techStack: S.techStack }, filledRoles: 2, filledTech: 3 });
  assert.deepEqual(mergeSuggestions({ rolePreferences: [] }, S).patch, { targetRoles: S.targetRoles, techStack: S.techStack });
});

test("never overwrites what the user typed", () => {
  assert.deepEqual(mergeSuggestions({ targetRoles: ["Data Analyst"], rolePreferences: [], techStack: [] }, S),
    { patch: { techStack: S.techStack }, filledRoles: 0, filledTech: 3 });
  assert.deepEqual(mergeSuggestions({ targetRoles: [], rolePreferences: ["Backend"], techStack: ["Go"] }, S),
    { patch: {}, filledRoles: 0, filledTech: 0 });
});

test("empty suggestions write nothing", () => {
  assert.deepEqual(mergeSuggestions({ targetRoles: [], rolePreferences: [], techStack: [] }, { targetRoles: [], techStack: [] }),
    { patch: {}, filledRoles: 0, filledTech: 0 });
});

test("toast text matches the spec", () => {
  assert.equal(fillToastMessage(2, 3), "We filled in your target roles and skills from your résumé. You can edit them on your Profile.");
  assert.equal(fillToastMessage(2, 0), "We filled in your target roles from your résumé. You can edit them on your Profile.");
  assert.equal(fillToastMessage(0, 3), "We filled in your skills from your résumé. You can edit them on your Profile.");
  assert.equal(fillToastMessage(0, 0), null);
});

test("foundNoTech is true only when the AI answered with no roles and no tech", () => {
  assert.equal(foundNoTech({ targetRoles: [], techStack: [] }), true);
  // The AI didn't run, failed or timed out: no claim about the résumé.
  assert.equal(foundNoTech(null), false);
  assert.equal(foundNoTech(undefined), false);
  assert.equal(foundNoTech({ targetRoles: ["Data Analyst"], techStack: [] }), false);
  assert.equal(foundNoTech({ targetRoles: [], techStack: ["SQL"] }), false);
});

test("no-tech toast text", () => {
  assert.equal(NO_TECH_FOUND_MESSAGE,
    "Resume uploaded, but we couldn't find any tech roles or skills in it. You can add them on your Profile to narrow your feed.");
});
