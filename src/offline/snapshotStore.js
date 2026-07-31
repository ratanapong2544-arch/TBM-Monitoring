import { makeDomainKey } from "./domainKey";
import { optimisticEntityKey, serverEntityKey } from "./entityKeys";
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
const UNRESOLVED_STATUSES = new Set([MUTATION_STATUS.PENDING, MUTATION_STATUS.SYNCING, MUTATION_STATUS.VALIDATION_ERROR, MUTATION_STATUS.CONFLICT]);
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
function recordFor(machine, field, entityType, payload, index) {
  const recordMachine = payload.machine || machine;
  const domainKey = makeDomainKey({ entityType, machine: recordMachine, recordId: payload.id, payload });
  const rowId = payload.id != null && payload.id !== "" ? `id:${payload.id}` : `row:${index}`;
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
  const unresolvedByDomain = new Map(pendingMutations
    .filter(mutation => UNRESOLVED_STATUSES.has(mutation.status) && (mutation.status !== MUTATION_STATUS.SYNCING || !mutation.leaseExpiresAt || Date.parse(mutation.leaseExpiresAt) > Date.now()))
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0))
    .map(mutation => [mutation.domainKey, mutation]));
  const terminalByDomain = new Map(pendingMutations
    .filter(mutation => mutation.status === MUTATION_STATUS.SYNCED || mutation.status === MUTATION_STATUS.RESOLVED)
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0))
    .map(mutation => [mutation.domainKey, mutation.status]));
  const unresolvedStatus = domainKey => unresolvedByDomain.get(domainKey) && unresolvedByDomain.get(domainKey).status;
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
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0))
    .map(mutation => [mutation.domainKey, mutation]));
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
  const pendingDelete = domainKey => {
    const mutation = unresolvedByDomain.get(domainKey);
    if (!mutation || mutation.operation !== "delete") return null;
    if (mutation.status !== MUTATION_STATUS.PENDING && mutation.status !== MUTATION_STATUS.SYNCING) return null;
    return mutation;
  };
  // A delete names one row, and a row the sheet returned without an id cannot be matched to it.
  // Reads the same way as `entityKeyForRecord`, which the snapshot key patch uses: an absent id on
  // either side matches nothing. (`requireMutationEnvelope` refuses a delete with no record id, so
  // only the row side is reachable — but the two halves of one rule answering differently is how
  // a record ends up on screen after a relaunch and gone after a refresh.)
  const matchesDeletedRow = (mutation, recordId) => (
    recordId != null && recordId !== "" && String(recordId) === String(mutation.recordId)
  );
  const deletePending = (domainKey, recordId) => {
    // A delete CONFIRMED after the request went out is in the same position as one still in flight:
    // the answer in hand was composed before it, so the row it removed is still in that answer. The
    // optimistic copy is gone by then — a confirmed delete has no row left to describe — so nothing
    // else in this merge would notice, and the deleted ring came back onto the screen and into the
    // stored snapshot, surviving the relaunch. On screen it is then counted by the data logs, the
    // dashboards and the shift report's derived ring count and distance, and the record form offers
    // the ring after it — a skipped ring number, which this domain does not allow.
    const confirmed = confirmedAfterRequest.get(domainKey);
    if (confirmed && confirmed.operation === "delete" && matchesDeletedRow(confirmed, recordId)) return true;
    const mutation = pendingDelete(domainKey);
    if (!mutation) return false;
    // A delete names the row it is deleting. If it names one and the incoming row carries no id,
    // they cannot be matched — and hiding it anyway takes a row off screen that nobody asked to
    // delete, on the refresh only, so it flickers away and comes back on the next relaunch.
    return matchesDeletedRow(mutation, recordId);
  };
  const terminalStatus = domainKey => terminalByDomain.get(domainKey);
  const preserveLocal = record => Boolean(unresolvedStatus(record.domainKey))
    || Boolean(confirmedAfterRequest.get(record.domainKey))
    || (!terminalStatus(record.domainKey) && UNRESOLVED_STATUSES.has(record.payload && record.payload.syncStatus));
  const localForDomain = (domainKey, entityType) => existing.find(record => record.domainKey === domainKey && record.entityType === entityType && record.key === optimisticEntityKey(domainKey)) || existing.find(record => record.domainKey === domainKey && record.entityType === entityType);
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
    const incoming = (data[field] || []).map((payload, index) => recordFor(machine, field, entityType, payload, index));
    const incomingDomains = new Set(incoming.map(record => record.domainKey));
    // one entry per retained domain: the optimistic row wins over a stale server copy of the same
    // domain, otherwise the record appears twice with two different values
    const retainedDomains = new Set(existing.filter(record => inScope(record, entityType) && preserveLocal(record))
      .filter(record => !incomingDomains.has(record.domainKey) && !deletePending(record.domainKey, record.payload && record.payload.id))
      .map(record => record.domainKey));
    const retained = [...retainedDomains].map(domainKey => localForDomain(domainKey, entityType)).filter(Boolean);
    // Overlay the optimistic record onto AT MOST ONE incoming row per domain. When the server
    // returns two rows sharing a ring identity (a live dedupe situation), replacing every one of
    // them with the same optimistic record both duplicated it and dropped the distinct second row.
    //
    // WHICH one matters just as much. The optimistic copy carries the id of the row it is about, so
    // it overlays that row. Only when no incoming row carries that id — a record created locally
    // over a ring the sheet already holds, where the two rows have different ids — does it fall back
    // to the domain's first row, which is what keeps one ring reading as one ring until the server
    // settles it. Without the id check, a queued edit or delete of one row was painted over its
    // neighbour: the crew's change appeared on a record they never touched.
    const incomingIdsByDomain = new Map();
    incoming.forEach(record => {
      const ids = incomingIdsByDomain.get(record.domainKey) || new Set();
      if (record.payload && record.payload.id != null) ids.add(String(record.payload.id));
      incomingIdsByDomain.set(record.domainKey, ids);
    });
    // A local copy speaks for the ROW it names, and for no other. It used to be allowed to take a
    // stranger's place when the response did not carry its own row, on the reasoning that one ring
    // should read as one ring until the server settled which record owned it. The server settles it
    // by REFUSING the second record — and until then, letting the local copy stand where a confirmed
    // row used to be deleted that row from the cache and put an unsynced, already-refused record in
    // its place, on screen, in the data logs and in every figure derived from them. Two rows on one
    // ring is a state this app supports and its logs dedupe for; a confirmed record disappearing
    // behind a refused one is not.
    const overlaysThisRow = (local, record) => {
      const localId = local.payload && local.payload.id;
      const rowId = record.payload && record.payload.id;
      if (localId == null) return true; // the local copy names no row, so it speaks for the domain
      return String(localId) === String(rowId);
    };
    // A local copy whose row this response does not carry keeps its own place in the list rather
    // than displacing a stranger: the sheet may not show it yet (a record made offline), or not any
    // more (another device removed it), and dropping it would take the crew's own unsynced work off
    // screen.
    const unmatchedById = new Map();
    existing.filter(record => inScope(record, entityType) && preserveLocal(record))
      .filter(record => incomingDomains.has(record.domainKey) && !retainedDomains.has(record.domainKey))
      .filter(record => {
        const localId = record.payload && record.payload.id;
        if (localId == null) return false;
        const ids = incomingIdsByDomain.get(record.domainKey);
        if (ids && ids.has(String(localId))) return false;
        const queued = unresolvedByDomain.get(record.domainKey);
        if (!queued) return false;
        // and it has to be the row that mutation is ABOUT. Two rows can share a ring, and the
        // entities store keeps a row after its key leaves a snapshot — so without this, a pending
        // edit of one row re-injected its long-deleted neighbour: back in the data log badged as the
        // crew's own queued work, counted by the dashboards and the shift report's ring total, and
        // last in the list, where the record form can adopt it as the open ring.
        if (String(localId) !== String(queued.recordId)) return false;
        return !deletePending(record.domainKey, localId);
      })
      // the store holds two rows for a record mid-edit — the server copy from the last refresh and
      // the optimistic one — and the crew's own copy is the one to keep
      .forEach(record => {
        const id = String(record.payload.id);
        const held = unmatchedById.get(id);
        if (!held || record.key === optimisticEntityKey(record.domainKey)) unmatchedById.set(id, record);
      });
    const unmatchedLocal = [...unmatchedById.values()];
    const overlaidDomains = new Set();
    const merged = incoming.filter(record => !deletePending(record.domainKey, record.payload && record.payload.id)).map(record => {
      const local = localForDomain(record.domainKey, entityType);
      if (local && preserveLocal(local) && !overlaidDomains.has(record.domainKey) && overlaysThisRow(local, record)) {
        overlaidDomains.add(record.domainKey);
        const status = unresolvedStatus(record.domainKey) || local.payload && local.payload.syncStatus;
        return preserve(local, status || local.payload.syncStatus);
      }
      return record;
    }).concat(retained.concat(unmatchedLocal).map(record => preserve(record, unresolvedStatus(record.domainKey) || record.payload.syncStatus)));
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
