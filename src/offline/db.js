import { makeDomainKey } from "./domainKey";
import { isLegacyOptimisticKey, isOptimisticKey, optimisticEntityKey } from "./entityKeys";
import { DB_NAME, DB_VERSION, STORES } from "./schema";

let openDbPromise;
let openDb;

function createStore(db, name, options, indexes) {
  const store = db.createObjectStore(name, options);
  indexes.forEach(([indexName, keyPath]) => store.createIndex(indexName, keyPath));
}

// Version 2 re-keys records written under an earlier domain-key format (shift-report dates were
// stored as a round-tripped UTC ISO string; project-wide entities carried a machine instead of
// GLOBAL). GAS refuses any envelope whose key is not the canonical one, so a stale key would strand
// its mutation. Runs inside the upgrade transaction and drops no mutation or conflict.
//
// The passes are STRICTLY SEQUENCED: the entity and conflict passes must see the fully-built
// remap, so they are requested only from inside the mutations getAll() callback. Concurrent
// cursors would interleave and read a half-built remap, silently stranding ~half the records.
// Renames use put(), not add(): two v1 records can re-key onto one canonical key (the same record
// edited under two machines, or two shift edits on one day), and add() would throw ConstraintError
// and abort the whole upgrade, bricking the database. put() keeps the last writer — the losing
// mutation is still in the queue, so its edit is not lost, only its stale optimistic snapshot.
//
// Durable records are re-keyed in place; the cache is discarded. Only the optimistic entity rows
// (which back a pending edit) are re-keyed — the server-snapshot cache rows and the snapshots
// store are cleared, because their entityKeys lists reference the pre-migration keys and a
// re-key would leave load() resolving keys that no longer exist. The cache rebuilds on the first
// refresh (spec §7 empty-state until then); the pending mutations, conflicts and their optimistic
// rows all survive re-keyed.
// v3: the optimistic entity key gained the record id, so one ring can hold a queued copy of each of
// its rows. Existing rows are re-keyed from the record id their own payload already carries; a row
// without one cannot be placed and is dropped, which costs only its on-screen copy — its mutation is
// still in the queue and rewrites the row when it drains. The snapshot lists name the old keys, so
// they are cleared along with the server cache and rebuilt on the first refresh, exactly as the v2
// migration does.
export function recordScopeOptimisticKeys(transaction) {
  const entities = transaction.objectStore(STORES.entities);
  const snapshots = transaction.objectStore(STORES.snapshots);

  entities.getAll().onsuccess = event => {
    (event.target.result || []).forEach(record => {
      if (!isLegacyOptimisticKey(record.key)) {
        if (!isOptimisticKey(record.key)) entities.delete(record.key); // cache row → rebuilt on refresh
        return;
      }
      entities.delete(record.key);
      const recordId = record.payload && (record.payload.recordId ?? record.payload.id);
      if (recordId == null || recordId === "") return;
      entities.put({ ...record, key: optimisticEntityKey(record.domainKey, recordId) });
    });
  };

  snapshots.clear();
}

export function recanonicalizeDomainKeys(transaction) {
  const mutations = transaction.objectStore(STORES.mutations);
  const entities = transaction.objectStore(STORES.entities);
  const conflicts = transaction.objectStore(STORES.conflicts);

  mutations.getAll().onsuccess = mutationsEvent => {
    const remap = new Map();
    (mutationsEvent.target.result || []).forEach(mutation => {
      const domainKey = makeDomainKey(mutation);
      if (domainKey !== mutation.domainKey) {
        remap.set(mutation.domainKey, domainKey);
        mutations.put({ ...mutation, domainKey }); // keyed by requestId, so no rename collision
      }
    });
    // ONE pass over the entities, applying both rewrites: the domain remap where there is one, and
    // the record-scoped key for every legacy optimistic row. It runs even when the remap is empty,
    // because an install whose keys were already canonical still has v2-shaped optimistic rows —
    // and two passes over one store inside a single upgrade transaction would interleave, the
    // second reading rows the first had not rewritten yet.
    let rekeyed = remap.size > 0;
    entities.getAll().onsuccess = entitiesEvent => {
      (entitiesEvent.target.result || []).forEach(record => {
        if (!isOptimisticKey(record.key)) {
          entities.delete(record.key); // server-snapshot cache row → rebuilt on refresh
          rekeyed = true;
          return;
        }
        const domainKey = remap.get(record.domainKey) || record.domainKey;
        const recordId = record.payload && (record.payload.recordId ?? record.payload.id);
        const key = recordId == null || recordId === "" ? null : optimisticEntityKey(domainKey, recordId);
        if (key === record.key) return;
        entities.delete(record.key);
        rekeyed = true;
        // A row whose payload names no record cannot be placed under the new key. Dropping it costs
        // its on-screen copy only: its mutation is still in the queue and rewrites the row when it
        // drains.
        if (key) entities.put({ ...record, key, domainKey }); // last-wins
      });
      // the cache references pre-migration keys; drop it so load() never resolves a stale one
      if (rekeyed) transaction.objectStore(STORES.snapshots).clear();
    };

    if (remap.size === 0) return;

    conflicts.getAll().onsuccess = conflictsEvent => {
      (conflictsEvent.target.result || []).forEach(conflict => {
        const domainKey = remap.get(conflict.domainKey);
        if (domainKey) conflicts.put({ ...conflict, domainKey });
      });
    };
  };
}

