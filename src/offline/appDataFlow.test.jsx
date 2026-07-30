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

test("a server response with an absent collection does not erase local prep tasks", async () => {
  // normalizeServerData maps an absent key to [], so an older GAS deployment looked like a deletion
  window.localStorage.setItem("tbmPrepTasks_TBM2", JSON.stringify([{ id: "pt_local", title: "Local prep" }]));
  const repository = makeRepository({
    refresh: async machine => ({ data: snapshot(machine, { prepTasks: [] }), source: "server", fetchedAt: "x", stale: false }),
  });

  const app = renderApp(repository);
  await act(async () => {});

  expect(JSON.parse(window.localStorage.getItem("tbmPrepTasks_TBM2"))).toEqual([{ id: "pt_local", title: "Local prep" }]);
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
  const repository = makeRepository({ refresh: async () => { throw new Error("Failed to fetch"); } });

  const app = renderApp(repository);
  await act(async () => {});

  expect(app.text()).toContain("ออฟไลน์");
  expect(app.text()).not.toContain("ไม่สามารถดึงข้อมูลได้");
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
