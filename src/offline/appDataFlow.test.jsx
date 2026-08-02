import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

// so React warns when an update escapes an act scope; this file drives the whole App asynchronously
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import App from "../App";
import { OfflineProvider } from "./OfflineProvider";
import { emptyServerData } from "./normalizeServerData";
import { makeDomainKey } from "./domainKey";
import { optimisticEntity } from "./mutationStore";
import { MUTATION_STATUS } from "./schema";
import { createRepository } from "./repository";
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { apiCall } from "../utils/api";
import { __resetShiftSaveStateForTests } from "../components/views/ShiftReportView";

// App's write paths are not what this file tests; stubbing them keeps a save from reaching the
// network while the shift-report seam below drives a real one
jest.mock("../utils/api", () => ({ apiCall: jest.fn(async () => ({ status: "success" })) }));

// The App-level mirror effect decides what a snapshot is allowed to overwrite. Nothing used to test
// this file, which is why two data-loss defects survived two review rounds — every rule below is a
// reproduction of one of them.
// A REFRESH result: `present` marks which collections the response actually carried, and a fixture
// stands for a complete GAS response unless a test overrides it.
function snapshot(machine, overrides = {}) {
  return { ...emptyServerData(machine), present: { shiftReports: true, segments: true, grouts: true }, ...overrides };
}

// A CACHE read has no `present` — a stored snapshot says nothing about what the server most recently
// sent, and the real `readServerSnapshot` does not return it. Fabricating it here would be the same
// mistake that let a broken seam pass green.
function cached(machine, overrides = {}) {
  return { ...emptyServerData(machine), ...overrides };
}

function renderApp(repository, runner = {}) {
  let container;
  let root;
  // The fake runner needs `runNow`: App calls it after every queued write to start the drain, and a
  // fake without it made that call throw a TypeError into the swallowing catch — so the production
  // line never ran in any test here, and a rename or a wiring slip would have left saves sitting in
  // the queue until the next online/focus/visibilitychange, silently.
  const syncRunner = { start: async () => {}, stop: () => {}, runNow: async () => {}, ...runner };
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(
      <OfflineProvider deps={{
        openDb: async () => ({}),
        stageLegacyLocalStorage: async () => {},
        createRepository: () => repository,
        createSyncRunner: () => syncRunner,
        storage: null,
      }}>
        <App />
      </OfflineProvider>
    );
  });
  return {
    container,
    text: () => container.textContent,
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

function makeRepository(overrides = {}) {
  return {
    load: async machine => ({ data: cached(machine), source: "indexeddb", fetchedAt: "2026-07-01T00:00:00.000Z", stale: true }),
    refresh: async machine => ({ data: snapshot(machine), source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false }),
    subscribe: () => () => {},
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, lastSyncedAt: null }),
    setSyncMetaValue: async () => {},
    ...overrides,
  };
}

// What `optimisticEntity` really returns. A fake that omits `entityType`/`domainKey` sends a shape
// the real repository never sends, and `applyOptimisticRow` then falls back to matching on the
// record id alone — the rule the cross-ring duplicates disproved. Both sides of a seam agreeing on
// a shape neither production side uses is how three defects reached review on this branch.
// Production's own function, not a copy of it. A copy drifted from it on the exact field a
// review found a defect in — the payload's machine beating the envelope's — while the comment
// above claimed parity, which is the shape this branch has now shipped four times.
function optimisticShape(input) {
  return optimisticEntity({
    ...input,
    domainKey: makeDomainKey(input),
    status: MUTATION_STATUS.PENDING,
  }, MUTATION_STATUS.PENDING).payload;
}

beforeEach(() => {
  window.localStorage.clear();
  apiCall.mockImplementation(async () => ({ status: "success" }));
  __resetShiftSaveStateForTests();
});
afterEach(() => window.localStorage.clear());

test("an offline relaunch shows the snapshot, and never the legacy localStorage copy", async () => {
  // This test used to protect a record that existed ONLY in localStorage from being overwritten by
  // a cached snapshot. Task 9 Step 5 removed that store: the snapshot is the durable one, and it
  // re-injects whatever has not synced. A stale localStorage copy is now legacy data — staged and
  // reconciled, never rendered — so what has to be pinned is the opposite of what it once was.
  window.localStorage.setItem("tbmIssues", JSON.stringify([{ id: "iss_legacy", machine: "TBM1", title: "ของเก่าใน localStorage", status: "open" }]));
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, { issues: [{ id: "iss_snap", machine: "TBM1", title: "จาก snapshot", status: "open" }] }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("จาก snapshot");
  expect(app.text()).not.toContain("ของเก่าใน localStorage");
  app.unmount();
});

test("an offline relaunch does not write the configs back to localStorage", async () => {
  // Same retirement as the issues above: App used to mirror every config it received into
  // localStorage for the views to read. They take props now, so a launch must leave that key
  // exactly as the legacy staging found it — untouched, for reconciliation to compare.
  window.localStorage.setItem("tbmRouteConfig", JSON.stringify({ plannedDistance: 1234.56 }));
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, { routeConfigs: { TBM1: { plannedDistance: 1000 } } }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async machine => ({ data: snapshot(machine, { routeConfigs: { TBM1: { plannedDistance: 2000 } } }), source: "server", fetchedAt: "x", stale: false }),
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(JSON.parse(window.localStorage.getItem("tbmRouteConfig"))).toEqual({ plannedDistance: 1234.56 });
  expect(window.localStorage.getItem("tbmDistancePlanConfig")).toBeNull();
  expect(window.localStorage.getItem("tbmPlanConfig")).toBeNull();
  app.unmount();
});

