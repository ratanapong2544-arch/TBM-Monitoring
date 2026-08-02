import { makeDomainKey } from "./domainKey";
import { isLegacyOptimisticKey, isOptimisticKey, optimisticEntityKey, optimisticRecordIdOf } from "./entityKeys";
import { DB_NAME, DB_VERSION, MUTATION_STATUS, STORES, hidesRecord } from "./schema";
import { FIELD_FOR_ENTITY_TYPE, isMachineScopedEntityType, newestUnresolvedByRecord } from "./snapshotStore";

let openDbPromise;
let openDb;

function createStore(db, name, options, indexes) {
  const store = db.createObjectStore(name, options);
  indexes.forEach(([indexName, keyPath]) => store.createIndex(indexName, keyPath));
}

// v3: the optimistic entity key gained the record id, so one ring can hold a queued copy of each of
// its rows. Existing rows are re-keyed from the record id their own payload already carries; a row
// without one cannot be placed and is dropped, which costs only its on-screen copy — its mutation is
// still in the queue and rewrites the row when it drains.
function recordScopeOptimisticKeys(transaction) {
  const entities = transaction.objectStore(STORES.entities);
  const snapshots = transaction.objectStore(STORES.snapshots);

  // Sequenced, not concurrent: the rebuild needs the stored snapshots, the queue's tombstones AND
  // the rows that survived, and two requests over one store inside an upgrade transaction
  // interleave.
  snapshots.getAll().onsuccess = snapshotsEvent => {
    const stored = snapshotsEvent.target.result || [];
    transaction.objectStore(STORES.mutations).getAll().onsuccess = mutationsEvent => {
      const hidden = tombstonedKeys(mutationsEvent.target.result, mutation => mutation.domainKey, Date.now());
      entities.getAll().onsuccess = event => {
        const kept = [];
        (event.target.result || []).forEach(record => {
          if (!isLegacyOptimisticKey(record.key)) {
            if (isOptimisticKey(record.key)) kept.push(keptRow(record.key, record));
            else entities.delete(record.key); // cache row → rebuilt on refresh
            return;
          }
          entities.delete(record.key);
          const recordId = optimisticRecordIdOf(record.payload);
          if (recordId == null) return;
          const key = optimisticEntityKey(record.domainKey, recordId);
          entities.put({ ...record, key });
          kept.push(keptRow(key, record));
        });
        rebuildSnapshotRows(snapshots, stored, kept, hidden);
      };
    };
  };
}

// The optimistic rows a rebuild must NOT name, because the crew deleted them. A queued delete's
// representation on screen is an ABSENCE, and the entities store cannot hold one:
// `putOptimisticMutation` writes an optimistic row for a delete like any other write, and it is
// `patchSnapshotKeys` that takes the key out of the list. So a rebuild that reads the store puts the
// deleted ring back into the data log, the dashboards and the shift report's ring count, badged as
// ordinary pending work, until the next successful getData — which underground is the next shift.
// It asks `deletePending`'s question, and asks it through `deletePending`'s own code — the newest
// unresolved mutation for the RECORD, which is where the lease test and the newest-wins ordering
// live. Written out separately here, either copy could be changed with the other half's tests still
// green, and a device state where the upgrade hides a row the first refresh shows is one rule
// disagreeing with itself. The rest is `hidesRecord` — this held a fourth inline copy of it, which
// is the shape that has cost this branch a fix in most review rounds.
function tombstonedKeys(mutations, canonicalDomainKey, now) {
  return new Set([...newestUnresolvedByRecord(mutations, canonicalDomainKey, now).values()]
    .filter(mutation => hidesRecord(mutation, now))
    .map(mutation => optimisticEntityKey(canonicalDomainKey(mutation), mutation.recordId)));
}

// Which snapshot list a surviving row belongs in. The machine comes from the domain key rather than
// the row's own `machine` field because the key is what the migration has just canonicalised, and it
// is the same thing the snapshot merge scopes by.
function keptRow(key, record) {
  return { key, entityType: record.entityType, machine: String(record.domainKey || "").split(":")[1] };
}

