import { domainKeyForRow, isOptimisticKey, optimisticRecordIdOf, rowIdOf, serverEntityKey } from "./entityKeys";
import { toSyncVersion } from "./syncVersion";
import { emptyServerData } from "./normalizeServerData";
import { isTerminalStatus, MUTATION_STATUS, STORES } from "./schema";

const collections = [
  ["segments", "segment"], ["grouts", "grout"], ["secondaryGrouts", "secondaryGrout"], ["shiftReports", "shiftReport"],
  ["issues", "issue"], ["dailyReports", "dailyReport"], ["prepTasks", "prepTask"], ["instLocations", "instLocation"],
  // "instrument" must match the sync entity name, or a pending optimistic edit keys differently
  // from the incoming server record and the server value silently wins on every refresh
  ["instInstruments", "instrument"], ["instThresholds", "instThreshold"], ["instReadings", "instReading"], ["instSchedules", "instSchedule"],
];
const singletonKeys = ["planConfig", "distPlanConfig", "routeConfigs", "routeProjectTotal", "machineProgress", "syncMeta"];
// entities whose sheet (and therefore whose getData payload) is per machine; everything else is
// returned project-wide, so an unsynced record of any machine belongs in the list
const MACHINE_SCOPED_COLLECTIONS = new Set(["segment", "grout", "secondaryGrout", "shiftReport"]);
const UNRESOLVED_STATUSES = new Set([MUTATION_STATUS.PENDING, MUTATION_STATUS.SYNCING, MUTATION_STATUS.VALIDATION_ERROR, MUTATION_STATUS.CONFLICT]);
// Confirmed mutations kept for the recent list Task 10's Sync Center is specified to show. The plan
// says 50; this keeps 200 deliberately, so a crew who drains a whole offline shift can still see the
// start of it, and so Task 10 can widen its window without a second migration.
const CONFIRMED_MUTATION_RETENTION = 200;

function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function complete(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }
function scopeKey(machine) { return `getData:${machine}`; }

// A queued write has to reach the STORED snapshot too, not just the entities store: `load` rebuilds
// the lists from `entityKeys` alone, so a record created or edited offline was invisible after a
// relaunch and a record deleted offline came back. A relaunch with no link is the ordinary case
// here — an eight hour shift on a phone in a tunnel — so all three were routine data loss, not edge
// cases. The queue does that patching and borrows the scope key and the field mapping from here
// rather than re-deriving either; the entity key formats live in `entityKeys.js`, which the
// migration in `db.js` needs too.
export const snapshotScopeKey = scopeKey;
export const FIELD_FOR_ENTITY_TYPE = new Map(collections.map(([field, entityType]) => [entityType, field]));
export function isMachineScopedEntityType(entityType) { return MACHINE_SCOPED_COLLECTIONS.has(entityType); }
// The store key must be unique per server ROW, not per domain: live sheets legitimately hold two
// rows sharing a ring identity, and keying by domain alone made one row overwrite the other in the
// cache and appear twice in the list. (Four views run `deduplicateRecords` over segments; grout and
// shift reports dedupe nowhere — open item 3a. The cache has to hold what the sheet holds either
// way; what the views then do with it is their own question.)
function recordFor(machine, field, entityType, payload, index, seenIds) {
  const domainKey = domainKeyForRow(entityType, payload, machine);
  const recordId = rowIdOf(payload); // the same read `domainKeyForRow` just made, not a second one
  // A sheet can hand back two rows carrying one id — GAS appends a duplicate in at least one path,
  // and imported rows are outside this app's control. Keying both as `id:<id>` made them one cache
  // entry: one row's values overwritten, the other listed twice, and the refresh and the relaunch
  // disagreeing about which. The second occurrence falls back to its position, so the cache holds
  // what the sheet holds; only the first can be matched to a queued write, which is the best any
  // client can do when the sheet itself cannot tell them apart.
  // A row is demoted to a positional key only when it collides on its RECORD — the same id on the
  // same domain. Keyed by the bare id, every later row sharing an id with an earlier one lost its
  // `:id:` key, and the production sheet spreads seven ids over sixteen rows on sixteen rings.
  const id = recordId == null ? null : String(recordId);
  const slot = id === null ? null : recordSlot(domainKey, id);
  const duplicate = slot !== null && seenIds && seenIds.has(slot);
  if (slot !== null && seenIds) seenIds.add(slot);
  const rowId = id !== null && !duplicate ? `id:${id}` : `row:${index}`;
  return { key: serverEntityKey(machine, field, domainKey, rowId), machine, entityType, domainKey, payload };
}

