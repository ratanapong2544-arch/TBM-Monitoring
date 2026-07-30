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
// its mutation. Runs inside the upgrade transaction and drops nothing: every mutation, conflict and
// entity is rewritten in place, never deleted.
function recanonicalizeDomainKeys(transaction) {
  const mutations = transaction.objectStore(STORES.mutations);
  const entities = transaction.objectStore(STORES.entities);
  const conflicts = transaction.objectStore(STORES.conflicts);
  const remap = new Map();

  mutations.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (!cursor) return;
    const mutation = cursor.value;
    const domainKey = makeDomainKey(mutation);
    if (domainKey !== mutation.domainKey) {
      remap.set(mutation.domainKey, domainKey);
      cursor.update({ ...mutation, domainKey });
    }
    cursor.continue();
  };

  entities.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (!cursor) return;
    const record = cursor.value;
    const domainKey = remap.get(record.domainKey);
    if (domainKey) {
      // the key path is the record key, so a rename is a delete plus an insert
      const key = String(record.key || "").replace(record.domainKey, domainKey);
      entities.delete(cursor.primaryKey);
      entities.add({ ...record, key, domainKey });
    }
    cursor.continue();
  };

  conflicts.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (!cursor) return;
    const conflict = cursor.value;
    const domainKey = remap.get(conflict.domainKey);
    if (domainKey) cursor.update({ ...conflict, domainKey });
    cursor.continue();
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
