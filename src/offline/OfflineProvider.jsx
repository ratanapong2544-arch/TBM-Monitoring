import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { postSyncMutation } from "./apiTransport";
import { openOfflineDb } from "./db";
import { stageLegacyLocalStorage } from "./legacyMigration";
import { createRepository } from "./repository";
import { createSyncRunner } from "./syncRunner";

const OfflineContext = createContext(null);

// `online` is read from the platform rather than assumed: if the database never opens, the first
// real summary never arrives and a hardcoded `true` would leave Task 10's indicator claiming the
// app is online on a device that is not.
const initialSummary = () => ({
  online: typeof navigator === "undefined" || navigator.onLine !== false,
  pending: 0, syncing: 0, conflicts: 0, errors: 0, lastSyncedAt: null,
});

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
  // Everything is captured once. Reading `deps` through the ref keeps the repository and runner
  // stable even when a caller passes inline object literals — otherwise each render would build a
  // new runner, and every render would start one and leave the previous listeners behind.
  const factories = useRef(null);
  if (!factories.current) {
    factories.current = {
      openDb: deps.openDb || openOfflineDb,
      makeRepository: deps.createRepository || createRepository,
      makeRunner: deps.createSyncRunner || createSyncRunner,
      stageLegacy: deps.stageLegacyLocalStorage || stageLegacyLocalStorage,
      transport: deps.transport || { postSyncMutation },
      storage: deps.storage !== undefined ? deps.storage : (typeof navigator === "undefined" ? null : navigator.storage),
      repositoryDeps: deps.repositoryDeps || {},
      runnerDeps: deps.runnerDeps || {},
    };
  }

  const singletons = useMemo(() => {
    const { makeRepository, makeRunner, transport, repositoryDeps, runnerDeps, openDb } = factories.current;
    // the repository shares the provider's database handle, so an injected one applies to both
    const repository = makeRepository({ openDb, ...repositoryDeps });
    return { repository, runner: makeRunner({ repository, transport, ...runnerDeps }) };
  }, []);
  const { repository, runner } = singletons;
  const [syncSummary, setSyncSummary] = useState(initialSummary);

  // No mounted flag here. A flag whose setup never restores it is left false for the component's
  // whole life by StrictMode's setup/cleanup/setup, which would silently freeze the summary at
  // zero — the same trap that broke hydration in useOfflineData. React 18 already makes a
  // post-unmount setState a no-op, so no guard is needed.
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
            // no database write after teardown
            if (active) await repository.setSyncMetaValue("storagePersistence", { granted: Boolean(granted), checkedAt: new Date().toISOString() });
          } catch (error) { /* Safari variants reject or omit the API */ }
        }
      } catch (error) {
        /* the app must still render offline even if the database cannot open */
      }
      // The runner starts even when the database could not be opened. Starting it is what attaches
      // the online/focus/visibilitychange listeners, so skipping it left a session that lost the
      // open race — a blocked upgrade from another tab, a WebKit stall — with no automatic sync for
      // its whole life, long after the condition cleared.
      if (!active) return;
      try {
        await runner.start();
        await refreshSummary();
      } catch (error) { /* best-effort: a runner that cannot start must not block rendering */ }
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
