import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

// the other three files in this seam set it; this one's entire subject is async flush ordering, so
// it is the last place that should be running without React's escaped-update warning
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

test("a cache re-read does not strand the refresh it arrives during", async () => {
  // The re-read must be a PASSENGER of the current generation. Claiming a new one invalidates the
  // hydrate or refresh in flight, and this apply carries none of what those passes own — so
  // `refreshing` stuck true and App showed "กำลังอัปเดตข้อมูล…" for the session, masking the two
  // lines that matter underground: that the queue is not durable, and that the data is old. It also
  // dropped the server answer already travelling.
  let deliver;
  let listener;
  const repository = {
    load: async machine => ({ data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }] }, source: "indexeddb", fetchedAt: "cache", stale: true }),
    refresh: machine => new Promise(resolve => {
      deliver = () => resolve({ data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }, { id: "s2", ringNo: "P2", machine }] }, source: "server", fetchedAt: "server", stale: false });
    }),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  await act(async () => { listener({ type: "mutation", requestId: "r1", status: "discarded" }); });
  await act(async () => {});
  deliver();
  await act(async () => {});

  expect(hook.last().refreshing).toBe(false);
  expect(hook.last().loading).toBe(false);
  expect(hook.last().source).toBe("server");
  expect(hook.last().data.segments.map(row => row.ringNo)).toEqual(["P1", "P2"]);
  hook.unmount();
});

test("a cache re-read does not tell an online device its data came from the cache", async () => {
  // `repository.load` ALWAYS answers `source: "indexeddb", stale: true`. Carrying that provenance
  // overwrote what the last FETCH established, and nothing sets it back — `hydrate` runs on mount
  // and machine switch alone. One tap on ยืนยันทิ้ง and App's strip read
  // "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — แสดงข้อมูลที่บันทึกไว้" for the rest of the session, on a device
  // that was online: the answer to "is my work on the sheet?" became a standing lie, on the screen
  // the crew was sent to precisely to find that out.
  let listener;
  const repository = {
    load: async machine => ({ data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }] }, source: "indexeddb", fetchedAt: "cache", stale: true }),
    refresh: async machine => ({ data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }, { id: "s2", ringNo: "P2", machine }] }, source: "server", fetchedAt: "server", stale: false }),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  expect(hook.last()).toMatchObject({ source: "server", stale: false });

  await act(async () => { listener({ type: "mutation", requestId: "r1", status: "discarded" }); });
  await act(async () => {});

  // the rows the store now holds...
  expect(hook.last().data.segments.map(row => row.ringNo)).toEqual(["P1"]);
  // ...and still the truth about where the app last got its data
  expect(hook.last()).toMatchObject({ source: "server", stale: false, fetchedAt: "server" });
  hook.unmount();
});

test("a cache re-read after a machine switch reads the machine now on screen", async () => {
  // The subscription is set up once — its deps are `[applyIfCurrent, repository]` — so the `machine`
  // in its closure is permanently the first one. Reading that one hands TBM1's rows to a screen
  // showing TBM2: rings from the other machine on the data log, under this machine's counters.
  let listener;
  const load = jest.fn(async machine => ({ data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }] }, source: "indexeddb", fetchedAt: "cache", stale: true }));
  const repository = {
    load,
    refresh: async machine => ({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false }),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  hook.rerender({ machine: "TBM2" });
  await act(async () => {});
  await act(async () => { listener({ type: "mutation", requestId: "r1", status: "discarded" }); });
  await act(async () => {});

  expect(load.mock.calls[load.mock.calls.length - 1][0]).toBe("TBM2");
  expect(hook.last().data.segments.every(row => row.machine === "TBM2")).toBe(true);
  hook.unmount();
});

