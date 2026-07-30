import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import App from "../App";
import { OfflineProvider } from "./OfflineProvider";
import { emptyServerData } from "./normalizeServerData";

// The App-level mirror effect decides what a snapshot is allowed to overwrite. Nothing used to test
// this file, which is why two data-loss defects survived two review rounds — every rule below is a
// reproduction of one of them.
function snapshot(machine, overrides = {}) {
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
    text: () => container.textContent,
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

function makeRepository(overrides = {}) {
  return {
    load: async machine => ({ data: snapshot(machine), source: "indexeddb", fetchedAt: "2026-07-01T00:00:00.000Z", stale: true }),
    refresh: async machine => ({ data: snapshot(machine), source: "server", fetchedAt: "2026-07-30T00:00:00.000Z", stale: false }),
    subscribe: () => () => {},
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, lastSyncedAt: null }),
    setSyncMetaValue: async () => {},
    ...overrides,
  };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

test("an offline relaunch keeps unsynced issues that only exist in localStorage", async () => {
  // load() always succeeds offline; mirroring that snapshot into state persisted it straight back
  // over the crew's offline-created record
  window.localStorage.setItem("tbmIssues", JSON.stringify([
    { id: "iss_offline_1", machine: "TBM1", title: "Offline issue", status: "open" },
    { id: "iss_server_1", machine: "TBM1", title: "Server issue", status: "open" },
  ]));
  const repository = makeRepository({
    load: async machine => ({ data: snapshot(machine, { issues: [{ id: "iss_server_1", machine: "TBM1", title: "Server issue", status: "open" }] }), source: "indexeddb", fetchedAt: "x", stale: true }),
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
    load: async machine => ({ data: snapshot(machine, { routeConfigs: { TBM1: { plannedDistance: 1000 } } }), source: "indexeddb", fetchedAt: "x", stale: true }),
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
    load: async machine => ({ data: snapshot(machine), source: "indexeddb", fetchedAt: "2026-07-30T02:15:00.000Z", stale: true }),
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
      if (machine === "TBM2") return new Promise(resolve => { pending.resolve = () => resolve({ data: snapshot("TBM2"), source: "indexeddb", fetchedAt: "x", stale: true }); });
      return { data: snapshot(machine, { segments: [{ id: "s1", ringNo: "P643", machine: "TBM1" }] }), source: "indexeddb", fetchedAt: "x", stale: true };
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

  // switch to TBM2 through the machine switcher in the top bar
  await act(async () => {
    const pill = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "TBM2");
    pill.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(app.text()).toContain("กำลังโหลดข้อมูลของเครื่องนี้");
  expect(app.text()).not.toContain("P644");
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
