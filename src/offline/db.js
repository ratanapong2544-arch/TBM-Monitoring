import { makeDomainKey } from "./domainKey";
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
    if (remap.size === 0) return;

    entities.getAll().onsuccess = entitiesEvent => {
      (entitiesEvent.target.result || []).forEach(record => {
        const optimisticKey = `entity:optimistic:${record.domainKey}`;
        if (record.key !== optimisticKey) {
          entities.delete(record.key); // server-snapshot cache row → rebuilt on refresh
          return;
        }
        const domainKey = remap.get(record.domainKey);
        if (!domainKey) return;
        entities.delete(record.key);
        entities.put({ ...record, key: `entity:optimistic:${domainKey}`, domainKey }); // last-wins
      });
    };

    conflicts.getAll().onsuccess = conflictsEvent => {
      (conflictsEvent.target.result || []).forEach(conflict => {
        const domainKey = remap.get(conflict.domainKey);
        if (domainKey) conflicts.put({ ...conflict, domainKey });
      });
    };

    // the cache references pre-migration keys; drop it so load() never resolves a stale key
    transaction.objectStore(STORES.snapshots).clear();
  };
}

export function openOfflineDb() {
  if (openDbPromise) return openDbPromise;

  openDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
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
      if (event.oldVersion >= 1 && event.oldVersion < 2) recanonicalizeDomainKeys(request.transaction);
    };
    request.onsuccess = () => {
      openDb = request.result;
      openDb.onversionchange = () => closeOfflineDb();
      resolve(openDb);
    };
    request.onerror = () => {
      openDbPromise = undefined;
      reject(request.error);
    };
  });

  return openDbPromise;
}

export function closeOfflineDb() {
  if (openDb) openDb.close();
  openDb = undefined;
  openDbPromise = undefined;
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