// An open that never settles is worse than one that fails: every caller awaits it, and the app sits
// on its splash with no message and no way out but a reload. Two real causes — another tab still
// holding an older DB_VERSION after a service-worker update (fires `blocked`, and the upgrade waits
// for that tab forever), and the WebKit stall on iOS, which fires nothing at all. Both end as a
// rejection here so the caller's catch runs and the app carries on server-only.
export const OPEN_DB_TIMEOUT_MS = 8000;

let openGeneration = 0;

export function openOfflineDb() {
  if (openDbPromise) return openDbPromise;

  // an abandoned open (closeOfflineDb ran while it was still pending) must not clear a promise that
  // belongs to a later attempt when its timer eventually fires
  const generation = ++openGeneration;
  const forgetIfCurrent = () => { if (generation === openGeneration) openDbPromise = undefined; };

  openDbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const fail = message => {
      if (settled) return;
      settled = true;
      forgetIfCurrent();
      clearTimeout(timer);
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("IndexedDB open timed out"), OPEN_DB_TIMEOUT_MS);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onblocked = () => fail("IndexedDB upgrade blocked by another tab");
    request.onupgradeneeded = event => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.entities)) {
        createStore(db, STORES.entities, { keyPath: "key" }, [["entityType", "entityType"], ["machine", "machine"], ["domainKey", "domainKey"]]);
      }
      if (!db.objectStoreNames.contains(STORES.snapshots)) createStore(db, STORES.snapshots, { keyPath: "scopeKey" }, []);
      if (!db.objectStoreNames.contains(STORES.mutations)) {
        createStore(db, STORES.mutations, { keyPath: "requestId" }, [["status", "status"], ["createdAtLocal", "createdAtLocal"], ["domainKey", "domainKey"]]);
      }
      if (!db.objectStoreNames.contains(STORES.conflicts)) {
        createStore(db, STORES.conflicts, { keyPath: "conflictId" }, [["status", "status"], ["domainKey", "domainKey"]]);
      }
      if (!db.objectStoreNames.contains(STORES.syncMeta)) createStore(db, STORES.syncMeta, { keyPath: "key" }, []);
      if (!db.objectStoreNames.contains(STORES.deviceMeta)) createStore(db, STORES.deviceMeta, { keyPath: "key" }, []);
      // Exactly one of these runs. Both rewrite every optimistic row, and two `getAll` passes over
      // one store inside a single upgrade transaction would interleave — the second reading rows the
      // first had not rewritten yet. The v1 path therefore writes the v3 key shape itself.
      if (event.oldVersion >= 1 && event.oldVersion < 2) recanonicalizeDomainKeys(request.transaction);
      else if (event.oldVersion === 2) recordScopeOptimisticKeys(request.transaction);
    };
    request.onsuccess = () => {
      // `settled` covers the timeout; the generation covers `closeOfflineDb` running while this open
      // was still in flight. Without the second check the abandoned request still assigned `openDb`
      // when it eventually succeeded — a connection to a database the caller had already closed,
      // held by nobody, blocking the next upgrade or delete.
      if (settled || generation !== openGeneration) { request.result.close(); return; }
      settled = true;
      clearTimeout(timer);
      openDb = request.result;
      openDb.onversionchange = () => closeOfflineDb();
      resolve(openDb);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      forgetIfCurrent();
      clearTimeout(timer);
      reject(request.error);
    };
  });

  return openDbPromise;
}

export function closeOfflineDb() {
  if (openDb) openDb.close();
  openDb = undefined;
  openDbPromise = undefined;
  // any open still in flight belongs to a caller that has gone away: bump the generation so its
  // success handler closes the connection instead of installing it behind everyone's back
  openGeneration += 1;
}

export function deleteOfflineDbForTests() {
  closeOfflineDb();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Offline database deletion was blocked"));
  });
}
