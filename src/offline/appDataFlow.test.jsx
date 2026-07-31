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

test("a blocked shift report can be unblocked from the app itself", async () => {
  // Twice now the blocker lived in this seam rather than in either component: the view's own tests
  // all passed while App fed it the wrong prop. The check button is the ONLY way out of a blocked
  // report, and nothing else in the app calls `refresh`, so a missing or wrong prop here would be
  // invisible to every other test.
  jest.useFakeTimers();
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  try {
    apiCall.mockImplementation(() => new Promise(() => {})); // the save never answers
    let refreshes = 0;
    const repository = makeRepository({
      refresh: async machine => {
        refreshes += 1;
        return { data: snapshot(machine), serverPayload: { status: "success", shiftReports: [] }, source: "server", fetchedAt: "2026-07-30T02:15:00.000Z", stale: false };
      },
    });

    const app = renderApp(repository);
    await act(async () => {});
    const afterHydration = refreshes;

    await act(async () => {
      [...app.container.querySelectorAll("button")].find(b => /Shift Report/i.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      [...app.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });
    expect(app.text()).toContain("ไม่ทราบผลการบันทึกล่าสุด");

    await act(async () => {
      [...app.container.querySelectorAll("button")].find(b => /ตรวจสอบกับเซิร์ฟเวอร์/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(refreshes).toBe(afterHydration + 1);            // it reached the repository
    expect(app.text()).not.toContain("ไม่ทราบผลการบันทึกล่าสุด"); // and the report is saveable again
    app.unmount();
  } finally {
    alertSpy.mockRestore();
    jest.useRealTimers();
    apiCall.mockImplementation(async () => ({ status: "success" }));
  }
});

test("a cold launch cannot append a second report for a shift that already has one", async () => {
  // This needs no server fault and no timeout. On a cold cache the splash clears as soon as the
  // (empty) cache pass settles, so the Shift Report form renders BLANK and editable for as long as
  // the snapshot takes — up to the 90 s fetch ceiling. A night crew filling in a shift the day crew
  // already saved would append a second row for the same date and shift, silently.
  let release;
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine), source: "empty", fetchedAt: null, stale: true }),
    refresh: machine => new Promise(resolve => {
      release = () => resolve({
        data: snapshot(machine, { shiftReports: [{ id: "sr_day", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: {}, result: {}, events: {} }] }),
        serverPayload: { status: "success", shiftReports: [] },
        source: "server", fetchedAt: "2026-07-30T02:15:00.000Z", stale: false,
      });
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => /Shift Report/i.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(app.text()).toContain("ยังไม่ได้ข้อมูลรายงานกะของเครื่องนี้จากเซิร์ฟเวอร์");
  // asserting a click on a disabled button proves nothing — React never dispatches it. The runtime
  // guard is pinned through the auto-save path in shiftReportMidEdit.test.jsx; here the disabled
  // state IS the assertion.
  expect([...app.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent)).disabled).toBe(true);

  // once the machine's rows arrive, saving is available again
  await act(async () => { release(); });
  expect(app.text()).not.toContain("ยังไม่ได้ข้อมูลรายงานกะของเครื่องนี้จากเซิร์ฟเวอร์");
  expect([...app.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent)).disabled).toBe(false);
  app.unmount();
});

test("the real repository hands App everything the create-a-report gate needs", async () => {
  // EVERY other test here uses a fake repository, and a fake can hand App a field the real one
  // drops. That is exactly what happened: `writeServerSnapshot` rebuilds its return value, so
  // `present` never reached App, the gate was closed on every healthy device, and 847 tests passed
  // because the fixture fabricated the field. This test uses the real repository over real
  // (fake-indexeddb) storage, so only the actual production path can satisfy it.
  await deleteOfflineDbForTests();
  const repository = createRepository({
    openDb: openOfflineDb,
    now: () => "2026-07-30T02:15:00.000Z",
    // a date that can never be today: if the row matched the open form, `existingReport` would be
    // truthy, the save would be an update, and the gate would be irrelevant — the assertions would
    // pass whatever `present` held
    fetchServerSnapshot: async machine => ({
      status: "success",
      segments: [],
      shiftReports: [{ id: "sr_old", date: "1999-01-01", shift: "Day", tbmNo: machine, manpower: "{}", result: "{}", events: "{}" }],
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

  expect(app.text()).not.toContain("ยังไม่ได้ข้อมูลรายงานกะของเครื่องนี้จากเซิร์ฟเวอร์");
  expect(button(/Save to Cloud/).disabled).toBe(false);
  app.unmount();
  await deleteOfflineDbForTests();
});

test("a cached snapshot does not satisfy the create-a-report gate", async () => {
  // The gate is against creating a second report for a shift that already has one, so only a SERVER
  // answer settles it. Yesterday's cache does not contain the report the other crew filed at 19:00,
  // and `source !== "empty"` — the first version of this predicate — accepted it.
  //
  // The cached data here deliberately CARRIES `present`, which a real cache read never does. That is
  // the point: it isolates the `source === "server"` half of the predicate, which otherwise nothing
  // can fail. Without it the two halves are indistinguishable — every cache read lacks `present`, so
  // deleting the source check would leave the whole suite green while the gate rests on one clause.
  const repository = makeRepository({
    load: async machine => ({ data: { ...cached(machine), present: { shiftReports: true } }, source: "indexeddb", fetchedAt: "2026-07-29T12:00:00.000Z", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
  });

  const app = renderApp(repository);
  await act(async () => {});
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => /Shift Report/i.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(app.text()).toContain("ยังไม่ได้ข้อมูลรายงานกะของเครื่องนี้จากเซิร์ฟเวอร์");
  expect([...app.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent)).disabled).toBe(true);
  app.unmount();
});

test("a response that omits the shift reports does not open the create gate", async () => {
  // `source === "server"` says a RESPONSE arrived, not that it carried this collection. The
  // normalizer maps an absent key to [], so an older GAS deployment — or a doGet whose Shift sheet
  // read failed — would otherwise look like "this shift has no report" and let the crew create a
  // second one, with a healthy server and nothing on screen.
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine), source: "empty", fetchedAt: null, stale: true }),
    refresh: async machine => ({
      // normalizeServerData is what App sees; run the real one over a payload with no shiftReports
      data: normalizeServerData({ status: "success", segments: [] }, machine),
      serverPayload: { status: "success", segments: [] },
      source: "server", fetchedAt: "2026-07-30T02:15:00.000Z", stale: false,
    }),
  });

  const app = renderApp(repository);
  await act(async () => {});
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => /Shift Report/i.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(app.text()).toContain("ยังไม่ได้ข้อมูลรายงานกะของเครื่องนี้จากเซิร์ฟเวอร์");
  expect([...app.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent)).disabled).toBe(true);
  app.unmount();
});

test("a launch whose fetch failed can still be recovered without losing the typed report", async () => {
  // The gate needs a way out that is not a reload. Nothing re-fetches on its own: `hydrate` runs
  // once per machine and the sync runner only drains the mutation queue, which shift reports do not
  // use yet. Without a button in the notice, a crew that filled in a whole shift underground and
  // then reached the shaft could only regain saving by reloading or switching machine — and both
  // reload the form, destroying the report they were trying to save.
  let online = false;
  const repository = makeRepository({
    load: async machine => ({ data: cached(machine), source: "empty", fetchedAt: null, stale: true }),
    refresh: async machine => {
      if (!online) throw new Error("NETWORK");
      return { data: snapshot(machine), serverPayload: { status: "success", shiftReports: [] }, source: "server", fetchedAt: "2026-07-30T02:15:00.000Z", stale: false };
    },
  });

  const app = renderApp(repository);
  await act(async () => {});
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => /Shift Report/i.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const engineer = app.container.querySelector('[name="Engineer"]');
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(engineer, "4");
    engineer.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect([...app.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent)).disabled).toBe(true);

  // the link returns at the shaft; the crew presses the button in the notice
  online = true;
  await act(async () => {
    [...app.container.querySelectorAll("button")].find(b => /ดึงข้อมูลจากเซิร์ฟเวอร์/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect([...app.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent)).disabled).toBe(false);
  expect(app.container.querySelector('[name="Engineer"]').value).toBe("4"); // and the report survived
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
