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

  return {
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    subscribeErrors(listener) { errorSubscribers.add(listener); return () => errorSubscribers.delete(listener); },
    async load(machine) {
      const data = await readServerSnapshot(await openDb(), machine);
      return data || emptyServerData(machine);
    },
    async refresh(machine, { signal } = {}) {
      try {
        const raw = await fetchServerSnapshot(machine, { signal });
        const data = normalizeServerData(raw, machine);
        const stored = await writeServerSnapshot(await openDb(), machine, data, now());
        emit({ type: "data", machine, data: stored });
        return stored;
      } catch (error) {
        const cached = await readServerSnapshot(await openDb(), machine);
        emitError({ type: "error", machine, error, data: cached || null });
        throw error;
      }
    },
  };
}
