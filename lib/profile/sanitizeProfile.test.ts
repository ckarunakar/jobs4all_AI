import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeProfile, stripForeignResumeIds } from "./sanitizeProfile.ts";
import { DEFAULT_SWIPE_PROFILE } from "../swipe/defaultProfile.ts";

const BLANK = {
  fullName: "", linkedinUrl: "", githubUrl: "", portfolioUrl: "",
  school: "", major: "", graduationDate: "", workAuthorization: "unspecified",
  locationPreferences: [], rolePreferences: [], remotePreferences: [],
  targetRoles: [], techStack: [], preferredRoleTypes: [], resumes: [],
};
test("non-objects are rejected", () => {
  for (const v of [null, undefined, [], "x", 5, true]) assert.equal(sanitizeProfile(v), null);
});
test("an empty object becomes the blank profile", () => {
  assert.deepEqual(sanitizeProfile({}), BLANK);
});
test("a partial old-shaped profile is filled with defaults, not rejected", () => {
  assert.deepEqual(sanitizeProfile({ fullName: "Ann" }), { ...BLANK, fullName: "Ann" });
});
test("the default swipe profile round-trips without its email", () => {
  assert.deepEqual(sanitizeProfile(DEFAULT_SWIPE_PROFILE), BLANK);
});
test("email and unknown keys are dropped; text is trimmed", () => {
  const p = sanitizeProfile({ email: "x@y.com", isAdmin: true, fullName: "  Ann  " })!;
  assert.equal("email" in p, false);
  assert.equal("isAdmin" in p, false);
  assert.equal(p.fullName, "Ann");
});
test("text is capped at 500 characters", () => {
  assert.equal(sanitizeProfile({ fullName: "a".repeat(600) })!.fullName.length, 500);
});
test("lists keep trimmed non-blank strings, 50 items of up to 200 characters", () => {
  const many = Array.from({ length: 60 }, (_, i) => `role ${i}`);
  assert.equal(sanitizeProfile({ targetRoles: many })!.targetRoles!.length, 50);
  assert.equal(sanitizeProfile({ techStack: ["x".repeat(300)] })!.techStack![0].length, 200);
  assert.deepEqual(sanitizeProfile({ techStack: ["Go", 5, "  ", null, " Rust "] })!.techStack, ["Go", "Rust"]);
});
test("remote preferences keep only known values, once each", () => {
  assert.deepEqual(
    sanitizeProfile({ remotePreferences: ["remote", "moon", "remote", "hybrid"] })!.remotePreferences,
    ["remote", "hybrid"],
  );
});
test("work authorization falls back to unspecified", () => {
  assert.equal(sanitizeProfile({ workAuthorization: "bogus" })!.workAuthorization, "unspecified");
  assert.equal(sanitizeProfile({ workAuthorization: "opt_cpt" })!.workAuthorization, "opt_cpt");
});
test("resumes: at most 20, id required, dbId only as a positive integer", () => {
  const r = (i: number) => ({ id: `r${i}`, label: "L", fileName: "f.pdf", uploadedAt: "2026-10-20", parsed: true });
  assert.equal(sanitizeProfile({ resumes: Array.from({ length: 25 }, (_, i) => r(i)) })!.resumes.length, 20);
  const out = sanitizeProfile({ resumes: [
    { label: "no id" }, { ...r(1), dbId: 7 }, { ...r(2), dbId: "7" }, { ...r(3), dbId: -1 }, { ...r(4), parsed: "yes" },
  ] })!.resumes;
  assert.deepEqual(out.map((x) => x.id), ["r1", "r2", "r3", "r4"]);
  assert.equal(out[0].dbId, 7);
  assert.equal("dbId" in out[1], false);
  assert.equal("dbId" in out[2], false);
  assert.equal(out[3].parsed, false);
});
test("phone and primaryResumeId are kept only as strings", () => {
  assert.equal("phone" in sanitizeProfile({ phone: 555 })!, false);
  assert.equal(sanitizeProfile({ phone: " 555 " })!.phone, "555");
  assert.equal(sanitizeProfile({ primaryResumeId: "r1" })!.primaryResumeId, "r1");
  assert.equal("primaryResumeId" in sanitizeProfile({ primaryResumeId: 5 })!, false);
});
test("stripForeignResumeIds removes only unowned dbIds and does not mutate", () => {
  const p = sanitizeProfile({ resumes: [
    { id: "a", dbId: 1 }, { id: "b", dbId: 2 }, { id: "c" },
  ] })!;
  const out = stripForeignResumeIds(p, new Set([2]));
  assert.deepEqual(out.resumes.map((x) => [x.id, x.dbId]), [["a", undefined], ["b", 2], ["c", undefined]]);
  assert.equal("dbId" in out.resumes[0], false);
  assert.equal(p.resumes[0].dbId, 1);
});
