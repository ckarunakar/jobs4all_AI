import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSuggestions, fillToastMessage } from "./applySuggestions.ts";

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