// the config singletons are mutable sync entities, so a pending offline edit must survive a refresh
// exactly as a collection record does
const CONFIG_ENTITY_TYPES = [["planConfig", "planConfig"], ["distPlanConfig", "distPlanConfig"], ["routeConfig", "routeConfigs"]];
// keys optimisticEntity injects into a mutation payload; they are not part of the stored config body
const INJECTED_PAYLOAD_KEYS = new Set(["recordId", "entityType", "machine", "domainKey", "version", "syncStatus"]);
// mirror gas-live canonicalConfigPayload_: the config body is the wrapped field if present, else the
// payload with the injected metadata stripped. routeProjectTotal is a routeConfig sibling stored in
// its own singleton, so it is stripped from a routeConfig body only — a plan/dist body that
// happened to carry that field would keep it, matching the server.
function configValue(payload, entityType) {
  const source = payload || {};
  if (source[entityType] !== undefined) return source[entityType];
  const body = {};
  Object.keys(source).forEach(key => {
    if (INJECTED_PAYLOAD_KEYS.has(key)) return;
    if (key === "routeProjectTotal" && entityType === "routeConfig") return;
    body[key] = source[key];
  });
  return body;
}

// Which record a mutation or a cached row belongs to.
// `||` because a record id can contain anything the sheet holds, including the characters a domain
// key is built from. A separator that CAN occur in either side collides: with a space,
// ("segment:TBM1:P64 3", "x") and ("segment:TBM1:P64", "3 x") are one slot, and the merge would
// confuse two rings. `||` cannot appear in a domain key, which is what makes the split unambiguous.
const recordSlot = (domainKey, recordId) => `${domainKey}||${recordId == null ? "" : recordId}`;

// The newest mutation still unresolved FOR EACH RECORD — the one that speaks for that row.
//
// Per record, not per ring: two sheet rows legitimately share a ring identity, and a per-ring answer
// to a per-row question is what destroyed a queued write on the next refresh (one local copy per
// ring, so the other row's edit was dropped and its row deleted) and what let an ordinary edit of
// one row cancel the tombstone of its neighbour's pending delete.
//
// Exported because the migration in `db.js` has to answer the same question about the same rows: a
// device state where the upgrade hides a row that the first refresh shows is one rule disagreeing
// with itself, which is how a row flickers off on one path and back on the other. Sharing
// `UNRESOLVED_STATUSES` alone was not enough — the lease test and the newest-wins ordering were
// written twice, and either copy could be changed with the other half's tests still green.
//
// A SYNCING claim whose lease has expired is NOT in flight; it is abandoned, and whatever it was
// doing has to be visible again.
export function newestUnresolvedByRecord(mutations, canonicalDomainKey, now) {
  const newest = new Map();
  (mutations || [])
    .filter(mutation => UNRESOLVED_STATUSES.has(mutation.status)
      && (mutation.status !== MUTATION_STATUS.SYNCING || !mutation.leaseExpiresAt || Date.parse(mutation.leaseExpiresAt) > now))
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0))
    .forEach(mutation => newest.set(recordSlot(canonicalDomainKey(mutation), mutation.recordId), mutation));
  return newest;
}

