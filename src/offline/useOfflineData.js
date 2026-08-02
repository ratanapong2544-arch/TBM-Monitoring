import { useCallback, useEffect, useRef, useState } from "react";

import { emptyServerData } from "./normalizeServerData";
import { useOffline } from "./OfflineProvider";

const initialState = machine => ({
  data: emptyServerData(machine),
  loading: true,
  refreshing: false,
  stale: true,
  source: "empty",
  fetchedAt: null,
  error: null,
  // set when the server payload arrived but could not be written to the cache
  cacheError: null,
});

/**
 * Hydrate the active machine from IndexedDB, then refresh from the server.
 *
 * The cached snapshot renders first so an offline launch shows real data immediately; the network
 * result replaces it when it lands. A machine switch keeps the previous machine's data on screen
 * (flagged `refreshing`) instead of blanking to empty arrays, and a response for a machine the user
 * already switched away from is discarded.
 */
export function useOfflineData(machine, deps = {}) {
  const context = useOffline({ optional: true });
  const repository = deps.repository || (context && context.repository);
  const runner = deps.runner || (context && context.runner);
  // A refresh that succeeds proves the network is reachable, which is one of the design's sync
  // triggers and the only one React owns. The runner's own triggers are online/focus/visibility, and
  // none of them fire when a tunnel link comes back while the tab is already open and focused.
  const runnerRef = useRef(runner);
  runnerRef.current = runner;
  const syncAfterRefresh = useCallback(() => {
    const current = runnerRef.current;
    if (!current || typeof current.runNow !== "function") return;
    // Both halves matter. A synchronous throw is possible, and so is a rejected promise: the runner
    // reaches IndexedDB to claim due mutations, and in exactly the session this exists for — the
    // database could not be opened, so the runner was started anyway — that rejects on every
    // trigger. Unhandled, it would surface as a page error on a screen that is working fine.
    try { Promise.resolve(current.runNow()).catch(() => {}); } catch (error) { /* sync is best-effort */ }
  }, []);
  const [state, setState] = useState(() => initialState(machine));
  // one token per machine selection: a settled request whose token is stale is dropped.
  // React 18 makes a setState after unmount a silent no-op, so the token is the only guard needed —
  // a separate mounted flag was worse than useless: StrictMode's setup/cleanup/setup left it false
  // for the component's whole life and every update was dropped.
  const requestRef = useRef(0);
  // the machine the latest hydration belongs to, so a callback captured for another one can be
  // recognised as stale
  const machineRef = useRef(machine);
  // `hydrate` keeps `serverSettled` as a local so a slow IndexedDB read cannot put an older snapshot
  // back over a server-confirmed one. The subscription re-read is a THIRD writer into the same
  // state and cannot see that local, so it gets the same guard in a form both can reach:
  //   - `serverGenerationRef` counts server answers applied. The re-read captures it before its read
  //     and drops the result if a fetch landed meanwhile — that read was issued against the store as
  //     it was BEFORE the server wrote it.
  //   - `cachePersistedRef` answers "does the store hold what is on screen". It goes false when a
  //     fetch could not write the cache (quota, private browsing): the store then holds LESS than
  //     the screen does, and re-reading it takes rings off the data log while the strip still says
  //     the data is server-fresh. It goes back to true whenever the screen is filled FROM the store
  //     — a cache pass, or a switch to another machine — because then the two agree again by
  //     construction — which is what the per-machine reset below does, and the only place the true
  //     side is written. Written per fetch and never restored, one quota error on TBM1 silenced the
  //     re-read for TBM2 as well, for the rest of the session: "เก็บของเซิร์ฟเวอร์" put a ring back
  //     in TBM2's stored snapshot and it stayed off the data log, which is the exact defect this
  //     effect exists to close.
  const serverGenerationRef = useRef(0);
  const cachePersistedRef = useRef(true);

  const applyIfCurrent = useCallback((token, update) => {
    if (requestRef.current !== token) return;
    setState(previous => ({ ...previous, ...update }));
  }, []);

  const hydrate = useCallback(async token => {
    if (!repository) return;
    setState(previous => ({ ...previous, refreshing: true, error: null }));
    // Both start now. Awaiting the cache first would let a blocked IndexedDB upgrade (two tabs on
    // different versions) or a WebKit stall hold up the network fetch and pin the app on its splash.
    // Server data outranks the cache regardless of which settles first: a slow IndexedDB read must
    // never put an older snapshot back over a server-confirmed one.
    let serverSettled = false;
    const cachePass = Promise.resolve()
      .then(() => repository.load(machine))
      .then(cached => {
        if (serverSettled) return true; // the server already answered; the cache is history
        applyIfCurrent(token, { data: cached.data, source: cached.source, fetchedAt: cached.fetchedAt, stale: cached.stale, loading: false });
        return true;
      })
      .catch(error => {
        if (!serverSettled) applyIfCurrent(token, { loading: false, error });
        return false;
      });
    const serverPass = Promise.resolve()
      .then(() => repository.refresh(machine))
      .then(fresh => {
        serverSettled = true;
        // BEHIND the token, like the apply below it. An answer for a machine the crew has already
        // switched away from is discarded — but these two refs are not per-machine state, so writing
        // them from a stale pass let TBM1's abandoned fetch decide what the app believes about
        // TBM2's cache: a `cacheError` on the abandoned one silenced TBM2's re-read, and a healthy
        // one un-silenced it while TBM2's own store was short. Both are the defect the re-read
        // exists to close, arriving from the one direction nothing was watching.
        if (requestRef.current === token) {
          serverGenerationRef.current += 1;
          cachePersistedRef.current = !fresh.cacheError;
          applyIfCurrent(token, { data: fresh.data, source: fresh.source, fetchedAt: fresh.fetchedAt, stale: Boolean(fresh.stale), refreshing: false, loading: false, error: null, cacheError: fresh.cacheError || null });
        }
        // outside it: a fetch that came back proves the link is up whichever machine it was for, and
        // that is the one sync trigger React owns
        syncAfterRefresh();
        return true;
      })
      .catch(error => { applyIfCurrent(token, { refreshing: false, loading: false, stale: true, error }); return false; });
    await Promise.all([cachePass, serverPass]);
  }, [applyIfCurrent, machine, repository, syncAfterRefresh]);

  useEffect(() => {
    const token = ++requestRef.current;
    const previousMachine = machineRef.current;
    machineRef.current = machine;
    // Provenance is per machine. Carrying the previous machine's source/fetchedAt/stale across a
    // switch made an empty machine whose cache and fetch both failed report "offline — showing
    // saved data" stamped with the OTHER machine's fetch time, and suppressed the real error.
    if (previousMachine !== machine) {
      setState(previous => ({ ...previous, source: "empty", fetchedAt: null, stale: true, error: null, cacheError: null }));
    }
    // per machine, like the provenance above it: whether TBM1's cache could be written says nothing
    // about TBM2's, and this hydration is about to establish the answer for the one being shown
    cachePersistedRef.current = true;
    hydrate(token);
  }, [hydrate, machine]);

  // Three crew actions change what is on screen WITHOUT going through `mutate` — throwing a write
  // away, resolving a conflict, and correcting a refused one in the payload editor. Both rewrite the stored snapshot and neither returns a row for
  // App to mirror, so without this the Sync Center's own confirmation was a promise the app never
  // kept: "เก็บของเซิร์ฟเวอร์" is the button that means KEEP THE RING, and the ring stayed off the
  // data log until the next successful getData — underground, the next shift.
  // A CACHE read, not a fetch: it is exactly the store those two actions just wrote, and it works
  // with no link. Anything that goes through `mutate` is excluded — App already mirrors those, and
  // re-reading per queued write would re-render every list on every save.
  useEffect(() => {
    if (!repository || typeof repository.subscribe !== "function") return undefined;
    return repository.subscribe(event => {
      // The ONE place that knows which events rewrote the stored row. `retried` is its own status
      // rather than the successor's real `pending`, because an ordinary `mutate` is pending too and
      // must NOT land here: App already mirrors those, and re-reading per queued write would
      // re-render every list on every save.
      const rewrote = event
        && ((event.type === "conflict" && event.status === "resolved")
          || (event.type === "mutation" && (event.status === "discarded" || event.status === "retried")));
      if (!rewrote) return;
      // NOT `++requestRef.current`. Claiming a new generation invalidates whatever hydrate or
      // refresh is in flight, and this apply carries none of what those passes own — no
      // `loading:false`, no `refreshing:false`. Stranding them leaves the app on its splash, or
      // stuck on "กำลังอัปเดตข้อมูล…" which MASKS the two lines that matter underground: that the
      // queue is not durable, and that the data on screen is old. It also drops the server answer
      // already travelling. A passenger of the current generation is what this is.
      const token = requestRef.current;
      // captured BEFORE the read, compared after: see `serverGenerationRef` above
      const generation = serverGenerationRef.current;
      if (!cachePersistedRef.current) return;
      Promise.resolve(repository.load(machineRef.current))
        // `data` ONLY. `repository.load` always answers `source: "indexeddb", stale: true`, so
        // carrying its provenance overwrote what the last FETCH established — and nothing sets that
        // back, because `hydrate` runs on mount and machine switch alone. One tap on ยืนยันทิ้ง and
        // the app told an online crew "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — แสดงข้อมูลที่บันทึกไว้" for the
        // rest of the session: the answer to "is my work on the sheet?" became a standing lie, on
        // the screen they were sent to precisely to find that out.
        .then(cached => {
          if (!cached || serverGenerationRef.current !== generation) return;
          applyIfCurrent(token, { data: cached.data });
        })
        // Nothing surfaces this: the Sync Center's own error is about a different call on a
        // different store. The screen keeps what it had, which is the safe end of a cache read that
        // was only ever an optimisation over waiting for the next refresh.
        .catch(() => {});
    });
  }, [applyIfCurrent, repository]);

  const refresh = useCallback(async () => {
    if (!repository) return null;
    // A callback captured while another machine was active must not fetch for it, let alone apply
    // the result: claiming a token would make its own response look current.
    if (machineRef.current !== machine) return null;
    const token = ++requestRef.current;
    setState(previous => ({ ...previous, refreshing: true, error: null }));
    try {
      const fresh = await repository.refresh(machine);
      // behind the token for the same reason as `hydrate`'s pass: the machine can change while this
      // is out, and these refs describe the machine on screen
      if (requestRef.current === token) {
        serverGenerationRef.current += 1;
        cachePersistedRef.current = !fresh.cacheError;
      }
      // `loading` must be cleared here too: claiming the token above invalidated any in-flight
      // hydrate, whose passes carried the only other `loading:false`, so omitting it left the app
      // on its splash screen forever.
      applyIfCurrent(token, { data: fresh.data, source: fresh.source, fetchedAt: fresh.fetchedAt, stale: Boolean(fresh.stale), refreshing: false, loading: false, error: null, cacheError: fresh.cacheError || null });
      syncAfterRefresh();
      // Returned whole. There is no caller today — Task 8 removed the last one, the shift report's
      // "did my write reach the sheet?" check, which the queue now answers. The plan asks for the
      // contract to survive the tidy-up for Task 10's manual sync, including the
      // null-on-stale-machine answer below, which is how a caller tells "the machine changed under
      // me" from "the refresh failed".
      return fresh;
    } catch (error) {
      applyIfCurrent(token, { refreshing: false, loading: false, stale: true, error });
      return null;
    }
  }, [applyIfCurrent, machine, repository, syncAfterRefresh]);

  // Which machine `data` actually belongs to. Between a machine switch and the new snapshot landing,
  // the provenance fields are already reset for the machine being switched TO while `data` still
  // holds the previous machine's records — deliberately, because blanking it would let the record
  // forms read "this machine has no rings yet" and prefill ring 1 over a live heading. A consumer
  // reading `source`/`stale` alone would therefore describe the wrong machine's data; compare this
  // to the machine it asked for first. App does the equivalent check before mirroring.
  return { ...state, dataMachine: state.data ? state.data.machine : null, refresh };
}
