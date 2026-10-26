import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOwner,
  isProfileFilled,
  decideProfileSync,
  createProfileSaver,
  type LocalProfileState,
  type ServerProfileResult,
  type ProfileSaveJob,
  type ProfileSaveBody,
} from "./profileSync.ts";
import { DEFAULT_SWIPE_PROFILE } from "../swipe/defaultProfile.ts";

const A = "a@x.com", B = "b@x.com";
const filled = { ...DEFAULT_SWIPE_PROFILE, school: "U" };
const local = (o: Partial<LocalProfileState>): LocalProfileState => ({ profile: filled, owner: A, dirty: false, ...o });
const found: ServerProfileResult = { kind: "found", profile: DEFAULT_SWIPE_PROFILE, prefFilters: true };
const none: ServerProfileResult = { kind: "none", prefFilters: true };
const error: ServerProfileResult = { kind: "error" };

test("resolveOwner: stored owner wins, even when blank", () => {
  assert.equal(resolveOwner("Bob@X.com", "a@x.com"), "bob@x.com");
  assert.equal(resolveOwner("", "a@x.com"), "");
});
test("resolveOwner: legacy data falls back to the stamped profile email", () => {
  assert.equal(resolveOwner(undefined, " A@X.com "), "a@x.com");
  assert.equal(resolveOwner(undefined, undefined), "");
});
test("isProfileFilled", () => {
  assert.equal(isProfileFilled(null), false);
  assert.equal(isProfileFilled(DEFAULT_SWIPE_PROFILE), false);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, email: "a@x.com" }), false);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, fullName: "   " }), false);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, workAuthorization: "us_citizen" }), true);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, techStack: ["Go"] }), true);
  assert.equal(isProfileFilled({ ...DEFAULT_SWIPE_PROFILE, resumes: [{ id: "r", label: "", fileName: "", uploadedAt: "", parsed: false }] }), true);
});
test("decide: server profile exists", () => {
  assert.equal(decideProfileSync(local({ dirty: true }), found, A), "upload-local");
  assert.equal(decideProfileSync(local({ dirty: true, owner: "" }), found, A), "use-server");
  assert.equal(decideProfileSync(local({ dirty: false }), found, A), "use-server");
  assert.equal(decideProfileSync(local({ dirty: true, owner: B }), found, A), "use-server");
});
test("decide: no server profile (one-time copy-up and the shared-computer guard)", () => {
  assert.equal(decideProfileSync(local({ owner: "" }), none, A), "upload-local");
  assert.equal(decideProfileSync(local({ owner: A }), none, A), "upload-local");
  assert.equal(decideProfileSync(local({ owner: B }), none, A), "start-blank");
  assert.equal(decideProfileSync(local({ owner: "", profile: DEFAULT_SWIPE_PROFILE }), none, A), "start-blank");
  assert.equal(decideProfileSync(local({ owner: "", profile: null }), none, A), "start-blank");
});
test("decide: server unreachable never shows another account's profile", () => {
  assert.equal(decideProfileSync(local({ owner: "" }), error, A), "use-local");
  assert.equal(decideProfileSync(local({ owner: A }), error, A), "use-local");
  assert.equal(decideProfileSync(local({ owner: B }), error, A), "start-blank");
});

// ---- saver ----

afterEach(() => mock.timers.reset());

const job = (v: number, account = A): ProfileSaveJob => ({
  account,
  version: v,
  body: { profile: { ...DEFAULT_SWIPE_PROFILE, school: `v${v}` }, prefFilters: true, expectedEmail: account },
});
const settle = () => new Promise<void>((r) => setImmediate(r));

function deferred() {
  let resolve!: (v: boolean) => void;
  const promise = new Promise<boolean>((r) => { resolve = r; });
  return { promise, resolve };
}

function harness(opts: { account?: string; send?: (b: ProfileSaveBody, k: boolean) => Promise<boolean> } = {}) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const sends: [string, boolean][] = [];
  const saved: number[] = [];
  const state = { account: opts.account ?? A };
  const saver = createProfileSaver({
    send: (body, keepalive) => {
      sends.push([body.profile.school, keepalive]);
      return opts.send ? opts.send(body, keepalive) : Promise.resolve(true);
    },
    currentAccount: () => state.account,
    onSaved: (j) => { saved.push(j.version); },
  });
  return { saver, sends, saved, state };
}

test("saver coalesces edits inside the delay into one save of the newest body", async () => {
  const h = harness();
  h.saver.schedule(job(1));
  mock.timers.tick(500);
  h.saver.schedule(job(2));
  mock.timers.tick(999);
  assert.equal(h.sends.length, 0);
  mock.timers.tick(1);
  await settle();
  assert.deepEqual(h.sends, [["v2", false]]);
  assert.deepEqual(h.saved, [2]);
});

