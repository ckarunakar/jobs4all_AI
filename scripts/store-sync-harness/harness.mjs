// Store sync harness: runs the real SwipeStoreProvider (lib/swipe/swipeStore.tsx,
// transpiled into ./out by build.mjs) under react-dom in Node, with a tiny DOM
// shim, a fake /api/profile server (cookie account, delays, failures, 409 on an
// expectedEmail mismatch) and a localStorage that logs every write. Each
// scenario checks what is rendered, what is PUT and what is stored. Timers are
// real (the 1 s save delay), so a full run takes 1-2 minutes; it is not part
// of `npm test`.
//
// Run all scenarios (exits 1 on any failed check):
//   npm run test:store
// Run only some scenario ids:
//   node scripts/store-sync-harness/build.mjs && NODE_ENV=development node \
//     --import ./scripts/store-sync-harness/register.mjs \
//     scripts/store-sync-harness/harness.mjs 9,X1,X2

// ---------- DOM shim ----------
function makeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn({ type });
    },
  };
}
const document = { ...makeTarget(), nodeType: 9, visibilityState: "visible" };
const win = { ...makeTarget(), document, event: undefined, HTMLIFrameElement: class {} };
globalThis.window = win;
globalThis.document = document;

const T0 = Date.now();
const now = () => Date.now() - T0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- localStorage ----------
const KEY = "itjobcafe.swipe.v2";
const store = new Map();
let writes = [];
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    store.set(k, String(v));
    if (k === KEY) writes.push({ t: now(), v: JSON.parse(v) });
  },
  removeItem: (k) => store.delete(k),
};
const setBlob = (v) => store.set(KEY, JSON.stringify(v));
const getBlob = () => JSON.parse(store.get(KEY) ?? "null");

// ---------- fake server ----------
let calls = [];
let server;
function resetServer(over = {}) {
  server = {
    cookieEmail: "a@example.com",
    profiles: {},
    prefFilters: {},
    getMode: "ok",
    getDelay: 0,
    putMode: "ok",
    putDelay: 0,
    jobsDelay: 0,
    ...over,
  };
}
const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
globalThis.fetch = async (url, init = {}) => {
  const method = init.method ?? "GET";
  url = String(url);
  const entry = {
    t: now(),
    url,
    method,
    keepalive: init.keepalive,
    body: init.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined,
  };
  calls.push(entry);
  if (url === "/api/profile") {
    const acct = server.cookieEmail; // the server reads the cookie on arrival
    if (method === "GET") {
      await sleep(server.getDelay);
      if (server.getMode === "network") throw new TypeError("Failed to fetch");
      if (server.getMode === "500") return resp(500, { ok: false, error: "Could not load profile." });
      if (!acct) return resp(401, { ok: false, error: "Not authenticated" });
      const p = server.profiles[acct];
      return resp(200, {
        ok: true,
        email: acct,
        profile: p ? { ...p, email: acct } : null,
        prefFilters: server.prefFilters[acct] ?? true,
        updatedAt: p ? "2026-10-26T00:00:00.000Z" : null,
      });
    }
    if (method === "PUT") {
      const mode = server.putMode;
      await sleep(server.putDelay);
      entry.end = now();
      if (mode === "network") {
        entry.result = "network-error";
        throw new TypeError("Failed to fetch");
      }
      if (mode === "500") {
        entry.result = 500;
        return resp(500, { ok: false, error: "Could not save profile." });
      }
      if (!acct) {
        entry.result = 401;
        return resp(401, { ok: false, error: "Not authenticated" });
      }
      const body = entry.body;
      if (typeof body.expectedEmail === "string" && body.expectedEmail.toLowerCase() !== acct) {
        entry.result = 409;
        return resp(409, { ok: false, error: "Signed in as a different account." });
      }
      // Like the real validator, the stored profile has no email of its own.
      const rest = { ...body.profile };
      delete rest.email;
      server.profiles[acct] = rest;
      if (typeof body.prefFilters === "boolean") server.prefFilters[acct] = body.prefFilters;
      entry.result = 200;
      entry.landedIn = acct;
      return resp(200, { ok: true, email: acct, profile: { ...rest, email: acct }, prefFilters: server.prefFilters[acct] ?? true, updatedAt: "x" });
    }
  }
  if (url.startsWith("/api/jobs/tracked")) return resp(200, { ok: true, jobs: [] });
  if (url.startsWith("/api/jobs/seen/import")) return resp(200, { ok: true });
  if (url.startsWith("/api/jobs")) {
    await sleep(server.jobsDelay);
    return resp(200, { ok: true, jobs: [] });
  }
  throw new Error("unexpected fetch " + url);
};
const profileCalls = () => calls.filter((c) => c.url === "/api/profile");
const puts = () => calls.filter((c) => c.url === "/api/profile" && c.method === "PUT");
const gets = () => calls.filter((c) => c.url === "/api/profile" && c.method === "GET");
const jobFetches = () => calls.filter((c) => c.url.startsWith("/api/jobs?"));

// ---------- React ----------
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { SwipeStoreProvider, useSwipeStore } = await import("./out/lib/swipe/swipeStore.js");
const { DEFAULT_SWIPE_PROFILE } = await import("./out/lib/swipe/defaultProfile.js");
const h = React.createElement;

