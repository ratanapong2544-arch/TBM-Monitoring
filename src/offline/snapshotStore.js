import { makeDomainKey } from "./domainKey";
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
// the lists from `entityKeys` alone, so a record created offline was invisible after a relaunch and
// a record deleted offline came back. A relaunch with no link is the ordinary case here — an eight
// hour shift on a phone in a tunnel — so both were routine data loss, not edge cases. The key
// formats and the field mapping are owned by this file; the queue borrows them rather than
// re-deriving them, because two spellings of one key is the same bug wearing a different hat.
export const snapshotScopeKey = scopeKey;
export const FIELD_FOR_ENTITY_TYPE = new Map(collections.map(([field, entityType]) => [entityType, field]));
export function isMachineScopedEntityType(entityType) { return MACHINE_SCOPED_COLLECTIONS.has(entityType); }
export function optimisticEntityKey(domainKey) { return `entity:optimistic:${domainKey}`; }
// server rows are keyed `entity:<machine>:<field>:<domainKey>:<rowId>`, so the surrounding colons
// keep one ring's key from matching another whose domain key is a prefix of it (P64 vs P643)
export function entityKeyBelongsToDomain(key, domainKey) {
  return key === optimisticEntityKey(domainKey) || String(key).includes(`:${domainKey}:`);
}
// The store key must be unique per server ROW, not per domain: live sheets legitimately hold two
// rows sharing a ring identity (the views run deduplicateRecords over them), and keying by domain
// alone made one row overwrite the other in the cache and appear twice in the list.
function recordFor(machine, field, entityType, payload, index) {
  const recordMachine = payload.machine || machine;
  const domainKey = makeDomainKey({ entityType, machine: recordMachine, recordId: payload.id, payload });
  const rowId = payload.id != null && payload.id !== "" ? `id:${payload.id}` : `row:${index}`;
  return { key: `entity:${machine}:${field}:${domainKey}:${rowId}`, machine, entityType, domainKey, payload };
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

export async function writeServerSnapshot(db, machine, data, fetchedAt) {
  const transaction = db.transaction([STORES.entities, STORES.snapshots, STORES.mutations], "readwrite");
  const entities = transaction.objectStore(STORES.entities);
  const snapshots = transaction.objectStore(STORES.snapshots);
  const mutations = transaction.objectStore(STORES.mutations);
  const previous = await requestResult(snapshots.get(scopeKey(machine)));
  const [existing, pendingMutations] = await Promise.all([requestResult(entities.getAll()), requestResult(mutations.getAll())]);
  const unresolvedByDomain = new Map(pendingMutations
    .filter(mutation => UNRESOLVED_STATUSES.has(mutation.status) && (mutation.status !== MUTATION_STATUS.SYNCING || !mutation.leaseExpiresAt || Date.parse(mutation.leaseExpiresAt) > Date.now()))
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0))
    .map(mutation => [mutation.domainKey, mutation]));
  const terminalByDomain = new Map(pendingMutations
    .filter(mutation => mutation.status === MUTATION_STATUS.SYNCED || mutation.status === MUTATION_STATUS.RESOLVED)
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0))
    .map(mutation => [mutation.domainKey, mutation.status]));
  const unresolvedStatus = domainKey => unresolvedByDomain.get(domainKey) && unresolvedByDomain.get(domainKey).status;
  // a delete still in the queue is a tombstone: the server has not seen it yet, so it keeps
  // returning the row, and overlaying the optimistic copy would put the deleted ring back on screen
  // at the next refresh. Hide it until the mutation leaves the queue one way or the other.
  const deletePending = domainKey => {
    const mutation = unresolvedByDomain.get(domainKey);
    return Boolean(mutation && mutation.operation === "delete");
  };
  const terminalStatus = domainKey => terminalByDomain.get(domainKey);
  const preserveLocal = record => Boolean(unresolvedStatus(record.domainKey)) || (!terminalStatus(record.domainKey) && UNRESOLVED_STATUSES.has(record.payload && record.payload.syncStatus));
  const localForDomain = (domainKey, entityType) => existing.find(record => record.domainKey === domainKey && record.entityType === entityType && record.key === `entity:optimistic:${domainKey}`) || existing.find(record => record.domainKey === domainKey && record.entityType === entityType);
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
      .filter(record => !incomingDomains.has(record.domainKey) && !deletePending(record.domainKey))
      .map(record => record.domainKey));
    const retained = [...retainedDomains].map(domainKey => localForDomain(domainKey, entityType)).filter(Boolean);
    // Overlay the optimistic record onto AT MOST ONE incoming row per domain. When the server
    // returns two rows sharing a ring identity (a live dedupe situation), replacing every one of
    // them with the same optimistic record both duplicated it and dropped the distinct second row.
    const overlaidDomains = new Set();
    const merged = incoming.filter(record => !deletePending(record.domainKey)).map(record => {
      const local = localForDomain(record.domainKey, entityType);
      if (local && preserveLocal(local) && !overlaidDomains.has(record.domainKey)) {
        overlaidDomains.add(record.domainKey);
        const status = unresolvedStatus(record.domainKey) || local.payload && local.payload.syncStatus;
        return preserve(local, status || local.payload.syncStatus);
      }
      return record;
    }).concat(retained.map(record => preserve(record, unresolvedStatus(record.domainKey) || record.payload.syncStatus)));
    entityKeys[field] = merged.map(record => record.key);
    committed[field] = merged.map(record => record.payload);
    merged.forEach(record => entities.put(record));
  });

  const snapshot = { scopeKey: scopeKey(machine), machine, fetchedAt, entityKeys };
  singletonKeys.forEach(key => { snapshot[key] = data[key]; committed[key] = data[key]; });
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