// `requestedAt` is when the getData request went OUT, not when it came back. The difference is the
// whole window this function has to reason about: the queue drains in parallel with the fetch, so a
// response can be older than a write this device has since had confirmed.
export async function writeServerSnapshot(db, machine, data, fetchedAt, requestedAt = fetchedAt) {
  const transaction = db.transaction([STORES.entities, STORES.snapshots, STORES.mutations], "readwrite");
  const entities = transaction.objectStore(STORES.entities);
  const snapshots = transaction.objectStore(STORES.snapshots);
  const mutations = transaction.objectStore(STORES.mutations);
  // all three reads issued together and awaited as one. Awaiting the first before issuing the others
  // leaves the transaction's survival resting on how promptly a microtask runs — the same reason
  // `putOptimisticMutation` and `confirmMutation` batch theirs, and this is the hotter path.
  const [previous, existing, allMutations] = await Promise.all([
    requestResult(snapshots.get(scopeKey(machine))),
    requestResult(entities.getAll()),
    requestResult(mutations.getAll()),
  ]);
  // Everything below is keyed by RECORD, not by ring — see `newestUnresolvedByRecord` above for why.
  const slotOf = mutation => recordSlot(mutation.domainKey, mutation.recordId);
  const byQueueOrder = (left, right) => (left.queueSequence || 0) - (right.queueSequence || 0);
  const unresolvedByRecord = newestUnresolvedByRecord(allMutations, mutation => mutation.domainKey, Date.now());
  // which records have a mutation that already finished, in either direction — only the fact is
  // read, so a Map of statuses implied a significance the value never had
  const terminalRecords = new Set(allMutations.filter(mutation => isTerminalStatus(mutation.status)).map(slotOf));
  // A blank Id cell reaches here as "", not as an absent key: `getSheetDataAsJson` assigns every
  // header key from the row's values, and an empty Google Sheets cell reads as the empty string. So
  // "no id" has to mean both, or the id-less matching path below is simply never entered for the
  // shape the server actually sends — which is what `recordFor` and `deletePending` already say and
  // this said differently.
  // Which record a STORED row names, asked by where the row came from. A server row is named by the
  // sheet's id column; an OPTIMISTIC row is named by the record id its key was built from, which
  // `optimisticEntity` injects. Reading both the same way made this compare a payload's `id` against
  // a mutation's `recordId` — identical for every write Task 8 queues, and on the first Task 9 type
  // where they differ the queued row matches nothing: a deleted ring stays on every screen.
  const rowIdOfRecord = record => (isOptimisticKey(record.key)
    ? optimisticRecordIdOf(record.payload)
    : rowIdOf(record.payload));
  const slotForRow = record => recordSlot(record.domainKey, rowIdOfRecord(record));
  const unresolvedStatus = record => {
    const mutation = unresolvedByRecord.get(slotForRow(record));
    return mutation && mutation.status;
  };
  // A getData answer is composed on the server BEFORE it arrives here, and the queue drains in
  // parallel — the cold launch starts both at once. So a response can be older than a write this
  // device has since had confirmed, and writing it wholesale threw those rows away: the rings a crew
  // recorded through an offline shift reached the sheet and then vanished from the data log, the
  // dashboards, the reports and the "Last:" indicator until some later refresh, which underground
  // may be the next shift. Anything confirmed after the request went out is newer than the answer,
  // so it is kept exactly as a pending write would be.
  const confirmedAfterRequest = new Map(allMutations
    .filter(mutation => isTerminalStatus(mutation.status)
      // this device's own reading of both instants; `syncedAt` is the server's clock and comparing
      // the two would turn ordinary clock skew into either lost rows or stale ones
      && requestedAt && mutation.confirmedAtLocal && Date.parse(mutation.confirmedAtLocal) >= Date.parse(requestedAt))
    .sort(byQueueOrder)
    .map(mutation => [slotOf(mutation), mutation]));
  // A delete still in the queue is a tombstone: the server has not seen it yet, so it keeps
  // returning the row, and overlaying the optimistic copy would put the deleted ring back on screen
  // at the next refresh.
  // It hides ONE row, not the ring. Two sheet rows can share a ring identity, and a delete names the
  // row it is deleting: filtering by domain took the other row off screen too, and looking the
  // mutation up per ring let a later edit of the neighbour take the tombstone's place, which put the
  // deleted row back into the data log, the dashboards and the shift report's ring count, badged as
  // ordinary data.
  const deletePending = (domainKey, recordId) => {
    if (recordId == null || recordId === "") return false; // a row with no id names no mutation
    const slot = recordSlot(domainKey, recordId);
    // A delete CONFIRMED after the request went out is in the same position as one still in flight:
    // the answer in hand was composed before it, so the row it removed is still in that answer. The
    // optimistic copy is gone by then — a confirmed delete has no row left to describe — so nothing
    // else in this merge would notice, and the deleted ring came back onto the screen and into the
    // stored snapshot, surviving the relaunch.
    const confirmed = confirmedAfterRequest.get(slot);
    if (confirmed && confirmed.operation === "delete") return true;
    const mutation = unresolvedByRecord.get(slot);
    if (!mutation || mutation.operation !== "delete") return false;
    // In flight it hides; stuck it shows. A delete the server refused is not on its way to anything,
    // and keeping the row hidden would take it off this device's every screen while it sits on the
    // sheet — permanently, with nothing to see and nothing to press before Task 10.
    return mutation.status === MUTATION_STATUS.PENDING || mutation.status === MUTATION_STATUS.SYNCING;
  };
  const preserveLocal = record => Boolean(unresolvedStatus(record))
    || Boolean(confirmedAfterRequest.get(slotForRow(record)))
    || (!terminalRecords.has(slotForRow(record)) && UNRESOLVED_STATUSES.has(record.payload && record.payload.syncStatus));
  // The local copy of ONE record: its queued copy if it has one, else whatever the last refresh
  // cached for it. Answering this per ring gave every row of a ring the same copy, so the rest were
  // dropped from the merge and their keys — and their queued rows — deleted with them.
  // Built in ONE pass rather than scanned per incoming row: this ran over the whole entities store
  // for every row of every collection, which is quadratic in a store that already holds ~800 rows
  // (373 segments, 338 grouts and 98 shift reports in the captured payload) and grows with every
  // task that adds a collection to the loop. The queued copy wins over the
  // cached one, so it is written last and only if nothing optimistic is already there.
  // The same pass also groups the rows by entity type, because the loop below otherwise filters the
  // whole store once per collection — twelve full passes today, and Task 9 adds collections to it.
  const localByRecord = new Map();
  const existingByType = new Map();
  existing.forEach(record => {
    const ofType = existingByType.get(record.entityType);
    if (ofType) ofType.push(record); else existingByType.set(record.entityType, [record]);
    const rowId = rowIdOfRecord(record);
    if (rowId == null) return;
    const slot = recordSlot(record.domainKey, rowId); // every domain key starts with its entity type
    const held = localByRecord.get(slot);
    if (!held || (isOptimisticKey(record.key) && !isOptimisticKey(held.key))) localByRecord.set(slot, record);
  });
  const localForRecord = (domainKey, recordId) => localByRecord.get(recordSlot(domainKey, recordId));
  const preserve = (record, status) => ({ ...record, payload: { ...record.payload, syncStatus: status } });
  // An optimistic record is stamped with its mutation's machine ("GLOBAL" for a project-wide
  // entity, or another machine's id), while a server-derived record is stamped with the active
  // machine. Comparing those labels literally dropped every unsynced record whose label differed,
  // so an offline entry vanished from the list on the next refresh and got re-entered as a second
  // row. Scope by the domain key instead: it carries the owning machine for ring-scoped entities,
  // and getData returns the project-wide collections for every machine anyway.
  const domainMachine = domainKey => String(domainKey || "").split(":")[1];
  // entity type is not re-tested: the only caller iterates the per-type index built above
  const inScope = (record, entityType) => !MACHINE_SCOPED_COLLECTIONS.has(entityType)
    || domainMachine(record.domainKey) === machine;
  const previousKeys = Object.values(previous && previous.entityKeys || {}).flat();
  previousKeys.forEach(key => entities.delete(key));
  const entityKeys = {};
  const committed = emptyServerData(machine);

  collections.forEach(([field, entityType]) => {
    const seenIds = new Set();
    const incoming = (data[field] || []).map((payload, index) => recordFor(machine, field, entityType, payload, index, seenIds));
    // One rule, applied per ROW. Every incoming row keeps its place unless this device holds a
    // queued copy OF THAT ROW, in which case the crew's copy is shown; and every local copy the
    // response does not carry is appended, because the sheet may not show it yet (recorded offline)
    // or may not show it any more (another device removed it), and dropping it would take the crew's
    // own unsynced work off screen.
    // only rows that NAME a record reserve its place; an id-less row claims one below instead
    const carried = new Set(incoming.filter(record => rowIdOfRecord(record) != null).map(slotForRow));
    // Local copies this response does not carry: recorded offline and not on the sheet yet, or on
    // the sheet no longer. The store can hold both a cached server copy and a queued one for the
    // same row; the crew's is the one to keep, and only one of them may stand.
    const localOnly = new Map();
    (existingByType.get(entityType) || []).forEach(record => {
      const slot = slotForRow(record);
      if (!inScope(record, entityType) || !preserveLocal(record)) return;
      if (carried.has(slot) || deletePending(record.domainKey, rowIdOfRecord(record))) return;
      const held = localOnly.get(slot);
      if (!held || isOptimisticKey(record.key)) localOnly.set(slot, record);
    });
    // Neither side always names a record: a row the sheet stored before sync existed carries no id,
    // and neither does the local copy of one. Those can only be matched within their ring, and only
    // ONE such local copy may answer for each — otherwise two rows collapse into one again.
    // Indexed by the domain rather than scanned for it, so "only within its ring" is the shape of
    // the lookup rather than a predicate that could be dropped — and so this stops being the last
    // full scan per incoming row in a function whose point was removing them.
    const idLessByDomain = new Map();
    localOnly.forEach((record, slot) => {
      if (rowIdOfRecord(record) != null) return;
      const waiting = idLessByDomain.get(record.domainKey);
      if (waiting) waiting.push(slot); else idLessByDomain.set(record.domainKey, [slot]);
    });
    const claimWithinDomain = domainKey => {
      const waiting = idLessByDomain.get(domainKey);
      const slot = waiting && waiting.shift();
      if (slot === undefined) return null;
      const record = localOnly.get(slot);
      localOnly.delete(slot);
      return record;
    };
    // A local copy answers for ONE incoming row, and a delete removes ONE. Two sheet rows can carry
    // the same id — the cache keys the second by its position for exactly that reason — and both of
    // these matched on the payload id, so both rows were handed the same queued copy (the second
    // row's own values lost from the list and the store, and its key named twice in the snapshot)
    // and one delete took both off screen. The id-less branch below has always claimed its match;
    // this is that same rule for the named one. The sheet cannot tell its duplicates apart any
    // better than this client can, and neither can the server — `readRowById_` takes the first it
    // finds — so the first row is the one that answers.
    const claimed = new Set();
    const claimOnce = (domainKey, recordId, find) => {
      const slot = recordSlot(domainKey, recordId);
      if (claimed.has(slot)) return null;
      const found = find();
      if (found) claimed.add(slot);
      return found;
    };
    // ONE set for both, because a mutation is about one row: once a delete has taken the row it
    // names, its optimistic copy must not then be painted over the duplicate that survived — that
    // copy is a tombstone, not a value, and the surviving row came back carrying none of its own
    // fields. The filter runs over every incoming row before the map does, so the delete claims
    // first.
    const hiddenByDelete = record => {
      const slot = slotForRow(record);
      if (!deletePending(record.domainKey, rowIdOfRecord(record)) || claimed.has(slot)) return false;
      claimed.add(slot);
      return true;
    };
    const fromServer = incoming
      .filter(record => !hiddenByDelete(record))
      .map(record => {
        const local = rowIdOfRecord(record) == null
          ? claimWithinDomain(record.domainKey)
          : claimOnce(record.domainKey, rowIdOfRecord(record), () => localForRecord(record.domainKey, rowIdOfRecord(record)));
        if (!local || !preserveLocal(local)) return record;
        return preserve(local, unresolvedStatus(local) || local.payload.syncStatus);
      });
    const merged = fromServer.concat(
      [...localOnly.values()].map(record => preserve(record, unresolvedStatus(record) || record.payload.syncStatus)),
    );
    entityKeys[field] = merged.map(record => record.key);
    committed[field] = merged.map(record => record.payload);
    merged.forEach(record => entities.put(record));
  });

  const snapshot = { scopeKey: scopeKey(machine), machine, fetchedAt, entityKeys };
  singletonKeys.forEach(key => { snapshot[key] = data[key]; committed[key] = data[key]; });
  const mergedSyncMeta = mergeSyncMeta(previous, data);
  snapshot.syncMeta = mergedSyncMeta;
  committed.syncMeta = mergedSyncMeta;
  overlayConfigSingletons({ snapshot, committed, existing, machine, preserveLocal });
  pruneConfirmedMutations(mutations, allMutations);

  snapshots.put(snapshot);
  await complete(transaction);
  return { ...committed, fetchedAt };
}

