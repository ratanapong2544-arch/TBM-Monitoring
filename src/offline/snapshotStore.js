import { makeDomainKey } from "./domainKey";
import { isOptimisticKey, serverEntityKey } from "./entityKeys";
import { toSyncVersion } from "./syncVersion";
import { emptyServerData } from "./normalizeServerData";
import { MUTATION_STATUS, STORES } from "./schema";

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
// exported because the migration in `db.js` answers the same question about the same rows: two
// spellings of "still unresolved" would let the list a migration rebuilds disagree with the list the
// next refresh produces, for the same store
export const UNRESOLVED_STATUSES = new Set([MUTATION_STATUS.PENDING, MUTATION_STATUS.SYNCING, MUTATION_STATUS.VALIDATION_ERROR, MUTATION_STATUS.CONFLICT]);
// confirmed mutations kept for the Sync Center's recent list (it shows the last 50)
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
// rows sharing a ring identity (the views run deduplicateRecords over them), and keying by domain
// alone made one row overwrite the other in the cache and appear twice in the list.
function recordFor(machine, field, entityType, payload, index, seenIds) {
  const recordMachine = payload.machine || machine;
  const domainKey = makeDomainKey({ entityType, machine: recordMachine, recordId: payload.id, payload });
  // A sheet can hand back two rows carrying one id — GAS appends a duplicate in at least one path,
  // and imported rows are outside this app's control. Keying both as `id:<id>` made them one cache
  // entry: one row's values overwritten, the other listed twice, and the refresh and the relaunch
  // disagreeing about which. The second occurrence falls back to its position, so the cache holds
  // what the sheet holds; only the first can be matched to a queued write, which is the best any
  // client can do when the sheet itself cannot tell them apart.
  const id = payload.id != null && payload.id !== "" ? String(payload.id) : null;
  const duplicate = id !== null && seenIds && seenIds.has(id);
  if (id !== null && seenIds) seenIds.add(id);
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
  const [previous, existing, pendingMutations] = await Promise.all([
    requestResult(snapshots.get(scopeKey(machine))),
    requestResult(entities.getAll()),
    requestResult(mutations.getAll()),
  ]);
  // Everything below is keyed by RECORD, not by ring. The store learned that distinction when the
  // optimistic key gained the record id; these did not, and a per-ring answer to a per-row question
  // is what destroyed a queued write on the next refresh (one local copy per ring, so the other
  // row's edit was dropped and its row deleted) and what let an ordinary edit of one row cancel the
  // tombstone of its neighbour's pending delete (one mutation slot per ring, newest wins).
  // `||` because a domain key is colon-separated and a record id can contain anything the sheet
  // holds: without a separator that cannot occur in a domain key, ("segment:TBM1:P64", "3x") and
  // ("segment:TBM1:P643", "x") would name the same slot and the merge would confuse two rings.
  const recordSlot = (domainKey, recordId) => `${domainKey}||${recordId == null ? "" : recordId}`;
  const slotOf = mutation => recordSlot(mutation.domainKey, mutation.recordId);
  const byQueueOrder = (left, right) => (left.queueSequence || 0) - (right.queueSequence || 0);
  const unresolvedByRecord = new Map(pendingMutations
    .filter(mutation => UNRESOLVED_STATUSES.has(mutation.status) && (mutation.status !== MUTATION_STATUS.SYNCING || !mutation.leaseExpiresAt || Date.parse(mutation.leaseExpiresAt) > Date.now()))
    .sort(byQueueOrder)
    .map(mutation => [slotOf(mutation), mutation]));
  const terminalByRecord = new Map(pendingMutations
    .filter(mutation => mutation.status === MUTATION_STATUS.SYNCED || mutation.status === MUTATION_STATUS.RESOLVED)
    .sort(byQueueOrder)
    .map(mutation => [slotOf(mutation), mutation.status]));
  const rowIdOf = record => (record.payload && record.payload.id) ?? (record.payload && record.payload.recordId);
  const slotForRow = record => recordSlot(record.domainKey, rowIdOf(record));
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
  const confirmedAfterRequest = new Map(pendingMutations
    .filter(mutation => (mutation.status === MUTATION_STATUS.SYNCED || mutation.status === MUTATION_STATUS.RESOLVED)
      // this device's own reading of both instants; `syncedAt` is the server's clock and comparing
      // the two would turn ordinary clock skew into either lost rows or stale ones
      && requestedAt && mutation.confirmedAtLocal && Date.parse(mutation.confirmedAtLocal) >= Date.parse(requestedAt))
    .sort(byQueueOrder)
    .map(mutation => [slotOf(mutation), mutation]));
  // a delete still in the queue is a tombstone: the server has not seen it yet, so it keeps
  // returning the row, and overlaying the optimistic copy would put the deleted ring back on screen
  // at the next refresh. Hide it until the mutation leaves the queue one way or the other.
  // The tombstone lasts exactly as long as the delete is still on its way. A delete the server
  // refused or flagged as a conflict is not on its way to anything: keeping the row hidden takes it
  // off this device's every screen while it sits on the sheet, permanently, with nothing to see and
  // nothing to press — there is no conflict UI until Task 10. In flight it hides; stuck it shows.
  // It hides ONE row, not the ring. Two sheet rows can share a ring identity, and a delete names the
  // row it is deleting: filtering by domain took the other one off screen as well, on a device whose
  // crew had asked for neither.
  // A delete hides ONE row. It is looked up by that row, so a later edit of a neighbour sharing the
  // ring cannot take its place — one slot per ring meant exactly that, and the deleted row came back
  // into the data log, the dashboards and the shift report's ring count, badged as ordinary data,
  // until the queue drained and removed it again.
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
    || (!terminalByRecord.get(slotForRow(record)) && UNRESOLVED_STATUSES.has(record.payload && record.payload.syncStatus));
  // The local copy of ONE record: its queued copy if it has one, else whatever the last refresh
  // cached for it. Answering this per ring gave every row of a ring the same copy, so the rest were
  // dropped from the merge and their keys — and their queued rows — deleted with them.
  const localForRecord = (domainKey, entityType, recordId) => {
    const mine = existing.filter(record => record.entityType === entityType
      && record.domainKey === domainKey && String(rowIdOf(record)) === String(recordId));
    return mine.find(record => isOptimisticKey(record.key)) || mine[0];
  };
  const preserve = (record, status) => ({ ...record, payload: { ...record.payload, syncStatus: status } });
  // An optimistic record is stamped with its mutation's machine ("GLOBAL" for a project-wide
  // entity, or another machine's id), while a server-derived record is stamped with the active
  // machine. Comparing those labels literally dropped every unsynced record whose label differed,
  // so an offline entry vanished from the list on the next refresh and got re-entered as a second
  // row. Scope by the domain key instead: it carries the owning machine for ring-scoped entities,
  // and getData returns the project-wide collections for every machine anyway.
  const domainMachine = domainKey => String(domainKey || "").split(":")[1];
  const inScope = (record, entityType) => record.entityType === entityType
    && (!MACHINE_SCOPED_COLLECTIONS.has(entityType) || domainMachine(record.domainKey) === machine);
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
    // own unsynced work off screen. There is no per-ring step left anywhere in here: each one that
    // existed answered a per-row question with a per-ring answer, and each produced a defect —
    // a queued write deleted on the next refresh, an edit painted onto a neighbour, a deleted row
    // resurrected by an edit of the row beside it.
    // only rows that NAME a record reserve its place; an id-less row claims one below instead
    const carried = new Set(incoming.filter(record => rowIdOf(record) != null).map(slotForRow));
    // Local copies this response does not carry: recorded offline and not on the sheet yet, or on
    // the sheet no longer. The store can hold both a cached server copy and a queued one for the
    // same row; the crew's is the one to keep, and only one of them may stand.
    const localOnly = new Map();
    existing
      .filter(record => inScope(record, entityType) && preserveLocal(record))
      .filter(record => !carried.has(slotForRow(record)))
      .filter(record => !deletePending(record.domainKey, rowIdOf(record)))
      .forEach(record => {
        const held = localOnly.get(slotForRow(record));
        if (!held || isOptimisticKey(record.key)) localOnly.set(slotForRow(record), record);
      });
    // Neither side always names a record: a row the sheet stored before sync existed carries no id,
    // and neither does the local copy of one. Those can only be matched within their ring, and only
    // ONE such local copy may answer for each — otherwise two rows collapse into one again.
    const claimWithinDomain = domainKey => {
      const slot = [...localOnly.keys()]
        .find(key => localOnly.get(key).domainKey === domainKey && rowIdOf(localOnly.get(key)) == null);
      if (slot === undefined) return null;
      const record = localOnly.get(slot);
      localOnly.delete(slot);
      return record;
    };
    const fromServer = incoming
      .filter(record => !deletePending(record.domainKey, rowIdOf(record)))
      .map(record => {
        const local = rowIdOf(record) == null
          ? claimWithinDomain(record.domainKey)
          : localForRecord(record.domainKey, entityType, rowIdOf(record));
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
  // `syncMeta` is the one singleton this device also writes: `confirmMutation` records what the
  // server confirmed so the next edit can stamp it. A getData answer composed before that
  // confirmation would otherwise replace it with the version from before this device's own write,
  // and the next edit of that record would be refused as a conflict nobody caused. Take the higher
  // of the two per key — a version only ever moves forward.
  const previousSyncMeta = (previous && previous.syncMeta) || {};
  const mergedSyncMeta = { ...(data.syncMeta || {}) };
  Object.keys(previousSyncMeta).forEach(key => {
    const mine = previousSyncMeta[key];
    const theirs = mergedSyncMeta[key];
    if (!theirs || toSyncVersion(mine && mine.version) > toSyncVersion(theirs.version)) mergedSyncMeta[key] = mine;
  });
  snapshot.syncMeta = mergedSyncMeta;
  committed.syncMeta = mergedSyncMeta;
  // A pending config edit must not be erased by server data either. These arrive as singletons
  // rather than collection rows, so they need the same optimistic overlay: without it an offline
  // plan edit disappeared on the next refresh and was re-entered, conflicting with itself.
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
  // Bound the mutation log: every refresh reads it whole, so lifetime growth would slow the hot
  // read path forever. Only already-confirmed mutations past the Sync Center's "recent" window are
  // dropped — pending, error and conflict records are never touched (handoff safety note 5).
  const confirmed = pendingMutations
    .filter(mutation => mutation.status === MUTATION_STATUS.SYNCED || mutation.status === MUTATION_STATUS.RESOLVED)
    .sort((left, right) => (right.queueSequence || 0) - (left.queueSequence || 0));
  confirmed.slice(CONFIRMED_MUTATION_RETENTION).forEach(mutation => mutations.delete(mutation.requestId));

  snapshots.put(snapshot);
  await complete(transaction);
  return { ...committed, fetchedAt };
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
