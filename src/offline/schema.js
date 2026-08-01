export const DB_NAME = "tbm-monitoring";
// 2: re-key records written under the earlier domain-key format (see recanonicalizeDomainKeys)
// 3: the optimistic entity key gained the record id. Two records sharing a domain — two rows for
// one ring, which the sheet allows — shared one optimistic row before that, so the second queued
// write overwrote the first.
export const DB_VERSION = 3;

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

// A mutation that has finished, in either direction. Its complement `UNRESOLVED_STATUSES` lives in
// one place for the reason this does: the merge, the confirmed-after-request window, the prune and
// the queue's own ordering all ask it, and four inline copies of one rule can be changed one at a
// time with the suite green.
export function isTerminalStatus(status) {
  return status === MUTATION_STATUS.SYNCED || status === MUTATION_STATUS.RESOLVED;
}
