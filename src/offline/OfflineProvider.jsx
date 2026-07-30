import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { postSyncMutation } from "./apiTransport";
import { openOfflineDb } from "./db";
import { stageLegacyLocalStorage } from "./legacyMigration";
import { createRepository } from "./repository";
import { createSyncRunner } from "./syncRunner";

const OfflineContext = createContext(null);

const emptySummary = { online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, lastSyncedAt: null };

export function useOffline({ optional = false } = {}) {
  const context = useContext(OfflineContext);
  if (!context && !optional) throw new Error("useOffline must be used inside an OfflineProvider");
  return context;
}

/**
 * Owns the offline singletons for the app: one database handle, one repository, one sync runner.
 *
 * Everything is created once and torn down on unmount. Legacy localStorage is staged once (read
 * only — it is never deleted, and nothing is enqueued automatically), and persistent storage is
 * requested where the platform supports it so the browser is less likely to evict queued writes.
 */
export function OfflineProvider({ children, deps = {} }) {
  const factories = useRef(null);
  if (!factories.current) {
    factories.current = {
      openDb: deps.openDb || openOfflineDb,
      makeRepository: deps.createRepository || createRepository,
      makeRunner: deps.createSyncRunner || createSyncRunner,
      stageLegacy: deps.stageLegacyLocalStorage || stageLegacyLocalStorage,
      transport: deps.transport || { postSyncMutation },
      storage: deps.storage !== undefined ? deps.storage : (typeof navigator === "undefined" ? null : navigator.storage),
    };
  }
  const { makeRepository, makeRunner, transport } = factories.current;

  const repository = useMemo(() => makeRepository(deps.repositoryDeps || {}), [makeRepository, deps.repositoryDeps]);
  const runner = useMemo(() => makeRunner({ repository, transport, ...(deps.runnerDeps || {}) }), [makeRunner, repository, transport, deps.runnerDeps]);
  const [syncSummary, setSyncSummary] = useState(emptySummary);

  const refreshSummary = useCallback(async () => {
    try {
      const summary = await repository.getSyncSummary();
      setSyncSummary(summary);
      return summary;
    } catch (error) {
      return null;
    }
  }, [repository]);

  useEffect(() => {
    let active = true;
    const { openDb, stageLegacy, storage } = factories.current;

    (async () => {
      try {
        const db = await openDb();
        if (!active) return;
        // read-only staging of legacy business data; reconciliation happens in Task 9
        if (typeof window !== "undefined" && window.localStorage) {
          try { await stageLegacy(db, window.localStorage); } catch (error) { /* staging is best-effort */ }
        }
        if (storage && typeof storage.persist === "function") {
          try {
            const persisted = typeof storage.persisted === "function" ? await storage.persisted() : false;
            const granted = persisted || await storage.persist();
            await repository.setSyncMetaValue("storagePersistence", { granted: Boolean(granted), checkedAt: new Date().toISOString() });
          } catch (error) { /* Safari variants reject or omit the API */ }
        }
        if (!active) return;
        await runner.start();
        await refreshSummary();
      } catch (error) {
        /* the app must still render offline even if the database cannot open */
      }
    })();

    const unsubscribe = repository.subscribe(() => { refreshSummary(); });
    return () => {
      active = false;
      unsubscribe();
      runner.stop();
    };
  }, [refreshSummary, repository, runner]);

  const value = useMemo(() => ({ repository, runner, syncSummary, refreshSummary }), [repository, runner, syncSummary, refreshSummary]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
