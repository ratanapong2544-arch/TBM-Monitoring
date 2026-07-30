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
  const [state, setState] = useState(() => initialState(machine));
  // one token per machine selection: a settled request whose token is stale is dropped
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const applyIfCurrent = useCallback((token, update) => {
    if (!mountedRef.current || requestRef.current !== token) return;
    setState(previous => ({ ...previous, ...update }));
  }, []);

  const hydrate = useCallback(async token => {
    if (!repository) return;
    setState(previous => ({ ...previous, refreshing: true, error: null }));
    try {
      const cached = await repository.load(machine);
      applyIfCurrent(token, { data: cached.data, source: cached.source, fetchedAt: cached.fetchedAt, stale: cached.stale, loading: false });
    } catch (error) {
      applyIfCurrent(token, { loading: false, error });
    }
    try {
      const fresh = await repository.refresh(machine);
      applyIfCurrent(token, { data: fresh.data, source: fresh.source, fetchedAt: fresh.fetchedAt, stale: false, refreshing: false, loading: false, error: null });
    } catch (error) {
      // keep whatever the cache gave us; the snapshot is simply stale
      applyIfCurrent(token, { refreshing: false, loading: false, stale: true, error });
    }
  }, [applyIfCurrent, machine, repository]);

  useEffect(() => {
    const token = ++requestRef.current;
    hydrate(token);
  }, [hydrate]);

  const refresh = useCallback(async () => {
    if (!repository) return null;
    const token = requestRef.current;
    setState(previous => ({ ...previous, refreshing: true, error: null }));
    try {
      const fresh = await repository.refresh(machine);
      applyIfCurrent(token, { data: fresh.data, source: fresh.source, fetchedAt: fresh.fetchedAt, stale: false, refreshing: false, error: null });
      return fresh;
    } catch (error) {
      applyIfCurrent(token, { refreshing: false, stale: true, error });
      return null;
    }
  }, [applyIfCurrent, machine, repository]);

  return { ...state, refresh };
}