test("a device that cannot write its cache does not re-read it and lose the data log", async () => {
  // Quota, or private browsing: `writeServerSnapshot` throws, the fetch still returns the rings and
  // reports `cacheError`. The snapshot store then holds LESS than the screen does. One tap on
  // ยืนยันทิ้ง used to re-read it and take every ring off the data log, both dashboards and the ring
  // count — while `source` still read "server" and the strip still said the data was fresh. A row
  // that lingers until the next fetch is the recoverable end of this; a wiped data log is not.
  let listener;
  const repository = {
    load: async machine => ({ data: { machine, segments: [] }, source: "indexeddb", fetchedAt: null, stale: true }),
    refresh: async machine => ({
      data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }, { id: "s2", ringNo: "P2", machine }] },
      source: "server", fetchedAt: "server", stale: false, cacheError: new Error("QuotaExceededError"),
    }),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  expect(hook.last().data.segments).toHaveLength(2);

  await act(async () => { listener({ type: "mutation", requestId: "r1", status: "discarded" }); });
  await act(async () => {});

  expect(hook.last().data.segments.map(row => row.ringNo)).toEqual(["P1", "P2"]);
  hook.unmount();
});

test("a re-read that settles after a fetch does not put the older snapshot back", async () => {
  // `hydrate` states this invariant and enforces it with a local, `serverSettled`. The subscription
  // re-read is a THIRD writer into the same state and cannot see that local, so it needed the same
  // guard in a form both can reach. Without it the crew taps discard, the launch fetch answers
  // while the cache read is still out, and the rings the server just confirmed are replaced by
  // whatever the store held before it was written.
  // The LAUNCH fetch, not `refresh()`: `refresh()` claims a new request token, which drops the
  // re-read on its own and would make this test prove nothing. `hydrate`'s server pass shares the
  // token with the re-read, and it is the pass in flight when a crew opens the panel at the start of
  // a shift.
  let listener;
  let releaseCache;
  let releaseServer;
  const rings = machine => [{ id: "s1", ringNo: "P1", machine }, { id: "s2", ringNo: "P2", machine }, { id: "s3", ringNo: "P3", machine }];
  let cacheCall = 0;
  const repository = {
    load: machine => {
      cacheCall += 1;
      if (cacheCall === 1) return Promise.resolve({ data: { machine, segments: [] }, source: "indexeddb", fetchedAt: null, stale: true });
      return new Promise(resolve => { releaseCache = () => resolve({ data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }] }, source: "indexeddb", fetchedAt: "cache", stale: true }); });
    },
    refresh: machine => new Promise(resolve => { releaseServer = () => resolve({ data: { machine, segments: rings(machine) }, source: "server", fetchedAt: "server", stale: false }); }),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  // the re-read goes out while the launch fetch is still travelling...
  await act(async () => { listener({ type: "conflict", requestId: "r1", conflictId: "c1", status: "resolved" }); });
  // ...the fetch lands...
  await act(async () => { releaseServer(); });
  // ...and only then does the cache answer, with what the store held before the fetch wrote it
  await act(async () => { releaseCache(); });
  await act(async () => {});

  expect(hook.last().data.segments.map(row => row.ringNo)).toEqual(["P1", "P2", "P3"]);
  expect(hook.last()).toMatchObject({ source: "server", stale: false });
  hook.unmount();
});

test("one machine's failed cache write does not silence the re-read on the next machine", async () => {
  // The flag says "does the store hold what is on screen". Written per FETCH and never restored, a
  // quota error on TBM1 silenced the re-read for TBM2 too, for the rest of the session — and TBM2's
  // store was healthy. "เก็บของเซิร์ฟเวอร์" then put a ring back in TBM2's snapshot and it stayed
  // off the data log, which is the exact defect this effect exists to close.
  let listener;
  const load = jest.fn(async machine => ({ data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }] }, source: "indexeddb", fetchedAt: "cache", stale: true }));
  const repository = {
    load,
    refresh: async machine => {
      if (machine === "TBM1") return { data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false, cacheError: new Error("QuotaExceededError") };
      throw new Error("NETWORK"); // TBM2 underground: the fetch never lands, the cache pass fills the screen
    },
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  hook.rerender({ machine: "TBM2" });
  await act(async () => {});
  const readsBefore = load.mock.calls.length;

  await act(async () => { listener({ type: "conflict", requestId: "r1", conflictId: "c1", status: "resolved" }); });
  await act(async () => {});

  expect(load.mock.calls.length).toBe(readsBefore + 1);
  expect(load.mock.calls[load.mock.calls.length - 1][0]).toBe("TBM2");
  hook.unmount();
});