// A migration that CLEARED the snapshots took the crew's own queued work off every screen.
// `readServerSnapshot` rebuilds each list from `snapshot.entityKeys` alone, so with no snapshot
// there is nothing to rebuild from: the re-keyed optimistic rows sit in IndexedDB and appear on no
// page, while the only thing said about it is "N รายการรอซิงก์ขึ้นเซิร์ฟเวอร์" — a message about
// the queue, not about the app having forgotten the shift. Re-entering the report then files a
// SECOND create for the one shift; the first is not rebased (creates never are) so it lands and the
// second is refused, and the sheet keeps the stub instead of the full report the crew typed.
//
// So the snapshot is REDUCED rather than dropped: the row lists are rebuilt from the rows that
// survived, and everything else it holds is kept, because none of it references an entity key —
// `syncMeta` above all, which is server-confirmed state and not cache (losing it makes the next edit
// of a confirmed record claim a stale version, refused as a conflict nobody caused). `fetchedAt`
// goes to null: the lists now hold only what the queue is carrying, and a timestamp under them would
// read as a full picture of the sheet.
function rebuildSnapshotRows(snapshots, stored, kept, hidden) {
  stored.forEach(snapshot => {
    const entityKeys = {};
    // ONE entry per surviving ROW. `kept` holds one per SOURCE row, and two source rows can re-key
    // onto one destination key — `entities.put` is last-wins, so they become a single stored row.
    // Naming it twice makes `readServerSnapshot` resolve it twice and render the record twice, which
    // is the defect the per-record key was introduced to close.
    const named = new Set();
    kept.forEach(row => {
      const field = FIELD_FOR_ENTITY_TYPE.get(row.entityType);
      // a config singleton is not a row in any list — it is overlaid from the entities store itself
      if (!field) return;
      if (isMachineScopedEntityType(row.entityType) && row.machine !== snapshot.machine) return;
      if (named.has(row.key) || hidden.has(row.key)) return;
      named.add(row.key);
      entityKeys[field] = (entityKeys[field] || []).concat(row.key);
    });
    snapshots.put({ ...snapshot, fetchedAt: null, entityKeys });
  });
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
// Durable records are re-keyed in place; the server-snapshot CACHE ROWS are discarded, because the
// keys they were stored under are the ones being rewritten. The cache rebuilds on the first refresh
// (spec §7 empty-state until then); the pending mutations, conflicts and their optimistic rows all
// survive re-keyed — and, since the snapshot is rebuilt rather than cleared, stay on screen.
export function recanonicalizeDomainKeys(transaction) {
  const mutations = transaction.objectStore(STORES.mutations);
  const entities = transaction.objectStore(STORES.entities);
  const conflicts = transaction.objectStore(STORES.conflicts);
  const snapshots = transaction.objectStore(STORES.snapshots);

  snapshots.getAll().onsuccess = snapshotsEvent => {
    const stored = snapshotsEvent.target.result || [];
    mutations.getAll().onsuccess = mutationsEvent => {
      const remap = new Map();
      (mutationsEvent.target.result || []).forEach(mutation => {
        const domainKey = makeDomainKey(mutation);
        if (domainKey !== mutation.domainKey) {
          remap.set(mutation.domainKey, domainKey);
          mutations.put({ ...mutation, domainKey }); // keyed by requestId, so no rename collision
        }
      });
      // read from the CANONICAL key, since that is the shape the rows are being re-keyed into
      const hidden = tombstonedKeys(mutationsEvent.target.result, makeDomainKey, Date.now());
      // ONE pass over the entities, applying both rewrites: the domain remap where there is one, and
      // the record-scoped key for every legacy optimistic row. It runs even when the remap is empty,
      // because an install whose keys were already canonical still has v2-shaped optimistic rows —
      // and two passes over one store inside a single upgrade transaction would interleave, the
      // second reading rows the first had not rewritten yet.
      let rekeyed = remap.size > 0;
      entities.getAll().onsuccess = entitiesEvent => {
        const kept = [];
        (entitiesEvent.target.result || []).forEach(record => {
          if (!isOptimisticKey(record.key)) {
            entities.delete(record.key); // server-snapshot cache row → rebuilt on refresh
            rekeyed = true;
            return;
          }
          const domainKey = remap.get(record.domainKey) || record.domainKey;
          const recordId = optimisticRecordIdOf(record.payload);
          const key = recordId == null ? null : optimisticEntityKey(domainKey, recordId);
          if (key === record.key) { kept.push(keptRow(key, record)); return; }
          entities.delete(record.key);
          rekeyed = true;
          // A row whose payload names no record cannot be placed under the new key. Dropping it
          // costs its on-screen copy only: its mutation is still in the queue and rewrites the row
          // when it drains.
          if (!key) return;
          entities.put({ ...record, key, domainKey }); // last-wins
          kept.push(keptRow(key, { ...record, domainKey }));
        });
        // the lists name pre-migration keys; rebuild them from what survived, so load() never
        // resolves a stale key and never loses sight of a queued row either
        if (rekeyed) rebuildSnapshotRows(snapshots, stored, kept, hidden);
      };

      if (remap.size === 0) return;

      conflicts.getAll().onsuccess = conflictsEvent => {
        (conflictsEvent.target.result || []).forEach(conflict => {
          const domainKey = remap.get(conflict.domainKey);
          if (domainKey) conflicts.put({ ...conflict, domainKey });
        });
      };
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
