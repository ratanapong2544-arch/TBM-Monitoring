import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import { OfflineProvider, SUMMARY_FIELDS, useOffline } from "./OfflineProvider";
import { createRepository } from "./repository";
import { openOfflineDb } from "./db";

// No @testing-library in this project, so drive the provider with a minimal react-dom harness.
function renderProvider(deps, { strict = false } = {}) {
  const seen = [];
  function Probe() {
    seen.push(useOffline());
    return null;
  }
  let container;
  let root;
  // A fresh element and fresh `deps` object every render: reusing one element kept the prop identity
  // stable, so the test passed even with the memo keyed on the raw deps object.
  const build = () => {
    const tree = (
      <OfflineProvider deps={{ ...deps, repositoryDeps: { ...(deps.repositoryDeps || {}) }, runnerDeps: { ...(deps.runnerDeps || {}) } }}>
        <Probe />
      </OfflineProvider>
    );
    return strict ? <React.StrictMode>{tree}</React.StrictMode> : tree;
  };
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(build());
  });
  return {
    seen,
    last: () => seen[seen.length - 1],
    rerender: () => act(() => { root.render(build()); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

function makeDeps(overrides = {}) {
  const calls = { openDb: 0, stageLegacy: 0, repositories: 0, runners: 0, starts: 0, stops: 0, subscribes: 0, unsubscribes: 0, metaWrites: [] };
  const deps = {
    openDb: jest.fn(async () => { calls.openDb += 1; return { name: "db" }; }),
    stageLegacyLocalStorage: jest.fn(async () => { calls.stageLegacy += 1; }),
    createRepository: jest.fn(() => {
      calls.repositories += 1;
      return {
        getSyncSummary: jest.fn(async () => ({ online: true, pending: 1, syncing: 0, conflicts: 0, errors: 0, lastSyncedAt: null })),
        setSyncMetaValue: jest.fn(async (key, value) => { calls.metaWrites.push([key, value]); }),
        subscribe: jest.fn(() => { calls.subscribes += 1; return () => { calls.unsubscribes += 1; }; }),
      };
    }),
    createSyncRunner: jest.fn(() => {
      calls.runners += 1;
      return { start: jest.fn(async () => { calls.starts += 1; }), stop: jest.fn(() => { calls.stops += 1; }) };
    }),
    storage: { persist: jest.fn(async () => true), persisted: jest.fn(async () => false) },
    ...overrides,
  };
  return { deps, calls };
}

afterEach(() => jest.restoreAllMocks());

test("creates one repository and runner, starts the runner, and stops it on unmount", async () => {
  const { deps, calls } = makeDeps();
  const provider = renderProvider(deps);

  await act(async () => {});

  expect(calls.repositories).toBe(1);
  expect(calls.runners).toBe(1);
  expect(calls.openDb).toBe(1);
  expect(calls.stageLegacy).toBe(1);
  expect(calls.starts).toBe(1);
  expect(calls.subscribes).toBe(1);

  provider.unmount();
  expect(calls.stops).toBe(1);
  expect(calls.unsubscribes).toBe(1);
});

test("records the storage persistence result under its own syncMeta key", async () => {
  const { deps, calls } = makeDeps();
  const provider = renderProvider(deps);

  await act(async () => {});

  expect(calls.metaWrites).toEqual([["storagePersistence", expect.objectContaining({ granted: true, checkedAt: expect.any(String) })]]);
  provider.unmount();
});

test("does not rebuild the runner when the caller passes inline dependency literals", async () => {
  // an inline object literal as a useMemo dep rebuilt the runner every render, so each render
  // started another one and left the previous listeners behind
  const { deps, calls } = makeDeps();
  const provider = renderProvider({ ...deps, repositoryDeps: {}, runnerDeps: { leaseMs: 1000 } });

  await act(async () => {});
  provider.rerender();
  provider.rerender();
  await act(async () => {});

  expect(calls.runners).toBe(1);
  expect(calls.repositories).toBe(1);
  expect(calls.starts).toBe(1);
  provider.unmount();
});

test("exposes the summary the repository reports", async () => {
  const { deps } = makeDeps();
  const provider = renderProvider(deps);

  await act(async () => {});

  expect(provider.last().syncSummary).toMatchObject({ pending: 1 });
  provider.unmount();
});

test("reports the platform's online state before any summary arrives", async () => {
  // a database that never opens must not leave the indicator claiming the app is online
  const onLine = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
  const { deps } = makeDeps({
    openDb: jest.fn(async () => { throw new Error("blocked"); }),
    // the real getSyncSummary counts rows through openDb, so it fails with the database — a mock
    // that answers anyway would assert against a summary the app could never actually have
    createRepository: jest.fn(() => ({
      getSyncSummary: jest.fn(async () => { throw new Error("blocked"); }),
      setSyncMetaValue: jest.fn(async () => {}),
      subscribe: jest.fn(() => () => {}),
    })),
  });
  const provider = renderProvider(deps);
  expect(provider.last().syncSummary.online).toBe(false);

  await act(async () => {});

  expect(provider.last().syncSummary.online).toBe(false);
  provider.unmount();
  onLine.mockRestore();
});

test("still starts the runner when the database cannot be opened", async () => {
  // starting the runner is what attaches the online/focus/visibilitychange listeners. Skipping it
  // because the open failed left a session that lost the open race — a blocked upgrade from another
  // tab, a WebKit stall — with no automatic sync for its whole life, long after the cause cleared.
  const { deps, calls } = makeDeps({ openDb: jest.fn(async () => { throw new Error("blocked"); }) });
  const provider = renderProvider(deps);

  await act(async () => {});

  expect(calls.starts).toBe(1);
  provider.unmount();
  expect(calls.stops).toBe(1);
});

test("survives StrictMode double-invocation with a single started runner", async () => {
  const { deps, calls } = makeDeps();
  const provider = renderProvider(deps, { strict: true });

  await act(async () => {});

  expect(calls.starts).toBe(1);
  expect(calls.stageLegacy).toBe(1);
  provider.unmount();
  expect(calls.unsubscribes).toBe(calls.subscribes);
});

test("the summary comparison knows every field the summary has", async () => {
  // The provider keeps the previous summary object when all of `SUMMARY_FIELDS` compare equal, which
  // is what stops a backlog drain re-rendering the whole app once per confirmed mutation. A count
  // added to `getSyncCounts` and not to this list would be compared by nothing: the known fields
  // match, the old object is kept, and the new indicator never updates. Task 10 adds counts.
  const summary = await createRepository({ openDb: openOfflineDb }).getSyncSummary();

  expect(Object.keys(summary).sort()).toEqual([...SUMMARY_FIELDS].sort());
});

test("losing the link changes the word on the button, even with nothing queued", async () => {
  // The summary was recomputed at boot and on repository events only, and the runner's own
  // online/focus/visibilitychange listeners emit nothing when the queue is empty — so a crew going
  // underground with nothing to send kept reading "ออนไลน์" on the one control they check to learn
  // whether the link is up.
  let onLine = true;
  const { deps } = makeDeps({
    createRepository: jest.fn(() => ({
      getSyncSummary: jest.fn(async () => ({ online: onLine, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null })),
      setSyncMetaValue: jest.fn(async () => {}),
      subscribe: jest.fn(() => () => {}),
    })),
  });
  const provider = renderProvider(deps);
  await act(async () => {});
  expect(provider.last().syncSummary.online).toBe(true);

  onLine = false;
  await act(async () => { window.dispatchEvent(new Event("offline")); });

  expect(provider.last().syncSummary.online).toBe(false);
  provider.unmount();
});

test("the connectivity listeners come off with the provider", async () => {
  // A provider that keeps listening after unmount recomputes into a dead tree on every transition.
  const added = [];
  const removed = [];
  const realAdd = window.addEventListener.bind(window);
  const realRemove = window.removeEventListener.bind(window);
  jest.spyOn(window, "addEventListener").mockImplementation((type, handler, options) => { added.push(type); return realAdd(type, handler, options); });
  jest.spyOn(window, "removeEventListener").mockImplementation((type, handler, options) => { removed.push(type); return realRemove(type, handler, options); });
  const { deps } = makeDeps();

  const provider = renderProvider(deps);
  await act(async () => {});
  provider.unmount();

  expect(added.filter(type => type === "offline")).toHaveLength(1);
  expect(removed.filter(type => type === "offline")).toHaveLength(1);
  expect(removed.filter(type => type === "online")).toHaveLength(1);
});
