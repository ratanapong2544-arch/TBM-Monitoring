import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import { useOfflineData } from "./useOfflineData";

// No @testing-library in this project, so drive the hook with a minimal react-dom harness that
// records every render's return value.
function renderHook(useHook, initialProps) {
  const renders = [];
  let container;
  let root;
  function Probe(props) {
    renders.push(useHook(props));
    return null;
  }
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(<Probe {...initialProps} />);
  });
  return {
    renders,
    last: () => renders[renders.length - 1],
    rerender: props => act(() => { root.render(<Probe {...props} />); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const emptyShape = machine => ({ machine, segments: [], grouts: [], shiftReports: [], issues: [] });
const cachedShape = machine => ({ machine, segments: [{ ringNo: "P1", status: "cached" }], grouts: [], shiftReports: [], issues: [] });
const serverShape = machine => ({ machine, segments: [{ ringNo: "P1", status: "server" }], grouts: [], shiftReports: [], issues: [] });

function makeRepository(overrides = {}) {
  return {
    load: jest.fn(async machine => ({ data: cachedShape(machine), source: "indexeddb", fetchedAt: "2026-07-29T00:00:00.000Z", stale: true })),
    refresh: jest.fn(async machine => ({ data: serverShape(machine), source: "server", fetchedAt: "2026-07-29T01:00:00.000Z", stale: false })),
    subscribe: jest.fn(() => () => {}),
    ...overrides,
  };
}

afterEach(() => jest.restoreAllMocks());

test("renders cached data before the refresh resolves", async () => {
  const pending = deferred();
  const repository = makeRepository({ refresh: jest.fn(() => pending.promise) });
  const hook = renderHook(({ machine }) => useOfflineData(machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  // cached snapshot is visible while the network request is still in flight
  expect(hook.last()).toMatchObject({ source: "indexeddb", stale: true, loading: false, refreshing: true });
  expect(hook.last().data.segments).toEqual([{ ringNo: "P1", status: "cached" }]);

  await act(async () => {
    pending.resolve({ data: serverShape("TBM1"), source: "server", fetchedAt: "2026-07-29T01:00:00.000Z", stale: false });
    await pending.promise;
  });

  expect(hook.last()).toMatchObject({ source: "server", stale: false, refreshing: false });
  expect(hook.last().data.segments).toEqual([{ ringNo: "P1", status: "server" }]);
  hook.unmount();
});

test("reports an explicit empty shape when nothing was ever cached", async () => {
  const repository = makeRepository({
    load: jest.fn(async machine => ({ data: emptyShape(machine), source: "empty", fetchedAt: null, stale: true })),
    refresh: jest.fn(() => new Promise(() => {})),
  });
  const hook = renderHook(({ machine }) => useOfflineData(machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  expect(hook.last()).toMatchObject({ source: "empty", fetchedAt: null });
  expect(hook.last().data.segments).toEqual([]);
  expect(hook.last().data.issues).toEqual([]);
  hook.unmount();
});

test("keeps cached data and reports stale when the refresh fails", async () => {
  const failure = Object.assign(new Error("offline"), { kind: "retryable", code: "NETWORK" });
  const repository = makeRepository({ refresh: jest.fn(async () => { throw failure; }) });
  const hook = renderHook(({ machine }) => useOfflineData(machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  expect(hook.last()).toMatchObject({ source: "indexeddb", stale: true, refreshing: false });
  expect(hook.last().data.segments).toEqual([{ ringNo: "P1", status: "cached" }]);
  expect(hook.last().error).toMatchObject({ code: "NETWORK" });
  hook.unmount();
});

test("ignores a late response from the machine the user switched away from", async () => {
  const slowFirst = deferred();
  const repository = makeRepository({
    refresh: jest.fn(machine => (machine === "TBM1" ? slowFirst.promise : Promise.resolve({ data: serverShape("TBM2"), source: "server", fetchedAt: "t2", stale: false }))),
  });
  const hook = renderHook(({ machine }) => useOfflineData(machine, { repository }), { machine: "TBM1" });
  await act(async () => {});

  hook.rerender({ machine: "TBM2" });
  await act(async () => {});
  expect(hook.last().data.machine).toBe("TBM2");

  // the abandoned TBM1 request lands afterwards and must not overwrite TBM2's data
  await act(async () => {
    slowFirst.resolve({ data: serverShape("TBM1"), source: "server", fetchedAt: "t1", stale: false });
    await slowFirst.promise;
  });

  expect(hook.last().data.machine).toBe("TBM2");
  expect(hook.last().data.segments).toEqual([{ ringNo: "P1", status: "server" }]);
  hook.unmount();
});

test("retains the previous machine's data until the new machine's cache loads", async () => {
  const slowLoad = deferred();
  const repository = makeRepository({
    load: jest.fn(machine => (machine === "TBM2" ? slowLoad.promise : Promise.resolve({ data: cachedShape("TBM1"), source: "indexeddb", fetchedAt: "t1", stale: true }))),
    refresh: jest.fn(() => new Promise(() => {})),
  });
  const hook = renderHook(({ machine }) => useOfflineData(machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  expect(hook.last().data.machine).toBe("TBM1");

  hook.rerender({ machine: "TBM2" });
  await act(async () => {});

  // still showing TBM1 while TBM2 loads, flagged as refreshing — not blanked to empty arrays
  expect(hook.last().refreshing).toBe(true);
  expect(hook.last().data.machine).toBe("TBM1");

  await act(async () => {
    slowLoad.resolve({ data: cachedShape("TBM2"), source: "indexeddb", fetchedAt: "t2", stale: true });
    await slowLoad.promise;
  });

  expect(hook.last().data.machine).toBe("TBM2");
  hook.unmount();
});

test("a manual refresh clears the stale flag and the previous error", async () => {
  const failure = Object.assign(new Error("offline"), { kind: "retryable", code: "NETWORK" });
  const refresh = jest.fn()
    .mockImplementationOnce(async () => { throw failure; })
    .mockImplementationOnce(async machine => ({ data: serverShape(machine), source: "server", fetchedAt: "t2", stale: false }));
  const repository = makeRepository({ refresh });
  const hook = renderHook(({ machine }) => useOfflineData(machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  expect(hook.last().error).toMatchObject({ code: "NETWORK" });

  await act(async () => { await hook.last().refresh(); });

  expect(hook.last()).toMatchObject({ source: "server", stale: false, error: null });
  expect(refresh).toHaveBeenCalledTimes(2);
  hook.unmount();
});

test("does not refresh again for an unchanged machine on re-render", async () => {
  const repository = makeRepository();
  const hook = renderHook(({ machine }) => useOfflineData(machine, { repository }), { machine: "TBM1" });
  await act(async () => {});

  hook.rerender({ machine: "TBM1" });
  await act(async () => {});

  expect(repository.refresh).toHaveBeenCalledTimes(1);
  expect(repository.load).toHaveBeenCalledTimes(1);
  hook.unmount();
});

test("stops updating state after unmount", async () => {
  const pending = deferred();
  const repository = makeRepository({ refresh: jest.fn(() => pending.promise) });
  const hook = renderHook(({ machine }) => useOfflineData(machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  const renderCount = hook.renders.length;

  hook.unmount();
  await act(async () => {
    pending.resolve({ data: serverShape("TBM1"), source: "server", fetchedAt: "t", stale: false });
    await pending.promise;
  });

  expect(hook.renders.length).toBe(renderCount);
});