// `syncMeta` is the one singleton this device also writes: `confirmMutation` records what the server
// confirmed so the next edit can stamp it. A getData answer composed before that confirmation would
// otherwise replace it with the version from before this device's own write, and the next edit of
// that record would be refused as a conflict nobody caused. Take the higher of the two per key — a
// version only ever moves forward.
function mergeSyncMeta(previous, data) {
  const previousSyncMeta = (previous && previous.syncMeta) || {};
  const merged = { ...(data.syncMeta || {}) };
  Object.keys(previousSyncMeta).forEach(key => {
    const mine = previousSyncMeta[key];
    const theirs = merged[key];
    if (!theirs || toSyncVersion(mine && mine.version) > toSyncVersion(theirs.version)) merged[key] = mine;
  });
  return merged;
}

// A pending config edit must not be erased by server data either. These arrive as singletons rather
// than collection rows, so they need the same optimistic overlay: without it an offline plan edit
// disappeared on the next refresh and was re-entered, conflicting with itself.
function overlayConfigSingletons({ snapshot, committed, existing, machine, preserveLocal }) {
  CONFIG_ENTITY_TYPES.forEach(([entityType, field]) => {
    existing.filter(record => record.entityType === entityType && preserveLocal(record)).forEach(record => {
      const value = configValue(record.payload, entityType);
      const recordMachine = record.domainKey.split(":")[1];
      if (field === "routeConfigs") {
        snapshot[field] = { ...(snapshot[field] || {}), [recordMachine]: value };
        // routeProjectTotal is a sibling singleton, edited through the same routeConfig mutation
        const total = record.payload && record.payload.routeProjectTotal;
        if (total !== undefined) { snapshot.routeProjectTotal = total; committed.routeProjectTotal = total; }
      } else if (recordMachine === machine) {
        snapshot[field] = value;
      } else {
        return;
      }
      committed[field] = snapshot[field];
    });
  });
}

