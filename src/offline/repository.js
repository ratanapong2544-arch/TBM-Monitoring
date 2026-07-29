import { fetchServerSnapshot as defaultFetchServerSnapshot } from "./apiTransport";
import { openOfflineDb as defaultOpenDb } from "./db";
import { emptyServerData, normalizeServerData as defaultNormalizeServerData } from "./normalizeServerData";
import { readServerSnapshot as defaultReadServerSnapshot, writeServerSnapshot as defaultWriteServerSnapshot } from "./snapshotStore";

export function createRepository(deps = {}) {
  const openDb = deps.openDb || defaultOpenDb;
  const fetchServerSnapshot = deps.fetchServerSnapshot || defaultFetchServerSnapshot;
  const normalizeServerData = deps.normalizeServerData || defaultNormalizeServerData;
  const readServerSnapshot = deps.readServerSnapshot || defaultReadServerSnapshot;
  const writeServerSnapshot = deps.writeServerSnapshot || defaultWriteServerSnapshot;
  const now = deps.now || (() => new Date().toISOString());
  const subscribers = new Set();
  const errorSubscribers = new Set();
  const emit = event => subscribers.forEach(listener => listener(event));
  const emitError = event => errorSubscribers.forEach(listener => listener(event));
  const cachedResult = data => data
    ? { data, source: "indexeddb", fetchedAt: data.fetchedAt || null, stale: true }
    : null;

  return {
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    subscribeErrors(listener) { errorSubscribers.add(listener); return () => errorSubscribers.delete(listener); },
    async load(machine) {
      const data = await readServerSnapshot(await openDb(), machine);
      return cachedResult(data) || { data: emptyServerData(machine), source: "empty", fetchedAt: null, stale: true };
    },
    async refresh(machine, { signal } = {}) {
      try {
        const raw = await fetchServerSnapshot(machine, { signal });
        const data = normalizeServerData(raw, machine);
        const stored = await writeServerSnapshot(await openDb(), machine, data, now());
        const result = { data: stored, source: "server", fetchedAt: stored.fetchedAt, stale: false };
        emit({ type: "data", machine, result });
        return result;
      } catch (error) {
        const cached = await readServerSnapshot(await openDb(), machine);
        const result = cachedResult(cached);
        const event = { type: "error", machine, error, result };
        emit(event);
        emitError(event);
        throw error;
      }
    },
  };
}
