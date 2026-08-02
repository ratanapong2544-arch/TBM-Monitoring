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
  // `blocked` belongs here too: `getSyncCounts` returns it and App reads it, so leaving it out made
  // the first render's shape differ from every later one
  pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null,
});

// Every field `getSyncSummary` returns. A hand-kept list, so a count added there and not here would
// be compared by nothing: the seven known fields would match, the bail would keep the old object, and
// the new indicator would silently never update. `SUMMARY_FIELDS` is exported and pinned against the
// real summary's key set for exactly that reason — Task 10's Sync Center is where a count gets added.
export const SUMMARY_FIELDS = ["online", "pending", "syncing", "conflicts", "errors", "blocked", "lastSyncedAt"];
const sameSummary = (a, b) => Boolean(a) && Boolean(b) && SUMMARY_FIELDS.every(field => a[field] === b[field]);

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
      // Only store a genuinely different summary. Every repository event calls this, and a drain of
      // an offline shift's backlog emits one per confirmed mutation — each storing a fresh object,
      // changing the context value, and re-rendering App and every view under it. The counts are
      // seven scalars, so comparing them costs nothing next to the render they avoid.
      setSyncSummary(previous => (sameSummary(previous, summary) ? previous : summary));
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
    // The summary was recomputed only at boot and on a repository event, and the runner's own
    // online/focus/visibilitychange listeners emit nothing when the queue is empty — there is no
    // `offline` listener in the app at all. So a crew going underground with nothing queued kept
    // reading the green "ซิงก์แล้ว" and "ออนไลน์" for as long as they recorded nothing, which is the
    // one word on the one control they read to learn whether the link is up. `App`'s own strip asks
    // the platform directly for exactly this reason; the button asked a cached answer.
    const onConnectivityChange = () => { refreshSummary(); };
    window.addEventListener("online", onConnectivityChange);
    window.addEventListener("offline", onConnectivityChange);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("online", onConnectivityChange);
      window.removeEventListener("offline", onConnectivityChange);
      runner.stop();
    };
  }, [refreshSummary, repository, runner]);

  const value = useMemo(() => ({ repository, runner, syncSummary, refreshSummary }), [repository, runner, syncSummary, refreshSummary]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