// Bound the mutation log: every refresh reads it whole, so lifetime growth would slow the hot read
// path forever. Only already-confirmed mutations past the recent window Task 10's Sync Center is
// specified to show are dropped — pending, error and conflict records are never touched (handoff
// safety note 5).
function pruneConfirmedMutations(mutations, allMutations) {
  allMutations
    .filter(mutation => isTerminalStatus(mutation.status))
    .sort((left, right) => (right.queueSequence || 0) - (left.queueSequence || 0))
    .slice(CONFIRMED_MUTATION_RETENTION)
    .forEach(mutation => mutations.delete(mutation.requestId));
}

export async function readServerSnapshot(db, machine) {
  const transaction = db.transaction([STORES.entities, STORES.snapshots], "readonly");
  const snapshots = transaction.objectStore(STORES.snapshots);
  const entities = transaction.objectStore(STORES.entities);
  const snapshot = await requestResult(snapshots.get(scopeKey(machine)));
  if (!snapshot) { await complete(transaction); return null; }
  const result = emptyServerData(machine);
  await Promise.all(collections.map(async ([field]) => {
    const keys = snapshot.entityKeys && snapshot.entityKeys[field] || [];
    result[field] = (await Promise.all(keys.map(key => requestResult(entities.get(key))))).filter(Boolean).map(record => record.payload);
  }));
  singletonKeys.forEach(key => { if (snapshot[key] !== undefined) result[key] = snapshot[key]; });
  await complete(transaction);
  return { ...result, fetchedAt: snapshot.fetchedAt };
}
