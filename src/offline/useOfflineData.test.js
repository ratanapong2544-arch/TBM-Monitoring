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

// same harness under StrictMode, which double-invokes effects (setup/cleanup/setup) in development
function renderHookStrict(useHook, initialProps) {
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
    root.render(<React.StrictMode><Probe {...initialProps} /></React.StrictMode>);
  });
  return { renders, last: () => renders[renders.length - 1], unmount: () => act(() => { root.unmount(); container.remove(); }) };
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

test("hydrates under StrictMode, where effects are double-invoked", async () => {
  // index.tsx renders the app inside StrictMode. A mounted-flag guard that the setup never restored
  // left every state update dropped here, so the app sat on its splash screen forever in dev.
  const repository = makeRepository();
  const hook = renderHookStrict(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  expect(hook.last()).toMatchObject({ loading: false, source: "server", stale: false });
  expect(hook.last().data.segments).toEqual([{ ringNo: "P1", status: "server" }]);
  hook.unmount();
});

test("a stalled cache read does not hold up the server fetch", async () => {
  // awaiting load() before refresh() let a blocked IndexedDB upgrade pin the app on its splash and
  // never even attempt the network
  const stalled = deferred();
  const repository = makeRepository({ load: jest.fn(() => stalled.promise) });
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  expect(repository.refresh).toHaveBeenCalledWith("TBM1");
  expect(hook.last()).toMatchObject({ loading: false, source: "server" });
  hook.unmount();
});

test("a late cache read never replaces server-confirmed data", async () => {
  // the parallel hydration must not let a slow IndexedDB read put an older snapshot back on screen
  const slowCache = deferred();
  const repository = makeRepository({
    load: jest.fn(() => slowCache.promise),
    refresh: jest.fn(async machine => ({ data: serverShape(machine), source: "server", fetchedAt: "2026-07-30T10:00:00.000Z", stale: false })),
  });
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });

  await act(async () => {});
  expect(hook.last()).toMatchObject({ source: "server", stale: false });

  await act(async () => {
    slowCache.resolve({ data: cachedShape("TBM1"), source: "indexeddb", fetchedAt: "2026-07-01T00:00:00.000Z", stale: true });
  });

  expect(hook.last()).toMatchObject({ source: "server", stale: false, fetchedAt: "2026-07-30T10:00:00.000Z" });
  expect(hook.last().data.segments).toEqual([{ ringNo: "P1", status: "server" }]);
  hook.unmount();
});

test("a server payload that could not be cached is reported, not hidden", async () => {
  const repository = makeRepository({
    refresh: jest.fn(async machine => ({ data: serverShape(machine), source: "server", fetchedAt: "2026-07-30T10:00:00.000Z", stale: false, cacheError: new Error("QuotaExceededError") })),
  });
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  expect(hook.last()).toMatchObject({ source: "server", stale: false });
  expect(hook.last().cacheError).toBeInstanceOf(Error);
  hook.unmount();
});

test("a failed cache read surfaces the error and still serves the server payload", async () => {
  const repository = makeRepository({ load: jest.fn(async () => { throw new Error("IDB blocked"); }) });
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  expect(hook.last()).toMatchObject({ loading: false, source: "server" });
  hook.unmount();
});

test("a cache read failure with no server either reports the error", async () => {
  const repository = makeRepository({
    load: jest.fn(async () => { throw new Error("IDB blocked"); }),
    refresh: jest.fn(async () => { throw new Error("NETWORK") }),
  });
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  expect(hook.last()).toMatchObject({ loading: false, stale: true, source: "empty" });
  expect(hook.last().error).toBeTruthy();
  hook.unmount();
});

test("the initial state exposes the full empty shape, not null", async () => {
  // App dereferences data.secondaryGrouts / data.instLocations.length on the first render
  const repository = makeRepository({ load: jest.fn(() => deferred().promise), refresh: jest.fn(() => deferred().promise) });
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });

  const first = hook.renders[0];
  expect(first.data).toEqual(expect.objectContaining({
    machine: "TBM1", segments: [], grouts: [], secondaryGrouts: [], shiftReports: [], issues: [],
    dailyReports: [], prepTasks: [], instLocations: [], instInstruments: [], instThresholds: [],
    instReadings: [], instSchedules: [],
  }));
  hook.unmount();
});

test("a refresh callback captured on one machine cannot write into another", async () => {
  // refresh() must claim its own token; reading the live one let a stale callback apply machine A's
  // response to machine B's state
  const repository = makeRepository();
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  const staleRefresh = hook.last().refresh;

  hook.rerender({ machine: "TBM2" });
  await act(async () => {});
  await act(async () => { await staleRefresh(); });

  expect(hook.last().data.machine).toBe("TBM2");
  hook.unmount();
});