let renders = [];
let api = null;
function Probe({ sessionEmail }) {
  const s = useSwipeStore();
  api = s;
  renders.push({
    t: now(),
    as: sessionEmail ?? "(guest)",
    fullName: s.profile.fullName,
    email: s.profile.email,
    pref: s.usePreferenceFilters,
    hydrated: s.hydrated,
  });
  return null;
}
function App({ sessionEmail, isLoggedIn }) {
  return h(SwipeStoreProvider, { sessionEmail, isLoggedIn }, h(Probe, { sessionEmail }));
}
let root = null;
function mount(props, { strict = false } = {}) {
  const container = {
    ...makeTarget(),
    nodeType: 1,
    nodeName: "DIV",
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    textContent: "",
  };
  root = createRoot(container);
  const el = h(App, props);
  root.render(strict ? h(React.StrictMode, null, el) : el);
}
function rerender(props) {
  root.render(h(App, props));
}
function unmount() {
  root?.unmount();
  root = null;
  api = null;
}
async function waitFor(pred, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(10);
  }
  return false;
}
function freshScenario(serverOver) {
  unmount();
  store.clear();
  writes = [];
  calls = [];
  renders = [];
  document.visibilityState = "visible";
  resetServer(serverOver);
}

// ---------- checks ----------
const results = [];
let current = "";
function check(name, cond, detail) {
  results.push({ scenario: current, name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  [${current}] ${name}${!cond && detail !== undefined ? "\n      " + JSON.stringify(detail) : ""}`);
}
function note(text) {
  console.log(`      note: ${text}`);
}
const A = "a@example.com";
const B = "b@example.com";
const filled = (fullName, extra = {}) => ({ ...DEFAULT_SWIPE_PROFILE, fullName, ...extra });
const names = (rs) => rs.map((r) => `${r.as}:${JSON.stringify(r.fullName)}`).join(" ");

const only = process.argv[2];
async function scenario(id, title, fn) {
  if (only && !only.split(",").includes(String(id))) return;
  current = `S${id}`;
  console.log(`\n=== S${id}: ${title}`);
  try {
    await fn();
  } catch (err) {
    check("scenario threw", false, String(err?.stack ?? err));
  }
}

// ---------- scenarios ----------
await scenario(1, "legacy own blob, server has none → uploaded once, never blank", async () => {
  freshScenario({ cookieEmail: A });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: "A@Example.com", techStack: ["go"] }), prefFilters: true });
  mount({ sessionEmail: "A@Example.com", isLoggedIn: true });
  check("hydrates", await waitFor(() => api?.hydrated));
  await sleep(1300);
  check("exactly one GET", gets().length === 1, gets());
  check("exactly one PUT", puts().length === 1, puts());
  check("PUT body = browser copy + expectedEmail", puts()[0]?.body.profile.fullName === "Alice" && puts()[0]?.body.expectedEmail === "A@Example.com", puts()[0]?.body);
  check("server now has Alice", server.profiles[A]?.fullName === "Alice");
  check("every render after the initial one shows Alice", renders.slice(1).every((r) => r.fullName === "Alice"), names(renders));
  const blob = getBlob();
  check("blob: owner = account, dirty = false", blob.profileOwner === A && blob.profileDirty === false, blob);
  // Every write is the persist effect (owner = A, after the decision) or
  // maybeImport's R5 rewrite of the untouched legacy blob.
  check(
    "blob writes: persist only after the decision; maybeImport carries fields through",
    writes.every((w) => w.v.profileOwner === A || (w.v.profileOwner === undefined && w.v.profile.email === "A@Example.com" && w.v.prefFilters === true)),
    writes.map((w) => [w.v.profileOwner, w.v.profile.email]),
  );
  unmount();
  calls = [];
  renders = [];
  mount({ sessionEmail: "A@Example.com", isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("reload: no second upload", puts().length === 0, puts());
  check("reload: still Alice", api.profile.fullName === "Alice");
});

await scenario("1s", "same as S1 under React.StrictMode (double effects in dev)", async () => {
  freshScenario({ cookieEmail: A });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: "a@example.com" }), prefFilters: true });
  mount({ sessionEmail: "a@example.com", isLoggedIn: true }, { strict: true });
  check("hydrates", await waitFor(() => api?.hydrated));
  await sleep(1300);
  note(`GETs: ${gets().length}, PUTs: ${puts().length}`);
  check("exactly one PUT despite double-mounted effects", puts().length === 1, puts());
  check("server has Alice; blob clean", server.profiles[A]?.fullName === "Alice" && getBlob().profileDirty === false, getBlob());
});

await scenario(2, "legacy blob owned by another account → blank, nothing uploaded, never shown", async () => {
  freshScenario({ cookieEmail: A });
  setBlob({ statuses: {}, notes: {}, profile: filled("Olivia", { email: "other@example.com" }), prefFilters: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  check("hydrates", await waitFor(() => api?.hydrated));
  await sleep(1300);
  check("Olivia never rendered", renders.every((r) => r.fullName !== "Olivia"), names(renders));
  check("no PUT", puts().length === 0, puts());
  check("server still has nothing for A", server.profiles[A] === undefined);
  check("shown profile blank with account email", api.profile.fullName === "" && api.profile.email === A);
  check("switch = server value (true)", api.usePreferenceFilters === true);
  const blob = getBlob();
  check("blob now A's blank copy, clean", blob.profileOwner === A && blob.profile.fullName === "" && blob.profileDirty === false, blob);
});

await scenario(3, "server has a profile, browser copy clean → server copy shown, nothing uploaded", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Server Sam", { locationPreferences: ["Austin"] }) }, prefFilters: { [A]: false } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Local Lou", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  check("hydrates", await waitFor(() => api?.hydrated));
  await sleep(1300);
  check("shows Server Sam", api.profile.fullName === "Server Sam");
  check("switch = server's false", api.usePreferenceFilters === false);
  check("no PUT", puts().length === 0, puts());
  check("first job fetch has no prefs (server switch off)", jobFetches()[0] && !jobFetches()[0].url.includes("prefLoc"), jobFetches()[0]?.url);
  check("blob = server copy, clean", getBlob().profile.fullName === "Server Sam" && getBlob().profileDirty === false && getBlob().prefFilters === false, getBlob());
  note(`renders: ${names(renders)}`);
});

await scenario(4, "edit, PUT fails → stays dirty; next load with server back → browser copy wins and uploads", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  server.putMode = "network";
  api.updateProfile({ fullName: "Alice v2" });
  await sleep(1300);
  check("one PUT attempted and failed", puts().length === 1 && puts()[0].result === "network-error", puts());
  check("blob: Alice v2, owner A, dirty", getBlob().profile.fullName === "Alice v2" && getBlob().profileOwner === A && getBlob().profileDirty === true, getBlob());
  check("no retry loop", (await sleep(1500), puts().length === 1), puts().length);
  unmount();
  calls = [];
  renders = [];
  server.putMode = "ok";
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("server's older copy never shown", renders.slice(1).every((r) => r.fullName === "Alice v2"), names(renders));
  check("uploaded once", puts().length === 1 && puts()[0].body.profile.fullName === "Alice v2", puts());
  check("server has Alice v2; blob clean", server.profiles[A].fullName === "Alice v2" && getBlob().profileDirty === false, getBlob());
});

await scenario(5, "GET fails, blob owned by another account → blank, no save, blob untouched until decision", async () => {
  freshScenario({ cookieEmail: A, getMode: "network", getDelay: 300 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Olivia", { email: "other@example.com" }), prefFilters: false, profileOwner: "other@example.com", profileDirty: true });
  mount({ sessionEmail: A, isLoggedIn: true });
  await sleep(150);
  check("pre-decision: no blob writes", writes.length === 0, writes);
  check("pre-decision: Olivia not rendered", renders.every((r) => r.fullName !== "Olivia"), names(renders));
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("Olivia never rendered", renders.every((r) => r.fullName !== "Olivia"), names(renders));
  check("blank shown, switch true", api.profile.fullName === "" && api.usePreferenceFilters === true);
  check("no PUT", puts().length === 0, puts());
  check("blob after decision: A's blank, clean", getBlob().profileOwner === A && getBlob().profile.fullName === "" && getBlob().profileDirty === false, getBlob());
});

await scenario("5b", "S5 as an in-page change (guest → A while hydrated is already true)", async () => {
  freshScenario({ cookieEmail: "" });
  setBlob({ statuses: {}, notes: {}, profile: filled("Olivia", { email: "other@example.com" }), prefFilters: false, profileOwner: "other@example.com", profileDirty: true });
  mount({ isLoggedIn: false });
  await waitFor(() => api?.hydrated);
  check("guest sees the previous browser copy (today's behavior)", api.profile.fullName === "Olivia");
  const writesBefore = writes.length;
  renders = [];
  server.cookieEmail = A;
  server.getMode = "network";
  server.getDelay = 300;
  rerender({ sessionEmail: A, isLoggedIn: true });
  await sleep(150);
  check("pre-decision (hydrated already true): no blob writes", writes.length === writesBefore, writes.slice(writesBefore));
  await sleep(1500);
  const asA = renders.filter((r) => r.as === A);
  note(`renders as A: ${names(asA)}`);
  check("Olivia never rendered as A, not even the first commit", asA.length > 0 && asA.every((r) => r.fullName !== "Olivia"), names(asA));
  check("no PUT", puts().length === 0, puts());
  check("blob: A's blank, clean", getBlob().profileOwner === A && getBlob().profile.fullName === "" && getBlob().profileDirty === false, getBlob());
});

await scenario(6, "fast typing → one PUT ~1 s after last key; key during in-flight PUT sent after it settles", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  let tLast = 0;
  for (let i = 1; i <= 10; i++) {
    api.updateProfile({ fullName: "Alice " + "B".repeat(i) });
    tLast = now();
    await sleep(60);
  }
  await sleep(1300);
  check("exactly one PUT for 10 keystrokes", puts().length === 1, puts().map((p) => p.body.profile.fullName));
  const lag = puts()[0].t - tLast;
  note(`PUT sent ${lag} ms after the last keystroke`);
  check("sent ~1 s after the last keystroke", lag >= 950 && lag <= 1250, lag);
  check("carries the final text", puts()[0].body.profile.fullName === "Alice BBBBBBBBBB");
  check("dirty cleared after it", getBlob().profileDirty === false, getBlob());
  calls = [];
  server.putDelay = 1500;
  const t0 = now();
  api.updateProfile({ fullName: "X" });
  await waitFor(() => puts().length === 1);
  await sleep(200);
  api.updateProfile({ fullName: "Y" }); // during PUT #1
  const tY = now();
  await waitFor(() => puts().length === 2 && puts()[1].end !== undefined, 6000);
  const [p1, p2] = puts();
  note(`PUT1 ${p1.t - t0}..${p1.end - t0} ms (X); PUT2 ${p2.t - t0}..${p2.end - t0} ms (${p2.body.profile.fullName}); Y typed at ${tY - t0}`);
  check("PUT2 starts only after PUT1 settled", p2.t >= p1.end, { p1, p2 });
  check("PUT2 carries Y", p2.body.profile.fullName === "Y");
  const between = writes.filter((w) => w.t >= p1.end && w.t < p2.end);
  check("dirty stays true after PUT1 confirms (older version)", between.every((w) => w.v.profileDirty === true), between.map((w) => w.v.profileDirty));
  await sleep(50);
  check("dirty false once PUT2 (newest) confirmed", getBlob().profileDirty === false && server.profiles[A].fullName === "Y", getBlob());
});

await scenario(7, "in-page account change A → B with A's save in flight and another queued", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice"), [B]: filled("Bob") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  server.putDelay = 800;
  api.updateProfile({ fullName: "Alice edit1" });
  await waitFor(() => puts().length === 1);
  api.updateProfile({ fullName: "Alice edit2" });
  await sleep(50);
  renders = [];
  server.cookieEmail = B;
  server.getDelay = 300;
  const tSwitch = now();
  rerender({ sessionEmail: B, isLoggedIn: true });
  await sleep(3000);
  const asB = renders.filter((r) => r.as === B);
  note(`renders as B: ${names(asB)}`);
  check("no Alice data rendered as B, not even the first commit", asB.length > 0 && asB.every((r) => !r.fullName.startsWith("Alice") && r.email !== A), names(asB));
  const after = puts().filter((p) => p.t >= tSwitch);
  check("nothing PUT after the switch", after.length === 0, after);
  check("A's queued edit2 never sent", puts().every((p) => p.body.profile.fullName !== "Alice edit2"));
  check("PUT1 landed in A (sent before the switch)", puts()[0].landedIn === A);
  check("B's server profile untouched", server.profiles[B].fullName === "Bob");
  check("B sees Bob", api.profile.fullName === "Bob" && api.profile.email === B);
  check("blob: B's copy, clean", getBlob().profileOwner === B && getBlob().profile.fullName === "Bob" && getBlob().profileDirty === false, getBlob());
  check("no blob write carried Alice data with owner B", writes.every((w) => !(w.v.profileOwner === B && w.v.profile.fullName.startsWith("Alice"))));
  server.putDelay = 0;
  api.updateProfile({ fullName: "Bob 2" });
  await sleep(1300);
  check("B's own edit saves to B", server.profiles[B].fullName === "Bob 2" && puts().at(-1).body.expectedEmail === B);
});

await scenario("7b", "A → B in-page where B's server has none and the blob is A's dirty copy", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  server.putMode = "network";
  api.updateProfile({ fullName: "Alice unsaved" });
  await sleep(1300);
  check("A's copy dirty", getBlob().profileDirty === true);
  server.putMode = "ok";
  server.cookieEmail = B;
  server.getDelay = 300;
  calls = [];
  rerender({ sessionEmail: B, isLoggedIn: true });
  await sleep(150);
  api.updateProfile({ fullName: "B typed during GET" });
  await sleep(2000);
  check("no PUT at all (B starts blank, pre-decision edit discarded)", puts().length === 0, puts());
  check("B blank", api.profile.fullName === "" && api.profile.email === B);
  check("server B still none", server.profiles[B] === undefined);
});

await scenario(8, "guest: no GET/PUT; owner/dirty carried through untouched", async () => {
  freshScenario({ cookieEmail: "" });
  setBlob({ statuses: { j1: "saved" }, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: true });
  mount({ isLoggedIn: false });
  await waitFor(() => api?.hydrated);
  api.setUsePreferenceFilters(false);
  api.updateProfile({ phone: "555" });
  await sleep(1300);
  document.visibilityState = "hidden";
  document.dispatch("visibilitychange");
  win.dispatch("pagehide");
  await sleep(50);
  check("no /api/profile calls", profileCalls().length === 0, profileCalls());
  const blob = getBlob();
  check("owner/dirty carried", blob.profileOwner === A && blob.profileDirty === true, blob);
  check("guest edits still stored locally", blob.prefFilters === false && blob.profile.phone === "555");
  freshScenario({ cookieEmail: "" });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true });
  mount({ isLoggedIn: false });
  await waitFor(() => api?.hydrated);
  await sleep(50);
  note(`legacy guest blob after a guest visit: profileOwner=${JSON.stringify(getBlob().profileOwner)} profileDirty=${JSON.stringify(getBlob().profileDirty)}`);
  check("legacy guest: no /api/profile calls", profileCalls().length === 0);
});

await scenario(9, "tab hidden mid-edit → flush with keepalive", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  api.updateProfile({ fullName: "Hidden" });
  await sleep(100);
  document.visibilityState = "hidden";
  document.dispatch("visibilitychange");
  await sleep(10);
  check("PUT sent immediately with keepalive", puts().length === 1 && puts()[0].keepalive === true && puts()[0].body.profile.fullName === "Hidden", puts());
  win.dispatch("pagehide");
  await sleep(1300);
  check("no duplicate from pagehide or the cleared timer", puts().length === 1, puts().length);
  check("confirmed → clean", getBlob().profileDirty === false);
  // Hidden while Edit1 is in flight, and the page stays alive (tab switch).
  document.visibilityState = "visible";
  calls = [];
  server.putDelay = 800;
  api.updateProfile({ fullName: "Edit1" });
  await waitFor(() => puts().length === 1);
  api.updateProfile({ fullName: "Edit2" });
  await sleep(20);
  document.visibilityState = "hidden";
  document.dispatch("visibilitychange");
  await sleep(20);
  check("flush sent Edit2 with keepalive while Edit1 in flight", puts().length === 2 && puts()[1].keepalive === true && puts()[1].body.profile.fullName === "Edit2", puts());
  await waitFor(() => puts().length === 3 && puts()[2].end !== undefined, 4000);
  await sleep(50);
  const [e1, e2, e2again] = puts();
  check(
    "R13: once both settled, Edit2 is re-sent once without keepalive",
    puts().length === 3 && e2again.keepalive === false && e2again.body.profile.fullName === "Edit2" && e2again.t >= Math.max(e1.end, e2.end),
    puts(),
  );
  check("R13: the re-send is confirmed → clean", getBlob().profileDirty === false && server.profiles[A].fullName === "Edit2", getBlob());
  document.visibilityState = "visible";
  unmount();
  calls = [];
  server.putDelay = 0;
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("next load: nothing to re-upload, Edit2 shown", puts().length === 0 && api.profile.fullName === "Edit2", puts());
  // A real unload while Edit3 is in flight: the page dies right after the
  // flush, so nothing re-sends and the copy stays dirty (R1).
  calls = [];
  server.putDelay = 400;
  api.updateProfile({ fullName: "Edit3" });
  await waitFor(() => puts().length === 1);
  api.updateProfile({ fullName: "Edit4" });
  await sleep(20);
  win.dispatch("pagehide");
  unmount();
  await sleep(1000);
  check("unload: Edit4 flushed with keepalive and never re-sent", puts().length === 2 && puts()[1].keepalive === true && puts()[1].body.profile.fullName === "Edit4", puts());
  check("unload: blob stays dirty with Edit4 (R1)", getBlob().profileDirty === true && getBlob().profile.fullName === "Edit4", getBlob());
  calls = [];
  server.putDelay = 0;
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("next load re-uploads Edit4 and clears dirty", puts().length === 1 && puts()[0].body.profile.fullName === "Edit4" && getBlob().profileDirty === false, puts());
});

await scenario(10, "switch saved while signed in; first job fetch uses resolved profile + switch", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Sam", { locationPreferences: ["Austin"] }) }, prefFilters: { [A]: true } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Sam", { email: A, locationPreferences: ["Boston"] }), prefFilters: false, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  const first = jobFetches()[0]?.url ?? "";
  note(`first job fetch: ${first}`);
  check("first job fetch uses the server's prefs (Austin) and switch (on)", first.includes("prefLoc=Austin") && !first.includes("Boston"), first);
  api.setUsePreferenceFilters(false);
  await sleep(1300);
  check("switch change PUT with prefFilters false", puts().length === 1 && puts()[0].body.prefFilters === false, puts());
  check("server switch now false; blob clean", server.prefFilters[A] === false && getBlob().profileDirty === false);
});

await scenario("R5", "maybeImport's blob rewrite keeps profileOwner/profileDirty", async () => {
  freshScenario({ cookieEmail: A });
  setBlob({ statuses: { j1: "saved" }, notes: { j1: "n" }, profile: filled("Alice", { email: A }), prefFilters: false, profileOwner: A, profileDirty: true });
  server.putMode = "500";
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  const importWrite = writes.find((w) => Object.keys(w.v.statuses).length === 0);
  check("import POST happened", calls.some((c) => c.url === "/api/jobs/seen/import"));
  check("rewrite cleared statuses/notes but kept owner/dirty/toggle", importWrite && importWrite.v.profileOwner === A && importWrite.v.profileDirty === true && importWrite.v.prefFilters === false && Object.keys(importWrite.v.notes).length === 0, importWrite);
});

await scenario(11, "in-place guest → A with a guest-era copy: no blank flash, copied up once", async () => {
  freshScenario({ cookieEmail: "" });
  setBlob({ statuses: {}, notes: {}, profile: filled("Gina", { email: "" }), prefFilters: true, profileOwner: "", profileDirty: false });
  mount({ isLoggedIn: false });
  await waitFor(() => api?.hydrated);
  renders = [];
  server.cookieEmail = A;
  server.getDelay = 200;
  rerender({ sessionEmail: A, isLoggedIn: true });
  await sleep(1600);
  const asA = renders.filter((r) => r.as === A);
  note(`renders as A: ${names(asA)}`);
  check("guest-era copy shown throughout (never blanked)", asA.length > 0 && asA.every((r) => r.fullName === "Gina"), names(asA));
  check("uploaded once to A", puts().length === 1 && server.profiles[A]?.fullName === "Gina", puts());
  check("blob: owner A, clean", getBlob().profileOwner === A && getBlob().profileDirty === false, getBlob());
});

await scenario(12, "R7/R10: fresh browser, GET fails, user edits → no PUT; next load uses the server copy", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Server Alice") }, getMode: "500" });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  check("blank shown (browser copy, owner \"\")", api.profile.fullName === "");
  api.updateProfile({ fullName: "Partial" });
  await sleep(1500);
  document.visibilityState = "hidden";
  document.dispatch("visibilitychange");
  win.dispatch("pagehide");
  await sleep(50);
  document.visibilityState = "visible";
  check("no PUT (not even on page hide)", puts().length === 0, puts());
  check("blob: edit claimed the copy (owner A), not dirty", getBlob().profileOwner === A && getBlob().profileDirty === false && getBlob().profile.fullName === "Partial", getBlob());
  unmount();
  calls = [];
  renders = [];
  server.getMode = "ok";
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("next load: use-server → Server Alice shown", api.profile.fullName === "Server Alice");
  check("no PUT; server profile unchanged", puts().length === 0 && server.profiles[A].fullName === "Server Alice", puts());
  check("blob: owner A, clean", getBlob().profileOwner === A && getBlob().profileDirty === false, getBlob());
});

await scenario(13, "R8: A's dirty edit in the blob, guest presses Reset, A signs in → use-server, no blank upload", async () => {
  freshScenario({ cookieEmail: "", profiles: { [A]: filled("Alice") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice unsaved", { email: A }), prefFilters: true, profileOwner: A, profileDirty: true });
  mount({ isLoggedIn: false });
  await waitFor(() => api?.hydrated);
  api.reset();
  await sleep(100);
  check("guest reset released the copy", getBlob().profileOwner === "" && getBlob().profileDirty === false && getBlob().profile.fullName === "", getBlob());
  check("guest: no /api/profile calls", profileCalls().length === 0);
  unmount();
  calls = [];
  server.cookieEmail = A;
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("A sees the server copy", api.profile.fullName === "Alice");
  check("no PUT of the blank copy; server unchanged", puts().length === 0 && server.profiles[A].fullName === "Alice", puts());
});

await scenario(14, "R9: slow first job fetch → saves go out ~1 s after the decision/edit, before hydrated", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice") }, jobsDelay: 4000 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => gets().length === 1);
  await sleep(100);
  const tEdit = now();
  api.updateProfile({ fullName: "Alice early" });
  await waitFor(() => puts().length === 1 && puts()[0].result !== undefined, 2500);
  check("PUT ~1 s after the edit", puts().length === 1 && puts()[0].t - tEdit >= 950 && puts()[0].t - tEdit <= 1300, puts().map((p) => p.t - tEdit));
  check("… while hydrated is still false", api.hydrated === false);
  check("server has the edit", server.profiles[A]?.fullName === "Alice early");
  await waitFor(() => api?.hydrated, 6000);
  check("after hydration the blob is clean", (await sleep(50), getBlob().profileDirty === false), getBlob());
  freshScenario({ cookieEmail: A, jobsDelay: 4000 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Legacy Al", { email: A }), prefFilters: true });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => gets().length === 1);
  const tGet = now();
  await waitFor(() => puts().length === 1, 2500);
  check("copy-up PUT ~1 s after the decision, before hydrated", puts().length === 1 && puts()[0].t - tGet <= 1400 && api.hydrated === false, { dt: puts()[0]?.t - tGet, hydrated: api.hydrated });
  await waitFor(() => api?.hydrated, 6000);
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice") }, jobsDelay: 4000 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => gets().length === 1);
  await sleep(100);
  api.updateProfile({ fullName: "Alice hidden early" });
  await sleep(100);
  document.visibilityState = "hidden";
  document.dispatch("visibilitychange");
  await sleep(20);
  document.visibilityState = "visible";
  check("hide before hydration flushes with keepalive", puts().length === 1 && puts()[0].keepalive === true && api.hydrated === false, puts());
  await waitFor(() => api?.hydrated, 6000);
});

await scenario(15, "R10: A edits after a failed GET on a fresh browser, then B signs in → B gets none of it", async () => {
  freshScenario({ cookieEmail: A, getMode: "500" });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  api.updateProfile({ fullName: "Alice Private", phone: "555-0100" });
  await sleep(1300);
  check("A: no PUT; copy claimed by A, not dirty", puts().length === 0 && getBlob().profileOwner === A && getBlob().profileDirty === false, { puts: puts().length, blob: getBlob() });
  unmount();
  calls = [];
  renders = [];
  server.cookieEmail = B;
  server.getMode = "ok";
  mount({ sessionEmail: B, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("B never shown A's data", renders.every((r) => r.fullName !== "Alice Private" && r.email !== A), names(renders));
  check("nothing uploaded into B", puts().length === 0 && server.profiles[B] === undefined, puts());
  check("B blank", api.profile.fullName === "" && api.profile.email === B);
  freshScenario({ cookieEmail: A, getMode: "500" });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  api.updateProfile({ fullName: "Alice Private" });
  await sleep(300);
  unmount();
  renders = [];
  server.cookieEmail = B;
  mount({ sessionEmail: B, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("variant (B's GET also fails): B never shown A's data, no PUT", renders.every((r) => r.fullName !== "Alice Private") && puts().length === 0, names(renders));
  unmount();
  freshScenario({ cookieEmail: A, getMode: "500" });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  api.updateProfile({ fullName: "Alice Private" });
  await sleep(300);
  unmount();
  server.getMode = "ok";
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("A's next load (server has none): claimed edits uploaded to A", puts().length === 1 && server.profiles[A]?.fullName === "Alice Private" && getBlob().profileDirty === false, puts());
});

await scenario("15b", "R10 in-place: A's claimed (unconfirmed) copy, then the page switches to B", async () => {
  freshScenario({ cookieEmail: A, getMode: "500" });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  api.updateProfile({ fullName: "Alice Private" });
  await sleep(200);
  renders = [];
  server.cookieEmail = B;
  server.getMode = "ok";
  server.getDelay = 200;
  rerender({ sessionEmail: B, isLoggedIn: true });
  await sleep(1600);
  const asB = renders.filter((r) => r.as === B);
  note(`renders as B: ${names(asB)}`);
  check("no A data rendered as B, not even the first commit", asB.length > 0 && asB.every((r) => r.fullName !== "Alice Private" && r.email !== A), names(asB));
  check("nothing uploaded into B", puts().length === 0 && server.profiles[B] === undefined, puts());
});

await scenario(16, "R10: own copy, GET fails, edit made during the GET → kept and saved (as before R7)", async () => {
  freshScenario({ cookieEmail: A, getMode: "500", getDelay: 300 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await sleep(100);
  api.updateProfile({ fullName: "Alice during GET" });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("edit kept", api.profile.fullName === "Alice during GET");
  check("saved once (R2: use-local on own copy)", puts().length === 1 && puts()[0].body.profile.fullName === "Alice during GET", puts());
  check("blob clean after confirm", getBlob().profileDirty === false && getBlob().profileOwner === A, getBlob());
  calls = [];
  api.updateProfile({ fullName: "Alice later" });
  await sleep(1300);
  check("later edit saved", puts().length === 1 && puts()[0].body.profile.fullName === "Alice later", puts());
});

await scenario(17, "R10: a pre-decision claim cannot change the decision (snapshot rules)", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Server Alice") }, getDelay: 300 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Gina", { email: "" }), prefFilters: true, profileOwner: "", profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await sleep(100);
  api.updateProfile({ fullName: "Gina edited early" });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("a) use-server: server copy shown, no PUT, server unchanged", api.profile.fullName === "Server Alice" && puts().length === 0 && server.profiles[A].fullName === "Server Alice", { shown: api.profile.fullName, puts: puts() });
  freshScenario({ cookieEmail: A, getDelay: 300 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Gina", { email: "" }), prefFilters: true, profileOwner: "", profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await sleep(100);
  api.updateProfile({ fullName: "Gina edited early" });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("b) upload-local: early edit kept and uploaded once", api.profile.fullName === "Gina edited early" && puts().length === 1 && server.profiles[A].fullName === "Gina edited early", puts());
  freshScenario({ cookieEmail: A, getDelay: 300 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Olivia", { email: "other@example.com" }), prefFilters: true, profileOwner: "other@example.com", profileDirty: true });
  mount({ sessionEmail: A, isLoggedIn: true });
  await sleep(100);
  api.updateProfile({ fullName: "A typed early" });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  check("c) start-blank despite the claim: blank, no PUT, Olivia never shown", api.profile.fullName === "" && puts().length === 0 && renders.every((r) => r.fullName !== "Olivia"), { shown: api.profile.fullName, puts: puts() });
});

await scenario(18, "R10: R7-era blob (owner \"\", dirty) + failed GET → never saved, edits only claim", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Server Alice") }, getMode: "500" });
  setBlob({ statuses: {}, notes: {}, profile: filled("Partial", { email: A }), prefFilters: true, profileOwner: "", profileDirty: true });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  api.updateProfile({ fullName: "Partial 2" });
  await sleep(1300);
  check("no PUT", puts().length === 0, puts());
  check("blob: claimed by A, dirty cleared", getBlob().profileOwner === A && getBlob().profileDirty === false, getBlob());
  check("server unchanged", server.profiles[A].fullName === "Server Alice");
});

// ---------- regression scenarios from code review ----------
await scenario("RV1", "R9 + hydrated-gated persist: dirty blob, newer edit saved pre-hydration, tab closed pre-hydration", async () => {
  // Load 2 starts from a dirty blob (an earlier save failed).
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice old") }, jobsDelay: 4000 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice local", { email: A }), prefFilters: true, profileOwner: A, profileDirty: true });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => puts().length === 1 && puts()[0].result !== undefined, 2500); // upload-local copy-up
  note(`copy-up PUT: ${puts()[0]?.body.profile.fullName} -> ${puts()[0]?.result}`);
  api.updateProfile({ fullName: "Alice newest" });
  await waitFor(() => puts().length === 2 && puts()[1].result !== undefined, 2500);
  note(`edit PUT: ${puts()[1]?.body.profile.fullName} -> ${puts()[1]?.result}; hydrated=${api.hydrated}`);
  check("server has the newest edit", server.profiles[A]?.fullName === "Alice newest");
  const blobAtClose = getBlob();
  note(`blob at close: ${JSON.stringify({ n: blobAtClose.profile.fullName, o: blobAtClose.profileOwner, d: blobAtClose.profileDirty })}`);
  // Close before the deck loads (pagehide finds nothing waiting).
  window.dispatch("pagehide");
  unmount();
  // Load 3, everything healthy.
  calls = [];
  renders = [];
  server.jobsDelay = 0;
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  note(`load 3 PUTs: ${JSON.stringify(puts().map((p) => p.body.profile.fullName))}; shown: ${api.profile.fullName}`);
  check("load 3: newest edit is not overwritten by the stale blob", server.profiles[A]?.fullName === "Alice newest", server.profiles[A]?.fullName);
});

await scenario("RV2", "stale updateProfile (A's closure, e.g. resume upload finishing) called after in-place A → B", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice"), [B]: filled("Bob") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  const staleUpdate = api.updateProfile; // captured by an async handler while A was signed in
  server.cookieEmail = B;
  rerender({ sessionEmail: B, isLoggedIn: true });
  await waitFor(() => api.profile.fullName === "Bob", 2000);
  await sleep(200);
  staleUpdate({ primaryResumeId: "resume-123" }); // late completion of A's upload
  await sleep(100);
  api.updateProfile({ phone: "555-BOB" }); // B keeps editing
  await sleep(1300);
  const blob = getBlob();
  note(`blob after: ${JSON.stringify({ n: blob.profile.fullName, phone: blob.profile.phone, o: blob.profileOwner, d: blob.profileDirty })}`);
  note(`PUTs as B: ${JSON.stringify(puts().map((p) => [p.body.profile.fullName, p.landedIn ?? p.result]))}`);
  check("B's copy still owned by B", blob.profileOwner === B, blob.profileOwner);
  check("B's edit saved to B", server.profiles[B]?.phone === "555-BOB", server.profiles[B]);
  // B leaves; A signs in on this browser.
  unmount();
  calls = [];
  renders = [];
  server.cookieEmail = A;
  server.getDelay = 300;
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1300);
  const asA = renders.filter((r) => r.as === A);
  note(`renders as A: ${names(asA)}`);
  check("A is never shown Bob", asA.every((r) => r.fullName !== "Bob"), names(asA));
  check("Bob never uploaded into A", server.profiles[A]?.fullName === "Alice", server.profiles[A]);
});

await scenario("RV2b", "stale setUsePreferenceFilters / reset from A's closure after in-place A → B apply nothing", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice"), [B]: filled("Bob") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  const { setUsePreferenceFilters: staleToggle, reset: staleReset } = api;
  server.cookieEmail = B;
  rerender({ sessionEmail: B, isLoggedIn: true });
  await waitFor(() => api.profile.fullName === "Bob", 2000);
  await sleep(200);
  staleToggle(false);
  staleReset();
  await sleep(1300);
  check("B's profile and switch untouched", api.profile.fullName === "Bob" && api.usePreferenceFilters === true);
  check("no PUT, blob B clean", puts().filter((p) => p.landedIn === B || p.body.expectedEmail === B).length === 0 && getBlob().profileOwner === B && getBlob().profileDirty === false, { puts: puts(), blob: getBlob() });
});

await scenario("X1", "R12: a GET answered for another account's cookie (switched in another tab) is not applied as this tab's account", async () => {
  freshScenario({ cookieEmail: B, profiles: { [A]: filled("Alice"), [B]: filled("Bob") } });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  // Tab rendered as A (e.g. a cached layout on Back), but the cookie is already B's.
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(200);
  note(`tab as A shows: ${api.profile.fullName}; blob: ${JSON.stringify({ n: getBlob().profile.fullName, o: getBlob().profileOwner, d: getBlob().profileDirty })}`);
  check("tab labelled A never shows B's profile", renders.every((r) => r.fullName !== "Bob"), names(renders));
  check("tab keeps A's own copy (use-local)", api.profile.fullName === "Alice" && api.profile.email === A);
  check("blob never holds B's data under owner A", writes.every((w) => !(w.v.profile.fullName === "Bob" && w.v.profileOwner === A)), writes.map((w) => [w.v.profile.fullName, w.v.profileOwner]));
  check("no PUT", puts().length === 0, puts());
  // Later: A signs in on this browser; the GET fails once; A edits.
  unmount();
  calls = [];
  renders = [];
  server.cookieEmail = A;
  server.getMode = "500";
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  note(`A (GET failed) is shown: ${api.profile.fullName}`);
  api.updateProfile({ phone: "555-A" });
  await sleep(1400);
  note(`server A now: ${JSON.stringify(server.profiles[A])}`);
  check("Bob's data never saved into A", server.profiles[A]?.fullName !== "Bob", server.profiles[A]);
  check("B's server profile untouched", server.profiles[B].fullName === "Bob" && server.profiles[B].phone === undefined, server.profiles[B]);
});

await scenario("X2", "R13: a flush overlapping an in-flight save is confirmed; a later load keeps another device's newer edit", async () => {
  freshScenario({ cookieEmail: A, profiles: { [A]: filled("Alice") }, putDelay: 400 });
  setBlob({ statuses: {}, notes: {}, profile: filled("Alice", { email: A }), prefFilters: true, profileOwner: A, profileDirty: false });
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  api.updateProfile({ fullName: "Alice v1" });
  await sleep(1100); // v1 PUT now in flight (400 ms)
  api.updateProfile({ fullName: "Alice v2" });
  await sleep(50);
  document.visibilityState = "hidden";
  document.dispatch("visibilitychange"); // flush v2 while v1 is in flight
  await sleep(900);
  note(`PUTs: ${JSON.stringify(puts().map((p) => [p.body.profile.fullName, p.keepalive, p.result]))}; server: ${server.profiles[A].fullName}; blob dirty: ${getBlob().profileDirty}`);
  check("server has v2 and the copy is clean while the page is still open", server.profiles[A].fullName === "Alice v2" && getBlob().profileDirty === false, getBlob());
  // The page stays open (tab merely switched). Another device edits.
  server.profiles[A] = { ...server.profiles[A], fullName: "Alice from phone" };
  unmount();
  calls = [];
  renders = [];
  document.visibilityState = "visible";
  mount({ sessionEmail: A, isLoggedIn: true });
  await waitFor(() => api?.hydrated);
  await sleep(1400);
  note(`after reload: shown ${api.profile.fullName}; server ${server.profiles[A].fullName}`);
  check("the phone's newer edit survives the reload", server.profiles[A].fullName === "Alice from phone" && puts().length === 0, puts());
  check("the reload shows the phone's edit", api.profile.fullName === "Alice from phone");
});

unmount();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
