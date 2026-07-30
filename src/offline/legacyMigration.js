import { makeDomainKey } from "./domainKey";
import { LEGACY_KEYS, STORES } from "./schema";

const LEGACY_TYPES = {
  tbmIssues: { entityType: "issue", serverKeys: ["issues", "tbmIssues"] },
  // machine fallback mirrors the GAS legacy default (data.machine || 'TBM1') so a staged record
  // without machine keys the same on both sides
  tbmDailyReports: { entityType: "dailyReport", machine: "TBM1", serverKeys: ["dailyReports", "tbmDailyReports"] },
  tbmPrepTasks_TBM1: { entityType: "prepTask", machine: "TBM1", serverKeys: ["prepTasks", "tbmPrepTasks"] },
  tbmPrepTasks_TBM2: { entityType: "prepTask", machine: "TBM2", serverKeys: ["prepTasks", "tbmPrepTasks"] },
  tbmPlanConfig: { entityType: "planConfig", machine: "TBM1", serverKeys: ["planConfig", "planConfigs"] },
  tbmDistancePlanConfig: { entityType: "distPlanConfig", machine: "TBM1", serverKeys: ["distancePlanConfig", "distPlanConfig", "distancePlanConfigs"] },
  tbmDistancePlanConfig__TBM2: { entityType: "distPlanConfig", machine: "TBM2", serverKeys: ["distancePlanConfig", "distPlanConfig", "distancePlanConfigs"] },
  tbmRouteConfig: { entityType: "routeConfig", machine: "TBM1", serverKeys: ["routeConfig", "routeConfigs"] },
  tbmRouteConfig__TBM2: { entityType: "routeConfig", machine: "TBM2", serverKeys: ["routeConfig", "routeConfigs"] },
  // instLocation/instThreshold have no sync entity, so they keep their own key namespace rather
  // than borrowing "instrument" — a conflict resolved through a borrowed key would write a
  // location or threshold payload into the instrument sheet
  instLocations: { entityType: "instLocation", serverKeys: ["instLocations", "locations"] },
  instInstruments: { entityType: "instrument", serverKeys: ["instInstruments", "instruments"] },
  instThresholds: { entityType: "instThreshold", serverKeys: ["instThresholds", "thresholds"] },
  instReadings: { entityType: "instReading", serverKeys: ["instReadings", "readings"] },
  instSchedules: { entityType: "instSchedule", serverKeys: ["instSchedules", "schedules"] },
};

const CONFIG_ENTITY_TYPES = new Set(["planConfig", "distPlanConfig", "routeConfig"]);

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

function parseConfigValue(value, definition) {
  if (!CONFIG_ENTITY_TYPES.has(definition.entityType) || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function serverRecords(serverData, definition) {
  if (Array.isArray(serverData)) return serverData;
  return definition.serverKeys.flatMap(key => {
    const value = parseConfigValue(serverData && serverData[key], definition);
    if (value == null) return [];
    if (definition.machine && value && !Array.isArray(value) && value[definition.machine] != null) {
      return recordsFor(parseConfigValue(value[definition.machine], definition));
    }
    return recordsFor(value);
  });
}

function keyFor(record, definition) {
  if (CONFIG_ENTITY_TYPES.has(definition.entityType)) {
    return `domain:${makeDomainKey({ entityType: definition.entityType, machine: record && record.machine || definition.machine, recordId: record && record.id, payload: record })}`;
  }
  return record && record.id != null
    ? `id:${record.id}`
    : `domain:${makeDomainKey({ entityType: definition.entityType, machine: record && record.machine || definition.machine, recordId: record && record.id, payload: record })}`;
}

function comparableRecord(record, definition) {
  if (!CONFIG_ENTITY_TYPES.has(definition.entityType) || !record || typeof record !== "object" || Array.isArray(record)) return record;
  const { id, ...config } = record;
  return config;
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
      if (remoteRecord && stableJson(comparableRecord(localRecord, definition)) === stableJson(comparableRecord(remoteRecord, definition))) return;
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