test("a refresh failure marks the snapshot stale while keeping the cached data", async () => {
  const repository = makeRepository({ refresh: jest.fn(async () => { throw new Error("NETWORK"); }) });
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });

  await act(async () => {});

  expect(hook.last().stale).toBe(true);
  expect(hook.last().refreshing).toBe(false);
  expect(hook.last().data.segments).toEqual([{ ringNo: "P1", status: "cached" }]);
  hook.unmount();
});

test("provenance does not carry across a machine switch", async () => {
  // keeping the previous machine's source/fetchedAt made an empty, unreachable machine report
  // "showing saved data" stamped with the other machine's fetch time, and suppressed the real error
  const repository = makeRepository();
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  expect(hook.last()).toMatchObject({ source: "server", stale: false });

  repository.load = jest.fn(async () => { throw new Error("IDB blocked"); });
  repository.refresh = jest.fn(async () => { throw new Error("NETWORK"); });
  hook.rerender({ machine: "TBM2" });
  await act(async () => {});

  expect(hook.last()).toMatchObject({ source: "empty", stale: true });
  expect(hook.last().fetchedAt).toBeNull();
  expect(hook.last().error).toBeTruthy();
  hook.unmount();
});

test("says which machine the data on screen belongs to", async () => {
  // during a switch the provenance fields already describe the machine being switched TO while
  // `data` still holds the previous machine's records (blanking it would let a record form read
  // "no rings yet" and prefill ring 1 over a live heading). Anything reading source/stale alone
  // would describe the wrong machine's data, so the pairing has to be stated.
  const slowCache = deferred();
  const slowServer = deferred();
  const repository = makeRepository();
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  expect(hook.last()).toMatchObject({ source: "server", dataMachine: "TBM1" });

  repository.load = jest.fn(() => slowCache.promise);
  repository.refresh = jest.fn(() => slowServer.promise);
  hook.rerender({ machine: "TBM2" });
  await act(async () => {});

  expect(hook.last()).toMatchObject({ source: "empty", dataMachine: "TBM1" });
  expect(hook.last().data.segments).toHaveLength(1); // still TBM1's rings, deliberately
  hook.unmount();
});

test("a successful refresh triggers the sync runner", async () => {
  // the runner's own triggers are online/focus/visibilitychange; none of them fire when a tunnel
  // link comes back while the tab is open and focused, and a refresh succeeding proves it is back
  const repository = makeRepository();
  const runner = { runNow: jest.fn(() => Promise.resolve()) };
  const hook = renderHook(props => useOfflineData(props.machine, { repository, runner }), { machine: "TBM1" });
  await act(async () => {});
  expect(runner.runNow).toHaveBeenCalledTimes(1);

  await act(async () => { await hook.last().refresh(); });
  expect(runner.runNow).toHaveBeenCalledTimes(2);
  hook.unmount();
});

test("a sync runner that rejects does not surface as a page error", async () => {
  // the runner reaches IndexedDB to claim due mutations, so it rejects outright in the session this
  // call exists for — the database could not be opened, so the runner was started anyway. Unhandled,
  // every successful refresh would raise a page error on a screen that is working fine.
  const rejections = [];
  const onRejection = event => { rejections.push(event); event.preventDefault && event.preventDefault(); };
  process.on("unhandledRejection", onRejection);
  try {
    const repository = makeRepository();
    const runner = { runNow: jest.fn(() => Promise.reject(new Error("IndexedDB open timed out"))) };
    const hook = renderHook(props => useOfflineData(props.machine, { repository, runner }), { machine: "TBM1" });
    await act(async () => {});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(runner.runNow).toHaveBeenCalled();
    expect(rejections).toHaveLength(0);
    expect(hook.last()).toMatchObject({ source: "server", loading: false });
    hook.unmount();
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("a failing refresh does not trigger the sync runner", async () => {
  const repository = makeRepository({ refresh: jest.fn(async () => { throw new Error("NETWORK"); }) });
  const runner = { runNow: jest.fn(() => Promise.resolve()) };
  const hook = renderHook(props => useOfflineData(props.machine, { repository, runner }), { machine: "TBM1" });
  await act(async () => {});

  expect(runner.runNow).not.toHaveBeenCalled();
  hook.unmount();
});

test("a manual refresh during hydration still clears loading", async () => {
  // refresh claims the request token, invalidating the in-flight hydrate that carried the only
  // other loading:false — omitting it here left the app on its splash screen forever
  const slowCache = deferred();
  const slowServer = deferred();
  const repository = makeRepository({ load: jest.fn(() => slowCache.promise), refresh: jest.fn(() => slowServer.promise) });
  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  expect(hook.last().loading).toBe(true);

  repository.refresh = jest.fn(async machine => ({ data: serverShape(machine), source: "server", fetchedAt: "2026-07-30T02:00:00.000Z", stale: false }));
  await act(async () => { await hook.last().refresh(); });

  expect(hook.last()).toMatchObject({ loading: false, source: "server" });
  hook.unmount();
});

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
