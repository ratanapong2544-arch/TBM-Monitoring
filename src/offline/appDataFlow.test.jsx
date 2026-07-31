import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

// so React warns when an update escapes an act scope; this file drives the whole App asynchronously
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import App from "../App";
import { OfflineProvider } from "./OfflineProvider";
import { emptyServerData, normalizeServerData } from "./normalizeServerData";
import { createRepository } from "./repository";
import { deleteOfflineDbForTests, openOfflineDb } from "./db";
import { apiCall } from "../utils/api";
import { __resetShiftSaveStateForTests, SHIFT_SAVE_TIMEOUT_MS } from "../components/views/ShiftReportView";

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

function renderApp(repository) {
  let container;
  let root;
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(
      <OfflineProvider deps={{
        openDb: async () => ({}),
        stageLegacyLocalStorage: async () => {},
        createRepository: () => repository,
        createSyncRunner: () => ({ start: async () => {}, stop: () => {} }),
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
    // `serverPayload` mirrors the real repository: the GAS response untouched, which is what a
    // caller asking "is this on the sheet?" must read rather than the merged snapshot
    refresh: async machine => ({ data: snapshot(machine), serverPayload: { status: "success", shiftReports: [] }, source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false }),
    subscribe: () => () => {},
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, lastSyncedAt: null }),
    setSyncMetaValue: async () => {},
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  apiCall.mockImplementation(async () => ({ status: "success" }));
  __resetShiftSaveStateForTests();
});
afterEach(() => window.localStorage.clear());

test("an offline relaunch keeps unsynced issues that only exist in localStorage", async () => {
  // load() always succeeds offline; mirroring that snapshot into state persisted it straight back
  // over the crew's offline-created record
  window.localStorage.setItem("tbmIssues", JSON.stringify([
    { id: "iss_offline_1", machine: "TBM1", title: "Offline issue", status: "open" },
    { id: "iss_server_1", machine: "TBM1", title: "Server issue", status: "open" },
  ]));
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, { issues: [{ id: "iss_server_1", machine: "TBM1", title: "Server issue", status: "open" }] }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
  });

  const app = renderApp(repository);
  await act(async () => {});

  const ids = JSON.parse(window.localStorage.getItem("tbmIssues")).map(i => i.id);
  expect(ids).toEqual(expect.arrayContaining(["iss_offline_1", "iss_server_1"]));
  app.unmount();
});

test("an offline relaunch keeps an unsynced route config", async () => {
  window.localStorage.setItem("tbmRouteConfig", JSON.stringify({ plannedDistance: 1234.56 }));
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine, { routeConfigs: { TBM1: { plannedDistance: 1000 } } }), source: "indexeddb", fetchedAt: "x", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(JSON.parse(window.localStorage.getItem("tbmRouteConfig"))).toEqual({ plannedDistance: 1234.56 });
  app.unmount();
});

test("a server response with an absent collection does not erase local business data", async () => {
  // normalizeServerData maps an absent key to [], so an older GAS deployment or a partial doGet is
  // indistinguishable from a real deletion. Every gated collection must survive it — asserting only
  // prepTasks was vacuous, because an empty list produces no per-machine writes either way.
  window.localStorage.setItem("tbmPrepTasks_TBM2", JSON.stringify([{ id: "pt_local", title: "Local prep" }]));
  window.localStorage.setItem("tbmIssues", JSON.stringify([{ id: "iss_local", machine: "TBM1", title: "Local", status: "open" }]));
  window.localStorage.setItem("tbmDailyReports", JSON.stringify([{ id: "dr_local", machine: "TBM1", date: "2026-07-29" }]));
  window.localStorage.setItem("instReadings", JSON.stringify([{ id: "rd_local", instrumentId: "in1" }]));
  const repository = makeRepository({
    refresh: async machine => ({
      data: snapshot(machine, { prepTasks: [], issues: [], dailyReports: [], instReadings: [] }),
      source: "server", fetchedAt: "x", stale: false,
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(JSON.parse(window.localStorage.getItem("tbmPrepTasks_TBM2"))).toEqual([{ id: "pt_local", title: "Local prep" }]);
  expect(JSON.parse(window.localStorage.getItem("tbmIssues")).map(i => i.id)).toEqual(["iss_local"]);
  expect(JSON.parse(window.localStorage.getItem("tbmDailyReports")).map(r => r.id)).toEqual(["dr_local"]);
  expect(JSON.parse(window.localStorage.getItem("instReadings")).map(r => r.id)).toEqual(["rd_local"]);
  app.unmount();
});

test("a server response only rewrites the machines it actually carries", async () => {
  window.localStorage.setItem("tbmPrepTasks_TBM2", JSON.stringify([{ id: "pt_tbm2_local", title: "Local TBM2" }]));
  const repository = makeRepository({
    refresh: async machine => ({ data: snapshot(machine, { prepTasks: [{ id: "pt_tbm1", machine: "TBM1", title: "Server TBM1" }] }), source: "server", fetchedAt: "x", stale: false }),
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(JSON.parse(window.localStorage.getItem("tbmPrepTasks_TBM1"))).toEqual([{ id: "pt_tbm1", machine: "TBM1", title: "Server TBM1" }]);
  expect(JSON.parse(window.localStorage.getItem("tbmPrepTasks_TBM2"))).toEqual([{ id: "pt_tbm2_local", title: "Local TBM2" }]);
  app.unmount();
});

test("a live server response does replace the collections it carries", async () => {
  window.localStorage.setItem("tbmIssues", JSON.stringify([{ id: "iss_old", machine: "TBM1", title: "Old", status: "open" }]));
  const repository = makeRepository({
    refresh: async machine => ({ data: snapshot(machine, { issues: [{ id: "iss_new", machine: "TBM1", title: "New", status: "open" }] }), source: "server", fetchedAt: "x", stale: false }),
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(JSON.parse(window.localStorage.getItem("tbmIssues")).map(i => i.id)).toEqual(["iss_new"]);
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

  // saving that report stamps the version the seam delivered — 0 would mean the snapshot's
  // `syncMeta` never arrived
  const mutations = [];
  repository.mutate = async input => { mutations.push(input); return { optimisticRecord: input.payload }; };
  await act(async () => {
    const date = app.container.querySelector('[name="date"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(date, "1999-01-01");
    date.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { button(/Save to Cloud/).dispatchEvent(new MouseEvent("click", { bubbles: true })); });

  expect(mutations).toHaveLength(1);
  expect(mutations[0]).toMatchObject({
    entityType: "shiftReport",
    domainKey: "shiftReport:TBM1:1999-01-01:Day",
    baseVersion: 4,
  });
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
    mutate: async input => { mutations.push(input); return { optimisticRecord: input.payload }; },
    refresh: async machine => ({
      data: snapshot(machine, { syncMeta: { "segment:TBM1:P41:Permanent": { version: 1 } } }),
      serverPayload: { status: "success", shiftReports: [] },
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
  expect(mutations[0].baseVersion).toBe(1);

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
    mutate: async input => ({ optimisticRecord: { ...input.payload, id: input.recordId } }),
  });
  const app = renderApp(repository);
  await act(async () => {});
  await saveRingOnSegmentForm(app, "P644");

  // "Last:" is rendered from the record list, not from the form — reading the form field back would
  // pass on a value that was simply never cleared
  expect(app.text()).toContain("Last: P644");
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
      release = () => resolve({ optimisticRecord: { ...input.payload, id: input.recordId } });
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
