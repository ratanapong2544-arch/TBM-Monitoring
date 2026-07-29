import { makeDomainKey } from "./domainKey";
import { emptyServerData } from "./normalizeServerData";
import { MUTATION_STATUS, STORES } from "./schema";

const collections = [
  ["segments", "segment"], ["grouts", "grout"], ["secondaryGrouts", "secondaryGrout"], ["shiftReports", "shiftReport"],
  ["issues", "issue"], ["dailyReports", "dailyReport"], ["prepTasks", "prepTask"], ["instLocations", "instLocation"],
  ["instInstruments", "instInstrument"], ["instThresholds", "instThreshold"], ["instReadings", "instReading"], ["instSchedules", "instSchedule"],
];
const singletonKeys = ["planConfig", "distPlanConfig", "routeConfigs", "routeProjectTotal", "machineProgress", "syncMeta"];
const UNRESOLVED_STATUSES = new Set([MUTATION_STATUS.PENDING, MUTATION_STATUS.SYNCING, MUTATION_STATUS.VALIDATION_ERROR, MUTATION_STATUS.CONFLICT]);

function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function complete(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }
function scopeKey(machine) { return `getData:${machine}`; }
function recordFor(machine, field, entityType, payload) {
  const recordMachine = payload.machine || machine;
  const domainKey = makeDomainKey({ entityType, machine: recordMachine, recordId: payload.id, payload });
  return { key: `entity:${machine}:${field}:${domainKey}`, machine, entityType, domainKey, payload };
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
  const terminalStatus = domainKey => terminalByDomain.get(domainKey);
  const preserveLocal = record => Boolean(unresolvedStatus(record.domainKey)) || (!terminalStatus(record.domainKey) && UNRESOLVED_STATUSES.has(record.payload && record.payload.syncStatus));
  const localForDomain = (domainKey, entityType) => existing.find(record => record.domainKey === domainKey && record.entityType === entityType && record.key === `entity:optimistic:${domainKey}`) || existing.find(record => record.domainKey === domainKey && record.entityType === entityType);
  const preserve = (record, status) => ({ ...record, payload: { ...record.payload, syncStatus: status } });
  const previousKeys = Object.values(previous && previous.entityKeys || {}).flat();
  previousKeys.forEach(key => entities.delete(key));
  const entityKeys = {};
  const committed = emptyServerData(machine);

  collections.forEach(([field, entityType]) => {
    const incoming = (data[field] || []).map(payload => recordFor(machine, field, entityType, payload));
    const incomingDomains = new Set(incoming.map(record => record.domainKey));
    const retained = existing.filter(record => record.machine === machine && record.entityType === entityType && preserveLocal(record))
      .filter(record => !incomingDomains.has(record.domainKey));
    const merged = incoming.map(record => {
      const local = localForDomain(record.domainKey, entityType);
      const status = unresolvedStatus(record.domainKey) || local && local.payload && local.payload.syncStatus;
      if (local && preserveLocal(local)) return preserve(local, status || local.payload.syncStatus);
      return record;
    }).concat(retained.map(record => preserve(record, unresolvedStatus(record.domainKey) || record.payload.syncStatus)));
    entityKeys[field] = merged.map(record => record.key);
    committed[field] = merged.map(record => record.payload);
    merged.forEach(record => entities.put(record));
  });

  const snapshot = { scopeKey: scopeKey(machine), machine, fetchedAt, entityKeys };
  singletonKeys.forEach(key => { snapshot[key] = data[key]; committed[key] = data[key]; });
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
