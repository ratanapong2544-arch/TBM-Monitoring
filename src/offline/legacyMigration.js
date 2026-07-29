import { makeDomainKey } from "./domainKey";
import { LEGACY_KEYS, STORES } from "./schema";

const LEGACY_TYPES = {
  tbmIssues: { entityType: "issue", serverKeys: ["issues", "tbmIssues"] },
  tbmDailyReports: { entityType: "dailyReport", serverKeys: ["dailyReports", "tbmDailyReports"] },
  tbmPrepTasks_TBM1: { entityType: "prepTask", machine: "TBM1", serverKeys: ["prepTasks", "tbmPrepTasks"] },
  tbmPrepTasks_TBM2: { entityType: "prepTask", machine: "TBM2", serverKeys: ["prepTasks", "tbmPrepTasks"] },
  tbmPlanConfig: { entityType: "planConfig", machine: "TBM1", serverKeys: ["planConfig", "planConfigs"] },
  tbmDistancePlanConfig: { entityType: "distPlanConfig", machine: "TBM1", serverKeys: ["distancePlanConfig", "distPlanConfig", "distancePlanConfigs"] },
  tbmDistancePlanConfig__TBM2: { entityType: "distPlanConfig", machine: "TBM2", serverKeys: ["distancePlanConfig", "distPlanConfig", "distancePlanConfigs"] },
  tbmRouteConfig: { entityType: "routeConfig", machine: "TBM1", serverKeys: ["routeConfig", "routeConfigs"] },
  tbmRouteConfig__TBM2: { entityType: "routeConfig", machine: "TBM2", serverKeys: ["routeConfig", "routeConfigs"] },
  instLocations: { entityType: "instrument", serverKeys: ["instLocations", "locations"] },
  instInstruments: { entityType: "instrument", serverKeys: ["instInstruments", "instruments"] },
  instThresholds: { entityType: "instrument", serverKeys: ["instThresholds", "thresholds"] },
  instReadings: { entityType: "instReading", serverKeys: ["instReadings", "readings"] },
  instSchedules: { entityType: "instSchedule", serverKeys: ["instSchedules", "schedules"] },
};

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function complete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function recordsFor(value) {
  return Array.isArray(value) ? value : [value];
}

function serverRecords(serverData, definition) {
  if (Array.isArray(serverData)) return serverData;
  return definition.serverKeys.flatMap(key => {
    const value = serverData && serverData[key];
    if (value == null) return [];
    if (definition.machine && value && !Array.isArray(value) && value[definition.machine] != null) return recordsFor(value[definition.machine]);
    return recordsFor(value);
  });
}

function keyFor(record, definition) {
  return record && record.id != null
    ? `id:${record.id}`
    : `domain:${makeDomainKey({ entityType: definition.entityType, machine: record && record.machine || definition.machine, recordId: record && record.id, payload: record })}`;
}

export async function stageLegacyLocalStorage(db, storage) {
  const transaction = db.transaction(STORES.syncMeta, "readwrite");
  const store = transaction.objectStore(STORES.syncMeta);
  LEGACY_KEYS.forEach(legacyKey => {
    const raw = storage.getItem(legacyKey);
    if (raw == null) return;
    const entry = { key: `legacy:${legacyKey}`, legacyStagedAt: new Date().toISOString() };
    try {
      entry.value = JSON.parse(raw);
    } catch (error) {
      entry.parseError = true;
      entry.raw = raw;
    }
    store.put(entry);
  });
  await complete(transaction);
}

export async function reconcileLegacyStage(db, serverData) {
  const readTransaction = db.transaction(STORES.syncMeta, "readonly");
  const stagedEntries = await requestResult(readTransaction.objectStore(STORES.syncMeta).getAll());
  await complete(readTransaction);
  const transaction = db.transaction([STORES.syncMeta, STORES.conflicts], "readwrite");
  const metaStore = transaction.objectStore(STORES.syncMeta);
  const conflictStore = transaction.objectStore(STORES.conflicts);

  stagedEntries.filter(entry => entry.key.startsWith("legacy:") && !entry.parseError).forEach(entry => {
    const legacyKey = entry.key.slice("legacy:".length);
    const definition = LEGACY_TYPES[legacyKey];
    if (!definition) return;
    const remote = serverRecords(serverData, definition);
    const remoteByKey = new Map(remote.map(record => [keyFor(record, definition), record]));
    let allConfirmed = true;
    recordsFor(entry.value).forEach(localRecord => {
      const domainKey = makeDomainKey({
        entityType: definition.entityType,
        machine: localRecord && localRecord.machine || definition.machine,
        recordId: localRecord && localRecord.id,
        payload: localRecord,
      });
      const remoteRecord = remoteByKey.get(keyFor(localRecord, definition));
      if (remoteRecord && stableJson(localRecord) === stableJson(remoteRecord)) return;
      allConfirmed = false;
      conflictStore.put({
        conflictId: `legacy:${legacyKey}:${domainKey}`,
        status: "open",
        reason: "legacy_local_difference",
        domainKey,
        legacyKey,
        local: localRecord,
        server: remoteRecord || null,
        createdAtLocal: new Date().toISOString(),
      });
    });
    metaStore.put({ ...entry, confirmed: allConfirmed, reconciledAt: new Date().toISOString() });
  });
  await complete(transaction);
}