test("a server response with an absent collection does not erase local business data", async () => {
  // normalizeServerData maps an absent key to [], and GAS's own getSheetDataAsJson returns [] for a
  // sheet that does not exist, so an older deployment, a partial doGet and a missing tab all look
  // like a real deletion. Only a tombstone removes anything (Step 5b) — an empty list never does.
  // Asserted on the screen: since Step 5 nothing writes these to localStorage, so a localStorage
  // assertion here would pass no matter what the app did.
  let answer;
  const repository = makeRepository({
    load: async machine => ({
      data: cached(machine, { issues: [{ id: "iss_local", machine: "TBM1", title: "ปัญหาที่มีอยู่", status: "open" }] }),
      source: "indexeddb", fetchedAt: "x", stale: true,
    }),
    // Held open on purpose. The cached snapshot has to reach the SCREEN before the server answers —
    // that is the ordering the app runs in, an IndexedDB read against a network round trip — and
    // resolving both inside one `act` lets React batch the cache render away, leaving the test
    // asserting the server response alone.
    refresh: machine => new Promise(resolve => {
      answer = () => resolve({ data: snapshot(machine, { prepTasks: [], issues: [], dailyReports: [], instReadings: [] }), source: "server", fetchedAt: "x", stale: false });
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  expect(app.text()).toContain("ปัญหาที่มีอยู่"); // the cache put it on screen
  await act(async () => { answer(); });

  expect(app.text()).toContain("ปัญหาที่มีอยู่"); // and the empty response did not take it off
  app.unmount();
});

test("a server response only rewrites the machines it actually carries", async () => {
  // The per-machine localStorage keys used to give this for free — one key per machine, so a
  // payload naming only TBM1 could not touch TBM2's. One list in state can, hence the `carried`
  // set. Asserted through the Work Plan page for each machine, since that is where the rows show.
  let carriesBoth = true;
  const repository = makeRepository({
    refresh: async machine => ({
      data: snapshot(machine, {
        prepTasks: carriesBoth
          ? [{ id: "pt_tbm1", machine: "TBM1", name: "งานเตรียม TBM1", start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [] },
             { id: "pt_tbm2", machine: "TBM2", name: "งานเตรียม TBM2", start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [] }]
          : [{ id: "pt_tbm1", machine: "TBM1", name: "งานเตรียม TBM1 แก้แล้ว", start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [] }],
      }),
      source: "server", fetchedAt: "x", stale: false,
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
  await act(async () => { button(/Work Plan/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(app.text()).toContain("งานเตรียม TBM1");

  // a second response that names TBM1 only
  carriesBoth = false;
  await act(async () => { button(/^TBM2$/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => {});

  expect(app.text()).toContain("งานเตรียม TBM2"); // TBM2's row survived a payload that never mentioned it
  app.unmount();
});

test("a live server response does replace the collections it carries", async () => {
  // It used to be asserted on localStorage. Task 9 Step 5 retired that copy — the queue and the
  // snapshot are the durable store now — so the observable is the screen, which is what the crew
  // actually reads. The cached issue is on it first; the server's answer replaces it.
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, { issues: [{ id: "iss_old", machine: "TBM1", title: "รอ Platform เก่า", status: "open" }] }), source: "indexeddb", fetchedAt: "2026-07-01T00:00:00.000Z", stale: true }),
    refresh: async machine => ({ data: snapshot(machine, { issues: [{ id: "iss_new", machine: "TBM1", title: "รอ Platform ใหม่", status: "open" }] }), source: "server", fetchedAt: "x", stale: false }),
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("รอ Platform ใหม่");
  expect(app.text()).not.toContain("รอ Platform เก่า");
  expect(window.localStorage.getItem("tbmIssues")).toBeNull(); // and no second copy is left behind
  app.unmount();
});

test("an offline launch with a cached snapshot reports the snapshot, not a blocking error", async () => {
  const onLine = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
  const repository = makeRepository({ refresh: async () => { throw new Error("Failed to fetch"); } });

  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("ออฟไลน์");
  expect(app.text()).not.toContain("ไม่สามารถดึงข้อมูลได้");
  app.unmount();
  onLine.mockRestore();
});

test("a server failure while online is not reported as being offline", async () => {
  // a permission page, an HTTP 4xx or malformed JSON all fail with the device online; claiming
  // "offline" would send the crew looking for signal instead of reporting the real fault
  const failure = Object.assign(new Error("GAS returned an HTML permission page"), { code: "GAS_PERMISSION_HTML" });
  const repository = makeRepository({ refresh: async () => { throw failure; } });

  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).not.toContain("ออฟไลน์");
  expect(app.text()).toContain("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  expect(app.text()).toContain("GAS_PERMISSION_HTML");
  app.unmount();
});

test("the offline stamp carries the time, not just the date", async () => {
  // two snapshots from the same day read identically without it, so a shift-start snapshot looks
  // current to a crew at shift end
  const onLine = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine), source: "indexeddb", fetchedAt: "2026-07-30T02:15:00.000Z", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("2026-07-30 09:15"); // Asia/Bangkok
  app.unmount();
  // an unrestored spy leaves `navigator.onLine` undefined for the rest of the file — a state no
  // browser produces — which quietly steers every later test down the online branch
  onLine.mockRestore();
});

test("a machine switch shows a loading signal instead of the other machine's rings", async () => {
  // the rows are gated until the new machine's snapshot lands; without a signal the empty lists are
  // indistinguishable from "this machine has no data"
  const pending = { resolve: null };
  const repository = makeRepository({
    load: async machine => {
      if (machine === "TBM2") return new Promise(resolve => { pending.resolve = () => resolve({ data: cached("TBM2"), source: "indexeddb", fetchedAt: "x", stale: true }); });
      return { data: cached(machine, { segments: [{ id: "s1", ringNo: "P643", machine: "TBM1" }] }), source: "indexeddb", fetchedAt: "x", stale: true };
    },
    refresh: async machine => {
      if (machine === "TBM2") return new Promise(() => {});
      return { data: snapshot(machine, { segments: [{ id: "s1", ringNo: "P643", machine: "TBM1" }] }), source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false };
    },
  });

  const app = renderApp(repository);
  await act(async () => {});
  // the live header derives the next ring from TBM1's last one
  expect(app.text()).toContain("P644");

  // switch to TBM2 through the machine switcher in the top bar. Scoped to this app's own container:
  // a test that fails before its unmount leaves its app in document.body, and an unscoped query
  // would click that one instead.
  await act(async () => {
    const pill = [...app.container.querySelectorAll("button")].find(b => b.textContent.trim() === "TBM2");
    pill.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(app.text()).toContain("กำลังโหลดข้อมูลของเครื่องนี้");
  expect(app.text()).not.toContain("P644");
  app.unmount();
});

test("the real repository hands App the versions a queued write stamps itself with", async () => {
  // EVERY other test here uses a fake repository, and a fake can hand App a field the real one
  // drops. That is exactly what happened once: `writeServerSnapshot` rebuilds its return value, so
  // a field never reached App and 847 tests passed because the fixture fabricated it. Three of this
  // project's blockers hid in this seam and nothing else crosses it.
  //
  // What crosses it now is `syncMeta`: the version each domain key was last seen at, which every
  // queued write stamps as `baseVersion`. Lose it and every update silently claims version 0, so the
  // server accepts an edit made against a row that has since moved on — a lost update with nothing
  // on screen, which is precisely what `baseVersion` exists to turn into a visible conflict.
  await deleteOfflineDbForTests();
  const repository = createRepository({
    openDb: openOfflineDb,
    now: () => "2026-07-30T02:15:00.000Z",
    fetchServerSnapshot: async machine => ({
      status: "success",
      segments: [],
      shiftReports: [{ id: "sr_old", date: "1999-01-01", shift: "Day", tbmNo: machine, manpower: "{}", result: "{}", events: "{}" }],
      syncMeta: { "shiftReport:TBM1:1999-01-01:Day": { version: 4 } },
    }),
  });

  const app = renderApp(repository);
  // Real IndexedDB work settles on macrotasks, unlike the instant fake repositories elsewhere here,
  // and how many it takes depends on the machine. A fixed number of flushes is not a wait: five was
  // enough on a warm run and not on a cold or loaded one, which made the one test crossing this seam
  // fail about a third of the time — on the very command the plan uses as its gate.
  const waitFor = async (predicate, label) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (predicate()) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    }
    throw new Error(`timed out waiting for ${label}; app shows: ${app.text().slice(0, 300)}`);
  };
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));

  await waitFor(() => Boolean(button(/Shift Report/i)), "the app to finish loading");
  await act(async () => { button(/Shift Report/i).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await waitFor(() => !app.text().includes("กำลังอัปเดตข้อมูลจากเซิร์ฟเวอร์"), "the server snapshot to land");
  // that predicate is also satisfied by the loading and error notices, so name the failure properly
  // rather than reporting a cache or network fault as a gate fault
  expect(app.text()).not.toContain("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  expect(app.text()).not.toContain("กำลังโหลดข้อมูลของเครื่องนี้");

  // Saving that report stamps the version the seam delivered — 0 would mean the snapshot's
  // `syncMeta` never arrived. The save goes through the REAL repository: replacing `mutate` with a
  // spy here, which is what this test used to do, switched off the only seam it exists to cross,
  // and that is precisely where an envelope the repository refuses outright once hid.
  const mutations = [];
  const unsubscribe = repository.subscribe(event => { if (event.type === "mutation") mutations.push(event); });
  await act(async () => {
    const date = app.container.querySelector('[name="date"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(date, "1999-01-01");
    date.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { button(/Save to Cloud/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  // the real `mutate` finishes on an IndexedDB transaction, which completes on a macrotask — the
  // click's own act scope drains microtasks and returns before the write has landed
  await waitFor(() => mutations.length > 0, "the queued mutation to be written");

  expect(mutations).toHaveLength(1);
  expect(mutations[0].domainKey).toBe("shiftReport:TBM1:1999-01-01:Day");
  // and the queue kept what it was stamped with, read back out of IndexedDB
  await expect(repository.getMutation(mutations[0].requestId)).resolves.toMatchObject({
    entityType: "shiftReport",
    domainKey: "shiftReport:TBM1:1999-01-01:Day",
    baseVersion: 4,
  });
  unsubscribe();
  app.unmount();
  await deleteOfflineDbForTests();
});

test("a second save of one record stamps the version the first one confirmed", async () => {
  // `data.syncMeta` only advances on a full `getData`, so on its own the second save of a record in
  // one session still claims the version the last snapshot carried. The server compares base against
  // current exactly, answers `conflict` for a row nobody else touched, and that conflict then sits
  // at the head of its domain and blocks every later edit of the same record — with no conflict UI
  // until Task 10 to show any of it. The core TBM flow hits this on every ring: saved In Progress at
  // excavation, saved again Completed at install.
  // the provider subscribes too, so keep every listener — holding only the last one would deliver
  // the sync event to whichever component happened to mount second
  const listeners = new Set();
  const notify = event => listeners.forEach(listener => listener(event));
  const mutations = [];
  const repository = makeRepository({
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    mutate: async input => { mutations.push(input); return { optimisticRecord: optimisticShape(input) }; },
    refresh: async machine => ({
      data: snapshot(machine, { syncMeta: { "segment:TBM1:P41:Permanent": { version: 1 } } }),
      source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false,
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => /Record · Segment/i.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const setField = (name, value) => act(() => {
    const field = app.container.querySelector(`[name="${name}"]`);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  setField("ringNo", "P41");
  await act(async () => {
    app.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  // the first save is a create, and a create claims nothing whatever the snapshot says: taking the
  // key's version would tell GAS this is a post-conflict successor and merge it onto whatever row
  // already holds that ring
  expect(mutations[0]).toMatchObject({ operation: "create", baseVersion: 0 });

  // the runner drains it; GAS confirms at version 2
  await act(async () => { notify({ type: "sync", requestId: "r1", status: "synced", domainKey: "segment:TBM1:P41:Permanent", version: 2 }); });

  setField("ringNo", "P41");
  await act(async () => {
    app.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(mutations).toHaveLength(2);
  expect(mutations[1].baseVersion).toBe(2); // not 1 — that would be refused as a conflict
  app.unmount();
});

// App now owns the optimistic row: the five record views stopped writing the lists in step 5, and
// nothing tested what replaced them. The two view tests that used to cover this rule were left
// asserting an empty array against views that no longer write at all — green whatever App does.
// submits and returns once the click is flushed — NOT once the save resolves, which is the whole
// window these tests are about. Awaiting a pending save inside `act` deadlocks the scope instead.
async function saveRingOnSegmentForm(app, ring) {
  const nav = label => [...app.container.querySelectorAll("button")].find(b => label.test(b.textContent));
  await act(async () => { nav(/Record · Segment/i).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const field = app.container.querySelector('[name="ringNo"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, ring);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    app.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

test("a ring saved offline is on screen before the server ever sees it", async () => {
  // the whole point of the queue: the crew saves in the tunnel, with no link, and the ring must
  // still count. It is counted by being in the list — the next ring prefills from it.
  const repository = makeRepository({
    mutate: async input => ({ optimisticRecord: optimisticShape(input) }),
  });
  const app = renderApp(repository);
  await act(async () => {});
  await saveRingOnSegmentForm(app, "P644");

  // "Last:" is rendered from the record list, not from the form — reading the form field back would
  // pass on a value that was simply never cleared
  expect(app.text()).toContain("Last: P644");
  app.unmount();
});

test("a ring deleted from the data log leaves the screen before the server confirms", async () => {
  // the queued delete is durable either way; what this covers is the row disappearing. If it stays,
  // the crew press Delete again — and a second delete queues on a domain the first one already
  // emptied, which the server answers for a record it no longer has.
  const sent = [];
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, { segments: [{ id: "s1", ringNo: "P643", machine: "TBM1", date: "2026-07-30", installType: "Permanent", status: "Completed" }] }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async machine => ({ data: snapshot(machine, { segments: [{ id: "s1", ringNo: "P643", machine: "TBM1", date: "2026-07-30", installType: "Permanent", status: "Completed" }] }), source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false }),
    mutate: async input => { sent.push(input); return { optimisticRecord: optimisticShape(input) }; },
  });
  const app = renderApp(repository);
  await act(async () => {});
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => /Data Log · Segment/i.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(app.text()).toContain("P643");

  const click = async el => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await click(app.container.querySelector("tbody tr"));
  await click(app.container.querySelector('[title="Delete"]'));
  await click([...app.container.querySelectorAll("button")].find(b => /^ลบ$/.test(b.textContent)));

  expect(sent.map(input => input.operation)).toEqual(["delete"]);
  expect(app.text()).not.toContain("P643");
  app.unmount();
});

test("a save resolving after the crew navigates away and switches machine does not land", async () => {
  // the switcher is in the TopBar, reachable from every tab, so the crew can save, tap another nav
  // item — the view unmounts, freezing anything it holds — and only then switch machine. Whatever
  // the departed view believed, App is the one that still knows which machine is on screen.
  let release;
  const repository = makeRepository({
    mutate: input => new Promise(resolve => {
      release = () => resolve({ optimisticRecord: optimisticShape(input) });
    }),
  });
  const app = renderApp(repository);
  await act(async () => {});
  await saveRingOnSegmentForm(app, "P644");

  const nav = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
  await act(async () => { nav(/^Home$/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => b.textContent.trim() === "TBM2")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => { release(); });

  expect(app.text()).not.toContain("P644");
  app.unmount();
});

// A test stood here for the photo strip, and it could not fail: carrying the base64 or dropping it
// produces the same DOM, because both leave the photo link hidden — there is no URL to open until
// GAS answers. The rule is about what the list HOLDS, so it is tested where that is visible:
// `displayRecord.test.js`, over the reducer App now applies.

test("every view App hands a write to is also handed the versions to stamp it with", async () => {
  // `syncMeta` is a prop, and a prop that stops being passed fails silently: the envelope builder
  // reads `undefined`, sends `baseVersion: 0`, and GAS compares 0 against the row's real version
  // and answers `conflict` — for a row nobody else touched, on the exact path `baseVersion` exists
  // to protect, with the conflict then blocking that record's domain and no UI until Task 10. The
  // view-level tests cannot see this: they pass `syncMeta` themselves.
  const sent = [];
  const rows = {
    segments: [{ id: "s1", ringNo: "P643", machine: "TBM1", date: "2026-07-30", installType: "Permanent", status: "Completed" }],
    grouts: [{ id: "g1", ringNo: "P643", machine: "TBM1", date: "2026-07-30", partA: "12.5", partB: "6.25", pressure: "3.2", total: 18.75, groutPass: "1st Pass", positions: {} }],
    syncMeta: {
      "segment:TBM1:P643:Permanent": { version: 3 },
      "grout:TBM1:P643:1st Pass": { version: 5 },
    },
  };
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, rows), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async machine => ({ data: snapshot(machine, rows), source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false }),
    mutate: async input => { sent.push(input); return { optimisticRecord: optimisticShape(input) }; },
  });
  const app = renderApp(repository);
  await act(async () => {});
  const nav = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
  const click = async el => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

  for (const [tab, expected] of [[/Data Log · Segment/i, 3], [/Data Log · Grout/i, 5]]) {
    sent.length = 0;
    await click(nav(tab));
    await click(app.container.querySelector("tbody tr"));
    await click(app.container.querySelector('[title="Delete"]'));
    await click([...app.container.querySelectorAll("button")].find(b => /^ลบ$/.test(b.textContent)));
    expect(sent).toHaveLength(1);
    expect(sent[0].baseVersion).toBe(expected);
  }
  app.unmount();
});

test("a version another device moved past wins over the one this device remembers", async () => {
  // `confirmedVersions` is newer than the snapshot only until a second phone writes. Once another
  // device takes the ring to 9 and a refresh carries 9, preferring this device's memory of 2 stamps
  // 2 for the rest of the session: the server answers `conflict` for a row this device merely read
  // stale, and that conflict blocks the ring's domain — the failure this map exists to prevent,
  // arriving from the other side.
  let notify = () => {};
  const listeners = new Set();
  const sent = [];
  const segments = [{ id: "s1", ringNo: "P643", machine: "TBM1", date: "2026-07-30", installType: "Permanent", status: "Completed" }];
  let serverVersion = 2;
  const repository = makeRepository({
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    load: async machine => ({ data: cached(machine, { segments }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async machine => ({
      data: snapshot(machine, { segments, syncMeta: { "segment:TBM1:P643:Permanent": { version: serverVersion } } }),
      source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false,
    }),
    mutate: async input => { sent.push(input); return { optimisticRecord: optimisticShape(input) }; },
  });
  notify = event => listeners.forEach(listener => listener(event));

  const app = renderApp(repository);
  await act(async () => {});
  // this device's own write confirms at 2...
  await act(async () => { notify({ type: "sync", requestId: "r1", status: "synced", domainKey: "segment:TBM1:P643:Permanent", version: 2 }); });
  // ...then another device takes the ring to 9 and a refresh brings that back
  serverVersion = 9;
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => b.textContent.trim() === "TBM2")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => b.textContent.trim() === "TBM1")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const nav = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
  const click = async el => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await click(nav(/Data Log · Segment/i));
  await click(app.container.querySelector("tbody tr"));
  await click(app.container.querySelector('[title="Delete"]'));
  await click([...app.container.querySelectorAll("button")].find(b => /^ลบ$/.test(b.textContent)));

  expect(sent[sent.length - 1].baseVersion).toBe(9);
  app.unmount();
});

test("a write the queue cannot finish is said out loud", async () => {
  // The one thing worth interrupting for. A stuck mutation keeps its row on screen looking recorded
  // while the sheet has never seen it, and the queue orders per record, so everything the crew does
  // to that ring afterwards waits behind it. Task 10 resolves them; until then the counts existed
  // and nothing read them, so the crew could not tell "queued" from "never going".
  const repository = makeRepository({
    // `blocked` is the records queued behind a stuck head: never posted, so never "on their way".
    // Counted separately by `getSyncCounts`, and the strip has to add it — three rings stranded
    // behind one conflict is three, and reporting one is a straight untruth about how much work
    // is not on the sheet.
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 1, errors: 2, blocked: 4, lastSyncedAt: null }),
  });
  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("7 รายการต้องแก้");
  app.unmount();
});

test("the queue's state is said alongside the other notices, not instead of them", async () => {
  // A stuck write lasts until Task 10 exists, so a branch of its own would have permanently taken
  // the strip's one line — including from "บันทึกลงเครื่องไม่ได้", which says the queue is not
  // durable at all and outranks anything in it. And the quiet half, sitting last, could never appear
  // while the device was offline: the one situation it exists for.
  const repository = makeRepository({
    getSyncSummary: async () => ({ online: false, pending: 2, syncing: 0, conflicts: 1, errors: 0, blocked: 0, lastSyncedAt: null }),
    refresh: async machine => ({ data: snapshot(machine), source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false, cacheError: new Error("QuotaExceededError") }),
  });
  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("บันทึกลงเครื่องไม่ได้"); // still the headline
  expect(app.text()).toContain("1 รายการต้องแก้");       // and the queue is reported too
  // stuck and waiting are different facts and both are true here: collapsing them understated how
  // much work is not on the sheet
  expect(app.text()).toContain("2 รายการรอซิงก์");
  app.unmount();
});

test("a device mid-refresh, and one that cannot reach the server, are told too", async () => {
  // the last two branches of the strip. Each was written to carry the queue note and each could
  // drop it with the suite green, so both are driven here — one where the refresh is still in
  // flight, one where it failed while the device was online.
  const summary = { online: true, pending: 4, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null };
  const refreshing = makeRepository({
    getSyncSummary: async () => summary,
    refresh: async () => new Promise(() => {}),
  });
  const app = renderApp(refreshing);
  await act(async () => {});
  expect(app.text()).toContain("กำลังอัปเดตข้อมูลจากเซิร์ฟเวอร์");
  expect(app.text()).toContain("4 รายการรอซิงก์");
  app.unmount();

  const failed = makeRepository({
    getSyncSummary: async () => summary,
    load: async machine => ({ data: cached(machine), source: "indexeddb", fetchedAt: "2026-07-30T02:15:00.000Z", stale: true }),
    refresh: async () => { throw Object.assign(new Error("permission page"), { code: "GAS_PERMISSION_HTML" }); },
  });
  const second = renderApp(failed);
  await act(async () => {});
  expect(second.text()).toContain("GAS_PERMISSION_HTML");
  expect(second.text()).toContain("4 รายการรอซิงก์");
  second.unmount();
});

test("an offline device is told what it is still holding", async () => {
  // The branch this rule was written for. The quiet note used to sit last in the chain, after the
  // stale-snapshot branch — so on the one screen where "saved" most needs qualifying, it never
  // appeared. Offline is not an error state here: the crew is recording, and the queue is filling.
  const repository = makeRepository({
    getSyncSummary: async () => ({ online: false, pending: 3, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
    load: async machine => ({ data: cached(machine), source: "indexeddb", fetchedAt: "2026-07-30T02:15:00.000Z", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
  });
  const onLine = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("ออฟไลน์");
  expect(app.text()).toContain("3 รายการรอซิงก์");
  app.unmount();
  onLine.mockRestore();
});

test("a machine still loading is told too", async () => {
  // same rule on the branch a machine switch takes: the lists are empty because this machine's
  // snapshot has not landed, and the queue is a separate fact that stays true throughout
  const repository = makeRepository({
    getSyncSummary: async () => ({ online: true, pending: 1, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
    load: async machine => (machine === "TBM2"
      ? new Promise(() => {})
      : { data: cached(machine), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async machine => (machine === "TBM2"
      ? new Promise(() => {})
      : { data: snapshot(machine), source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false }),
  });
  const app = renderApp(repository);
  await act(async () => {});
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => b.textContent.trim() === "TBM2")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(app.text()).toContain("กำลังโหลดข้อมูลของเครื่องนี้");
  expect(app.text()).toContain("1 รายการรอซิงก์");
  app.unmount();
});

test("a ring deleted and recorded again in one session reaches the sheet", async () => {
  // The whole correction the app prescribes when it refuses to re-identify a record, done the way a
  // crew does it, in one sitting with no relaunch. A tombstone is not inert on the server: a create
  // that does not claim its version is refused, and the refusal then parks at the head of that
  // ring's domain, where every later record for the ring queues behind it and is never sent at all.
  //
  // Tested through App's `syncMeta` — the map the views actually read. The repository-level pin for
  // this rule reads `repository.load`, which the app calls only when it hydrates; between hydrations
  // the flag has to survive App's own merge, and it did not.
  const sent = [];
  const listeners = new Set();
  const notify = event => listeners.forEach(listener => listener(event));
  const repository = makeRepository({
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    load: async machine => ({ data: cached(machine, { syncMeta: { "segment:TBM1:P644:Permanent": { version: 1 } } }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async machine => ({ data: snapshot(machine, { syncMeta: { "segment:TBM1:P644:Permanent": { version: 1 } } }), source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false }),
    mutate: async input => { sent.push(input); return { optimisticRecord: optimisticShape(input) }; },
  });
  const app = renderApp(repository);
  await act(async () => {});

  // the crew deletes the ring, and the drain confirms it at version 2
  await act(async () => { notify({ type: "sync", requestId: "r1", status: "synced", domainKey: "segment:TBM1:P644:Permanent", version: 2, deleted: true }); });

  // and records it again straight away
  await saveRingOnSegmentForm(app, "P644");

  const create = sent[sent.length - 1];
  expect(create.operation).toBe("create");
  expect(create.baseVersion).toBe(2); // claims the tombstone, which is what lifts it
  app.unmount();
});

test("a write that dies terminally stops being counted as on its way", async () => {
  // `updateMutation` is the only path to a validation or permanent error, and the summary is
  // recomputed on repository events. With no event, the mutation's own queueing event was the last
  // word — so the strip went on reporting a dead write as still in flight, which is worse than
  // saying nothing. Driven through the real repository, because the fault was that it stayed quiet.
  await deleteOfflineDbForTests();
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [] }) });
  const seen = [];
  repository.subscribe(event => seen.push(event.status));
  const queued = await repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM1", recordId: "s1",
    payload: { id: "s1", ringNo: "P644" }, baseVersion: 0, domainKey: "segment:TBM1:P644:Permanent",
  });

  await repository.updateMutation(queued.requestId, { status: "validation_error", lastError: { code: "SYNC_FIELD_TOO_LARGE" } });

  expect(seen).toContain("validation_error");
  await expect(repository.getSyncSummary()).resolves.toMatchObject({ pending: 0, errors: 1 });
  await deleteOfflineDbForTests();
});

test("records stranded behind a stuck one are counted as stuck, not as travelling", async () => {
  // The queue orders per record and a conflicted head is never claimable again, so everything after
  // it on that ring is never posted at all. Reported as pending it reads as work in progress; the
  // truth is that none of it can move until Task 10 can resolve the head.
  await deleteOfflineDbForTests();
  const repository = createRepository({ openDb: openOfflineDb, fetchServerSnapshot: async () => ({ segments: [] }) });
  const queue = async (recordId, ring) => repository.mutate({
    entityType: "segment", operation: "create", machine: "TBM1", recordId,
    payload: { id: recordId, ringNo: ring }, baseVersion: 0, domainKey: `segment:TBM1:${ring}:Permanent`,
  });
  const head = await queue("s1", "P644");
  await queue("s2", "P644");            // same ring: queued behind
  await queue("s3", "P645");            // a different ring: genuinely on its way
  await repository.updateMutation(head.requestId, { status: "validation_error", lastError: { code: "SYNC_FIELD_TOO_LARGE" } });

  await expect(repository.getSyncSummary()).resolves.toMatchObject({ errors: 1, blocked: 1, pending: 1 });
  await deleteOfflineDbForTests();
});

test("the queue is reported even when the app could not load anything", async () => {
  // a fresh install on site with no signal: the launch banner is up, the app still records, and this
  // is exactly when nobody has told the crew there is a queue at all
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine), source: "empty", fetchedAt: null, stale: true }),
    refresh: async () => { throw Object.assign(new Error("Failed to fetch"), { code: "NETWORK" }); },
    getSyncSummary: async () => ({ online: false, pending: 2, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  });
  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("ไม่สามารถดึงข้อมูลได้"); // the launch banner, still there
  expect(app.text()).toContain("2 รายการรอซิงก์");        // and the queue, no longer hidden by it
  app.unmount();
});

test("work still on its way out is said quietly", async () => {
  // "saved" here means saved on this device, and nothing else on screen distinguishes the two
  const repository = makeRepository({
    getSyncSummary: async () => ({ online: true, pending: 2, syncing: 1, conflicts: 0, errors: 0, lastSyncedAt: null }),
  });
  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("3 รายการรอซิงก์");
  app.unmount();
});

// App's mirror also strips queued photo bytes (a stored record keeps them — the queue still has to
// send them — and `readServerSnapshot` hands that payload straight back). There is deliberately no
// test for it HERE: carrying the bytes or dropping them renders identically, because neither state
// puts a photo link on screen, so any DOM assertion would pass whatever the mirror did. The rule is
// about what the list holds and is tested where that is visible, in `displayRecord.test.js`. This
// note exists because the same vacuous test was written twice before this was understood.

test("a queued write starts the drain instead of waiting for the next app event", async () => {
  // without this the record is durable but idle: it goes out on the next online/focus/
  // visibilitychange, which on a phone left face-up at the site office may be a long time
  const runNow = jest.fn(async () => {});
  const repository = makeRepository({ mutate: async input => ({ optimisticRecord: optimisticShape(input) }) });
  const app = renderApp(repository, { runNow });
  await act(async () => {});
  // the refresh path drains too, so only the calls AFTER the snapshot has settled say anything about
  // the save — asserting "was called at all" passes with the save's own trigger deleted
  const beforeSave = runNow.mock.calls.length;
  await saveRingOnSegmentForm(app, "P644");

  expect(runNow.mock.calls.length).toBeGreaterThan(beforeSave);
  app.unmount();
});

test("a save resolving after a machine switch does not land in the other machine", async () => {
  // the machine switcher sits in the TopBar, reachable from every tab, and a save takes seconds on a
  // tunnel link. Appending TBM1's ring to TBM2's list is what makes the record form derive the next
  // ring from the wrong machine and the dashboard send an update carrying an id TBM2's sheet has
  // never had. The queue keeps the write either way; only the on-screen copy is withheld.
  let release;
  const repository = makeRepository({
    mutate: input => new Promise(resolve => {
      release = () => resolve({ optimisticRecord: optimisticShape(input) });
    }),
  });
  const app = renderApp(repository);
  await act(async () => {});
  await saveRingOnSegmentForm(app, "P644");

  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => b.textContent.trim() === "TBM2")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => { release(); });

  expect(app.text()).not.toContain("Last: P644");
  expect(app.text()).not.toContain("P645"); // nor a next ring derived from it
  app.unmount();
});

test("a launch with no snapshot at all still reports the failure", async () => {
  const repository = makeRepository({
    load: async () => { throw new Error("IDB blocked"); },
    refresh: async () => { throw new Error("Failed to fetch"); },
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("ไม่สามารถดึงข้อมูลได้");
  app.unmount();
});

test("a record another device deleted leaves this screen; an empty collection with no tombstone does not", async () => {
  // Step 5b. `normalizeServerData` maps an absent key to [], and `getSheetDataAsJson` returns [] for
  // a sheet that does not exist, so "the server sent none" cannot be told from "the server has none"
  // by emptiness — not even with `present`. The discriminator is the tombstone GAS already ships:
  // `syncMeta[recordKey].deleted`. A row named by one goes; everything else stays.
  let answer;
  const repository = makeRepository({
    load: async machine => ({
      data: cached(machine, { issues: [
        { id: "iss_gone", machine: "TBM1", title: "ลบจากเครื่องอื่น", status: "open" },
        { id: "iss_stay", machine: "TBM1", title: "ยังอยู่", status: "open" },
      ] }),
      source: "indexeddb", fetchedAt: "x", stale: true,
    }),
    refresh: machine => new Promise(resolve => {
      answer = () => resolve({
        data: snapshot(machine, { issues: [], syncMeta: { "issue:GLOBAL:iss_gone": { version: 3, deleted: true } } }),
        source: "server", fetchedAt: "x", stale: false,
      });
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  expect(app.text()).toContain("ลบจากเครื่องอื่น");

  await act(async () => { answer(); });

  expect(app.text()).not.toContain("ลบจากเครื่องอื่น"); // the tombstone took it off
  expect(app.text()).toContain("ยังอยู่");              // an empty list alone takes nothing off
  app.unmount();
});

test("an offline launch shows the cached prep tasks and route config, not factory seeds", async () => {
  // Step 5 removed the localStorage seed these two rendered from. Their state was still gated on
  // `source === "server"`, so an offline launch showed an empty Work Plan and — worse than blank —
  // a Route page filled with `DEFAULT_ROUTE_LEGS`, i.e. factory distances standing in for the
  // crew's saved route.
  const repository = makeRepository({
    load: async machine => ({
      data: cached(machine, {
        prepTasks: [{ id: "pt_1", machine: "TBM1", name: "งานเตรียมจาก snapshot", start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [] }],
        routeConfigs: { TBM1: { legs: [{ order: "1.1", level: 2, name: "ช่วงที่ทีมบันทึกไว้", plannedDistance: 4321, remark: "" }] } },
      }),
      source: "indexeddb", fetchedAt: "x", stale: true,
    }),
    refresh: async () => { throw new Error("NETWORK"); },
  });

  const app = renderApp(repository);
  await act(async () => {});
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));

  await act(async () => { button(/Work Plan/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(app.text()).toContain("งานเตรียมจาก snapshot");

  await act(async () => { button(/Route & Schedule/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(app.text()).toContain("ช่วงที่ทีมบันทึกไว้");
  expect(app.text()).not.toContain("Main Shaft รัชดา"); // a DEFAULT_ROUTE_LEGS name — the seed must not stand in
  app.unmount();
});

test("a prep task tombstoned on the machine the payload does not carry still leaves the screen", async () => {
  // The `carried` rule keeps the rows of a machine the payload never mentions. A tombstone outranks
  // it: the server named that row deleted, and "keeping its own rows" must not mean keeping it.
  let carriesBoth = true;
  const both = [
    { id: "pt_tbm1", machine: "TBM1", name: "งานเตรียม TBM1", start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [] },
    { id: "pt_tbm2", machine: "TBM2", name: "งานเตรียม TBM2", start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [] },
  ];
  const repository = makeRepository({
    refresh: async machine => ({
      data: snapshot(machine, carriesBoth
        ? { prepTasks: both }
        : { prepTasks: [both[0]], syncMeta: { "prepTask:TBM2:pt_tbm2": { version: 4, deleted: true } } }),
      source: "server", fetchedAt: "x", stale: false,
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
  await act(async () => { button(/Work Plan/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });

  carriesBoth = false;
  await act(async () => { button(/^TBM2$/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => {});

  expect(app.text()).not.toContain("งานเตรียม TBM2");
  app.unmount();
});

test("an instrument family the server tombstones leaves the screen, and an empty one does not", async () => {
  // `mirrorInst` is five call sites of one rule, and all five were unasserted: replacing them with a
  // wholesale set stayed green. The instrument module is 245 instruments and 731 readings.
  let answer;
  const repository = makeRepository({
    load: async machine => ({
      data: cached(machine, {
        instLocations: [{ id: "L1", name: "IS2 Shaft" }, { id: "L2", name: "IS1 Shaft" }],
      }),
      source: "indexeddb", fetchedAt: "x", stale: true,
    }),
    refresh: machine => new Promise(resolve => {
      answer = () => resolve({
        data: snapshot(machine, { instLocations: [], syncMeta: { "instLocation:GLOBAL:L2": { version: 3, deleted: true } } }),
        source: "server", fetchedAt: "x", stale: false,
      });
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
  await act(async () => { button(/Instrument/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(app.text()).toContain("IS2 Shaft");

  await act(async () => { answer(); });

  expect(app.text()).toContain("IS2 Shaft"); // an empty response takes nothing off
  expect(app.text()).not.toContain("IS1 Shaft"); // the tombstoned one goes
  app.unmount();
});

test("an empty response leaves the prep tasks and daily reports the cache already holds", async () => {
  // The two `applyServerRows` call sites in App that no test reached. The prep-task one is the
  // else-branch, which runs ONLY when the payload carries no prep tasks at all — the missing-sheet
  // and partial-`doGet` case the rule exists for.
  let answer;
  const repository = makeRepository({
    load: async machine => ({
      data: cached(machine, {
        prepTasks: [{ id: "pt_1", machine: "TBM1", name: "งานเตรียมที่แคชไว้", start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [] }],
        dailyReports: [{ id: "dr_1", machine: "TBM1", date: "2026-07-30", area: "IS2 ที่แคชไว้" }],
      }),
      source: "indexeddb", fetchedAt: "x", stale: true,
    }),
    refresh: machine => new Promise(resolve => {
      answer = () => resolve({ data: snapshot(machine, { prepTasks: [], dailyReports: [] }), source: "server", fetchedAt: "x", stale: false });
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
  await act(async () => { answer(); });

  await act(async () => { button(/Work Plan/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(app.text()).toContain("งานเตรียมที่แคชไว้");
  await act(async () => { button(/Daily Report/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(app.text()).toContain("IS2 ที่แคชไว้");
  app.unmount();
});

test("the sync status button is on every page, and opens the Sync Center", async () => {
  // Step 7: `TopBar.rightSlot` on every tab, panels at the Shell root. A stuck write is not a fact
  // about one page, and a crew who has to find the right screen to learn about it will not.
  const repository = makeRepository({
    getSyncSummary: async () => ({ online: true, pending: 2, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
    getSyncCenter: async () => ({ pending: [], blocked: [], errors: [], conflicts: [], recent: [] }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));

  expect(button(/กำลังส่ง/)).toBeTruthy();
  await act(async () => { button(/Work Plan/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(button(/กำลังส่ง/)).toBeTruthy(); // still there on another tab

  await act(async () => { button(/กำลังส่ง/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => {});

  expect(app.text()).toContain("สถานะการซิงก์");
  app.unmount();
});

test("the install panel is in the More sheet as well as the Sync Center", async () => {
  // Step 5 names both surfaces. On a phone the More sheet is the discovery one.
  const repository = makeRepository({
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
    getSyncCenter: async () => ({ pending: [], blocked: [], errors: [], conflicts: [], recent: [], superseded: [], discarded: [] }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));

  await act(async () => { button(/More/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });

  expect(app.text()).toContain("ติดตั้งแอปบนมือถือ");
  app.unmount();
});

test("the viewer link carries no sync controls and is not told to open them", async () => {
  // `?view=1` is the owner's read-only link. A crew member opening it on their own working phone
  // would otherwise get live retry and discard over their OWN unsent rings, and a status line
  // pointing at a button that is not there.
  const search = window.location.search;
  delete window.location;
  window.location = { ...window.location, search: "?view=1", origin: "http://localhost", pathname: "/" };
  try {
    const repository = makeRepository({
      getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 2, errors: 0, blocked: 0, lastSyncedAt: null }),
      getSyncCenter: async () => ({ pending: [], blocked: [], errors: [], conflicts: [], recent: [], superseded: [], discarded: [] }),
    });

    const app = renderApp(repository);
    await act(async () => {});

    expect([...app.container.querySelectorAll("button")].some(b => /ต้องแก้/.test(b.textContent))).toBe(false);
    expect(app.text()).not.toContain("เปิด “สถานะการซิงก์”"); // the string the code actually renders
    app.unmount();
  } finally {
    delete window.location;
    window.location = { ...window.location, search };
  }
});

test("a legacy difference can be marked reviewed from the running app", async () => {
  // The wire that makes the ตรวจแล้ว button exist: `SyncCenter`'s own tests mount it with their own
  // handler, so removing `onReview` from `OfflineControls` left the user-facing half unpinned.
  const reviewed = jest.fn(async () => ({ status: "resolved" }));
  let cleared = false;
  const legacy = {
    conflictId: "legacy:tbmIssues:issue:GLOBAL:issue-9", requestId: null, actionable: false,
    entityType: "issue", machine: "GLOBAL", recordId: "issue-9", domainKey: "issue:GLOBAL:issue-9",
    localRecord: { id: "issue-9", title: "ในเครื่อง" }, serverRecord: { id: "issue-9", title: "บนเซิร์ฟเวอร์" },
    reason: "legacy_local_difference", currentVersion: null,
  };
  const repository = makeRepository({
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: cleared ? 0 : 1, errors: 0, blocked: 0, lastSyncedAt: null }),
    getSyncCenter: async () => ({ pending: [], blocked: [], errors: [], conflicts: cleared ? [] : [legacy], recent: [], superseded: [], discarded: [] }),
    reviewLegacyDifference: async id => { cleared = true; return reviewed(id); },
  });

  const app = renderApp(repository);
  await act(async () => {});
  const button = pattern => [...app.container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
  await act(async () => { button(/ต้องแก้/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => {});
  await act(async () => { button(/ขัดแย้ง/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });

  expect(app.text()).toContain("issue-9");
  await act(async () => { button(/ตรวจแล้ว/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => {});

  expect(reviewed).toHaveBeenCalledWith("legacy:tbmIssues:issue:GLOBAL:issue-9");
  expect(app.text()).toContain("ไม่มีรายการขัดแย้ง");
  app.unmount();
});

test("keeping the server's row on a conflicted delete puts the ring back on the screen, not just in the store", async () => {
  // The button means KEEP THE RING, and the panel says so. Neither `discardMutation` nor
  // `resolveConflict` returns a row for App to mirror, and `useOfflineData` re-read only on mount,
  // machine switch and an explicit refresh — so the store had the ring back and the data log did
  // not, until the next successful getData, which underground is the next shift.
  let listeners = [];
  let rows = [];
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, { segments: rows }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
    subscribe: listener => { listeners.push(listener); return () => { listeners = listeners.filter(item => item !== listener); }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  // the live header derives the next ring from the last one it holds, so an empty machine names none
  expect(app.text()).not.toContain("P644");

  // the resolution lands in the store, and the repository says so
  rows = [{ id: "seg-P643", ringNo: "P643", machine: "TBM1", installType: "Permanent" }];
  await act(async () => { listeners.forEach(listener => listener({ type: "conflict", conflictId: "c1", status: "resolved" })); });
  await act(async () => {});

  expect(app.text()).toContain("P644"); // P643 is back, so the next ring is named again
  app.unmount();
});

test("a discarded write's screen change lands without a refresh too", async () => {
  let listeners = [];
  let rows = [{ id: "seg-P644", ringNo: "P644", machine: "TBM1", installType: "Permanent" }];
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, { segments: rows }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
    subscribe: listener => { listeners.push(listener); return () => { listeners = listeners.filter(item => item !== listener); }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  expect(app.text()).toContain("P645"); // the ring after the one on screen

  rows = []; // the discarded create's row is gone from the store
  await act(async () => { listeners.forEach(listener => listener({ type: "mutation", requestId: "r1", status: "discarded" })); });
  await act(async () => {});

  expect(app.text()).not.toContain("P645");
  app.unmount();
});