test("a corrected retry reaches the screen, like the other two ways a stored row is rewritten", async () => {
  // Discard and resolve were closed in earlier rounds. Retry is the third sibling the Sync Center
  // added: the crew corrects a refused ring, the right values go to the sheet, and their data log
  // went on showing the REFUSED ones for the rest of the session.
  let listener;
  let rows = [{ id: "s1", ringNo: "P1", machine: "TBM1", grade: "WRONG" }];
  const repository = {
    load: async machine => ({ data: { machine, segments: rows }, source: "indexeddb", fetchedAt: "cache", stale: true }),
    refresh: async () => { throw new Error("NETWORK"); },
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  rows = [{ id: "s1", ringNo: "P1", machine: "TBM1", grade: "CORRECTED" }];

  await act(async () => { listener({ type: "mutation", requestId: "r2", status: "retried" }); });
  await act(async () => {});

  expect(hook.last().data.segments[0].grade).toBe("CORRECTED");
  hook.unmount();
});

test("an ordinary queued write does not trigger a re-read", async () => {
  // App already mirrors those. Re-reading per queued write would re-render every list on every save,
  // which is why `retried` cannot simply be the successor's real `pending`.
  let listener;
  const load = jest.fn(async machine => ({ data: { machine, segments: [] }, source: "indexeddb", fetchedAt: "cache", stale: true }));
  const repository = {
    load,
    refresh: async machine => ({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false }),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  const readsBefore = load.mock.calls.length;

  await act(async () => { listener({ type: "mutation", requestId: "r3", status: "pending" }); });
  await act(async () => {});

  expect(load.mock.calls.length).toBe(readsBefore);
  hook.unmount();
});

test("a manual refresh that could not write the cache also silences the next re-read", async () => {
  // `refresh()` keeps its own copy of the two guards because it is a second way a fetch completes.
  // It has no caller today — it is kept for the Sync Center's manual sync — so the first caller
  // would otherwise inherit a guard nothing protects.
  let listener;
  const load = jest.fn(async machine => ({ data: { machine, segments: [] }, source: "indexeddb", fetchedAt: "cache", stale: true }));
  let failCache = false;
  const repository = {
    load,
    refresh: async machine => ({
      data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }] }, source: "server", fetchedAt: "server", stale: false,
      cacheError: failCache ? new Error("QuotaExceededError") : null,
    }),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  failCache = true;
  await act(async () => { await hook.last().refresh(); });
  const readsBefore = load.mock.calls.length;

  await act(async () => { listener({ type: "mutation", requestId: "r4", status: "discarded" }); });
  await act(async () => {});

  expect(load.mock.calls.length).toBe(readsBefore);
  hook.unmount();
});

test("a fetch for a machine the crew left cannot decide what the app believes about this one", async () => {
  // TBM1's getData is still on a slow tunnel link when the crew switches. TBM2 lands healthy, then
  // TBM1's abandoned answer arrives reporting `cacheError`. Its DATA is discarded by the token —
  // but the two guard refs are not per-machine state, so writing them from a stale pass let TBM1
  // silence TBM2's re-read: the ring the crew kept went back into TBM2's snapshot and stayed off the
  // data log for the rest of the session.
  let listener;
  let releaseTbm1;
  const load = jest.fn(async machine => ({ data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }] }, source: "indexeddb", fetchedAt: "cache", stale: true }));
  const repository = {
    load,
    refresh: machine => (machine === "TBM1"
      ? new Promise(resolve => { releaseTbm1 = () => resolve({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false, cacheError: new Error("QuotaExceededError") }); })
      : Promise.resolve({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false })),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  hook.rerender({ machine: "TBM2" });
  await act(async () => {});
  await act(async () => { releaseTbm1(); }); // the abandoned answer, long after the switch
  const readsBefore = load.mock.calls.length;

  await act(async () => { listener({ type: "conflict", requestId: "r1", conflictId: "c1", status: "resolved" }); });
  await act(async () => {});

  expect(load.mock.calls.length).toBe(readsBefore + 1);
  expect(load.mock.calls[load.mock.calls.length - 1][0]).toBe("TBM2");
  hook.unmount();
});

