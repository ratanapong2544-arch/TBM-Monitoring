import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import { OfflineProvider, useOffline } from "./OfflineProvider";

// No @testing-library in this project, so drive the provider with a minimal react-dom harness.
function renderProvider(deps, { strict = false } = {}) {
  const seen = [];
  function Probe() {
    seen.push(useOffline());
    return null;
  }
  let container;
  let root;
  const tree = (
    <OfflineProvider deps={deps}>
      <Probe />
    </OfflineProvider>
  );
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
  });
  return {
    seen,
    last: () => seen[seen.length - 1],
    rerender: () => act(() => { root.render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree); }),
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
  const { deps } = makeDeps({ openDb: jest.fn(async () => { throw new Error("blocked"); }) });
  const provider = renderProvider(deps);

  await act(async () => {});

  expect(provider.last().syncSummary.online).toBe(false);
  provider.unmount();
  onLine.mockRestore();
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