test("saver never overlaps saves and sends the newer edit after the in-flight one settles", async () => {
  const ds = [deferred(), deferred()];
  let n = 0;
  const h = harness({ send: () => ds[n++].promise });
  h.saver.schedule(job(1));
  mock.timers.tick(1000);
  assert.equal(h.sends.length, 1);
  h.saver.schedule(job(2));
  mock.timers.tick(1000);
  await settle();
  assert.equal(h.sends.length, 1);
  ds[0].resolve(true);
  await settle();
  assert.deepEqual(h.saved, [1]);
  assert.deepEqual(h.sends, [["v1", false], ["v2", false]]);
  ds[1].resolve(true);
  await settle();
  assert.deepEqual(h.saved, [1, 2]);
});

test("saver drops a save when the signed-in account changed before sending", async () => {
  const h = harness({ account: B });
  h.saver.schedule(job(1, A));
  mock.timers.tick(1000);
  await settle();
  assert.equal(h.sends.length, 0);
  assert.deepEqual(h.saved, []);
});

test("saver ignores the response when the account changed while in flight", async () => {
  const d = deferred();
  const h = harness({ send: () => d.promise });
  h.saver.schedule(job(1));
  mock.timers.tick(1000);
  assert.equal(h.sends.length, 1);
  h.state.account = B;
  d.resolve(true);
  await settle();
  assert.deepEqual(h.saved, []);
});

test("saver does not retry a failed save on its own", async () => {
  const h = harness({ send: () => Promise.resolve(false) });
  h.saver.schedule(job(1));
  mock.timers.tick(1000);
  await settle();
  mock.timers.tick(10000);
  await settle();
  assert.equal(h.sends.length, 1);
  assert.deepEqual(h.saved, []);
});

test("saver treats a rejected send like a failed save", async () => {
  const h = harness({ send: () => Promise.reject(new Error("net")) });
  h.saver.schedule(job(1));
  mock.timers.tick(1000);
  await settle();
  mock.timers.tick(10000);
  await settle();
  assert.equal(h.sends.length, 1);
  assert.deepEqual(h.saved, []);
});

test("flush sends the waiting edit at once with keepalive", async () => {
  const h = harness();
  h.saver.schedule(job(1));
  h.saver.flush(true);
  assert.deepEqual(h.sends, [["v1", true]]);
  mock.timers.tick(1000);
  await settle();
  assert.equal(h.sends.length, 1);
  assert.deepEqual(h.saved, [1]); // nothing else was in flight, so it is confirmed
});

test("a flush during an in-flight save is re-sent once both settle, and that re-send is confirmed", async () => {
  const ds = [deferred(), deferred(), deferred()];
  let n = 0;
  const h = harness({ send: () => ds[n++].promise });
  h.saver.schedule(job(1));
  mock.timers.tick(1000);
  h.saver.schedule(job(2));
  h.saver.flush(true);
  assert.deepEqual(h.sends, [["v1", false], ["v2", true]]);
  ds[0].resolve(true);
  ds[1].resolve(true);
  await settle();
  assert.deepEqual(h.saved, [1]); // the overlapped flush itself is not confirmed
  assert.deepEqual(h.sends, [["v1", false], ["v2", true], ["v2", false]]);
  ds[2].resolve(true);
  await settle();
  assert.deepEqual(h.saved, [1, 2]);
});

test("an overlapped flush is not re-sent when a newer edit was scheduled", async () => {
  const ds = [deferred(), deferred(), deferred()];
  let n = 0;
  const h = harness({ send: () => ds[n++].promise });
  h.saver.schedule(job(1));
  mock.timers.tick(1000);
  h.saver.schedule(job(2));
  h.saver.flush(true);
  h.saver.schedule(job(3));
  ds[0].resolve(true);
  ds[1].resolve(true);
  await settle();
  mock.timers.tick(1000);
  await settle();
  assert.deepEqual(h.sends, [["v1", false], ["v2", true], ["v3", false]]);
  ds[2].resolve(true);
  await settle();
  assert.deepEqual(h.saved, [1, 3]);
});

test("an overlapped flush is not re-sent after the account changed", async () => {
  const ds = [deferred(), deferred()];
  let n = 0;
  const h = harness({ send: () => ds[n++].promise });
  h.saver.schedule(job(1));
  mock.timers.tick(1000);
  h.saver.schedule(job(2));
  h.saver.flush(true);
  h.state.account = B;
  ds[0].resolve(true);
  ds[1].resolve(true);
  await settle();
  assert.equal(h.sends.length, 2);
  assert.deepEqual(h.saved, []);
});

test("an overlapped flush is not re-sent after cancel", async () => {
  const ds = [deferred(), deferred()];
  let n = 0;
  const h = harness({ send: () => ds[n++].promise });
  h.saver.schedule(job(1));
  mock.timers.tick(1000);
  h.saver.schedule(job(2));
  h.saver.flush(true);
  h.saver.cancel();
  ds[0].resolve(true);
  ds[1].resolve(true);
  await settle();
  assert.equal(h.sends.length, 2);
  assert.deepEqual(h.saved, [1]);
});

test("cancel drops a waiting edit", async () => {
  const h = harness();
  h.saver.schedule(job(1));
  h.saver.cancel();
  mock.timers.tick(1000);
  await settle();
  assert.equal(h.sends.length, 0);
});