test("an abandoned fetch cannot un-silence the re-read on a machine whose cache is short", async () => {
  // The mirror image, and the worse one: TBM2's own fetch could not write its cache, so its store
  // holds LESS than the screen. TBM1's abandoned answer then lands healthy — re-enabling the re-read
  // — and one tap on ยืนยันทิ้ง takes every ring off the data log.
  let listener;
  let releaseTbm1;
  const load = jest.fn(async machine => ({ data: { machine, segments: [] }, source: "indexeddb", fetchedAt: "cache", stale: true }));
  const repository = {
    load,
    refresh: machine => (machine === "TBM1"
      ? new Promise(resolve => { releaseTbm1 = () => resolve({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false }); })
      : Promise.resolve({
        data: { machine, segments: [{ id: "s1", ringNo: "P1", machine }] },
        source: "server", fetchedAt: "server", stale: false, cacheError: new Error("QuotaExceededError"),
      })),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  hook.rerender({ machine: "TBM2" });
  await act(async () => {});
  await act(async () => { releaseTbm1(); });
  const readsBefore = load.mock.calls.length;

  await act(async () => { listener({ type: "mutation", requestId: "r1", status: "discarded" }); });
  await act(async () => {});

  expect(load.mock.calls.length).toBe(readsBefore);
  expect(hook.last().data.segments.map(row => row.ringNo)).toEqual(["P1"]);
  hook.unmount();
});

test("a manual refresh that finishes after a machine switch does not decide for the new machine", async () => {
  // `refresh()` keeps its own copy of the two guard writes, and they need the same token check as
  // `hydrate`'s: the crew can switch while a manual sync is out, and the answer that comes back is
  // about the machine they left.
  let listener;
  let releaseTbm1;
  const load = jest.fn(async machine => ({ data: { machine, segments: [] }, source: "indexeddb", fetchedAt: "cache", stale: true }));
  let tbm1Calls = 0;
  const repository = {
    load,
    refresh: machine => {
      if (machine !== "TBM1") return Promise.resolve({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false });
      tbm1Calls += 1;
      if (tbm1Calls === 1) return Promise.resolve({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false });
      return new Promise(resolve => { releaseTbm1 = () => resolve({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false, cacheError: new Error("QuotaExceededError") }); });
    },
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  let pending;
  await act(async () => { pending = hook.last().refresh(); });   // manual sync goes out for TBM1
  hook.rerender({ machine: "TBM2" });
  await act(async () => {});
  await act(async () => { releaseTbm1(); await pending; });      // ...and lands after the switch
  const readsBefore = load.mock.calls.length;

  await act(async () => { listener({ type: "mutation", requestId: "r1", status: "discarded" }); });
  await act(async () => {});

  expect(load.mock.calls.length).toBe(readsBefore + 1);
  hook.unmount();
});

test("an event that says it rewrote a record makes the screen re-read", async () => {
  // The store answers whether it put a deleted record's key back; the hook takes that answer rather
  // than spelling the rule again. Without it, a refused delete corrected the store while the data
  // log went on hiding a ring that is alive on the sheet — for the session, since nothing else
  // re-reads.
  let listener;
  let rows = [];
  const repository = {
    load: async machine => ({ data: { machine, segments: rows }, source: "indexeddb", fetchedAt: "cache", stale: true }),
    refresh: async machine => ({ data: { machine, segments: [] }, source: "server", fetchedAt: "server", stale: false }),
    subscribe: handler => { listener = handler; return () => { listener = null; }; },
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
  };

  const hook = renderHook(props => useOfflineData(props.machine, { repository }), { machine: "TBM1" });
  await act(async () => {});
  rows = [{ id: "s1", ringNo: "P1", machine: "TBM1" }];

  await act(async () => { listener({ type: "mutation", requestId: "r1", status: "permanent_error", rewroteRecord: true }); });
  await act(async () => {});

  expect(hook.last().data.segments.map(row => row.ringNo)).toEqual(["P1"]);
  hook.unmount();
});
