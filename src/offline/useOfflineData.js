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
        applyIfCurrent(token, { data: fresh.data, source: fresh.source, fetchedAt: fresh.fetchedAt, stale: Boolean(fresh.stale), refreshing: false, loading: false, error: null, cacheError: fresh.cacheError || null });
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
    hydrate(token);
  }, [hydrate, machine]);

  const refresh = useCallback(async () => {
    if (!repository) return null;
    // A callback captured while another machine was active must not fetch for it, let alone apply
    // the result: claiming a token would make its own response look current.
    if (machineRef.current !== machine) return null;
    const token = ++requestRef.current;
    setState(previous => ({ ...previous, refreshing: true, error: null }));
    try {
      const fresh = await repository.refresh(machine);
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
