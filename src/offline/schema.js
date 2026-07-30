export const DB_NAME = "tbm-monitoring";
// 2: re-key records written under the earlier domain-key format (see recanonicalizeDomainKeys)
export const DB_VERSION = 2;

export const STORES = Object.freeze({
  entities: "entities",
  snapshots: "snapshots",
  mutations: "mutations",
  conflicts: "conflicts",
  syncMeta: "syncMeta",
  deviceMeta: "deviceMeta",
});

export const MUTATION_STATUS = Object.freeze({
  PENDING: "pending",
  SYNCING: "syncing",
  SYNCED: "synced",
  RESOLVED: "resolved",
  VALIDATION_ERROR: "validation_error",
  CONFLICT: "conflict",
  PERMANENT_ERROR: "permanent_error",
});

export const LEGACY_KEYS = [
  "tbmIssues", "tbmDailyReports", "tbmPrepTasks_TBM1", "tbmPrepTasks_TBM2",
  "tbmPlanConfig", "tbmDistancePlanConfig", "tbmDistancePlanConfig__TBM2",
  "tbmRouteConfig", "tbmRouteConfig__TBM2",
  "instLocations", "instInstruments", "instThresholds", "instReadings", "instSchedules"
];
