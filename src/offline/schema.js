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
  // thrown away by the crew: never sent, never will be, and not the same fact as either
  DISCARDED: "discarded",
});

export const LEGACY_KEYS = [
  "tbmIssues", "tbmDailyReports", "tbmPrepTasks_TBM1", "tbmPrepTasks_TBM2",
  "tbmPlanConfig", "tbmDistancePlanConfig", "tbmDistancePlanConfig__TBM2",
  "tbmRouteConfig", "tbmRouteConfig__TBM2",
  "instLocations", "instInstruments", "instThresholds", "instReadings", "instSchedules"
];

// A mutation that has finished, in either direction — the complement of `UNRESOLVED_STATUSES`, and
// the two together cover every status. It lives in
// one place for the reason this does: the merge, the confirmed-after-request window, the prune and
// the queue's own ordering all ask it, and four inline copies of one rule can be changed one at a
// time with the suite green.
export function isTerminalStatus(status) {
  return status === MUTATION_STATUS.SYNCED || status === MUTATION_STATUS.RESOLVED;
}

// Finished with, whatever the ending was. `isTerminalStatus` means "the server answered", which is
// what the merge and the confirmed-after-request ordering ask about; this is what the RETENTION
// window asks about, and a discarded write belongs in it — never claimable, never counted, and
// otherwise the one row class that grows without bound on a phone that is never reinstalled.
// A write that will never be posted again, whatever put it in that state. Spelled out in six
// places before this — `getSyncCounts`, `getSyncCenterView`, `discardMutation`,
// `retryMutationAsSuccessor`, `repository.retryMutation` and `domainHeads` — and `domainHeads` was
// the copy that got missed: it asked `isTerminalStatus`, which DISCARDED is not, so a discarded head
// blocked its own record for ever.
export const stuckStatuses = Object.freeze(new Set([
  MUTATION_STATUS.CONFLICT, MUTATION_STATUS.VALIDATION_ERROR, MUTATION_STATUS.PERMANENT_ERROR,
]));

// Finished with: the queue will never touch it again, for any reason.
export function isFinishedStatus(status) {
  return isTerminalStatus(status) || status === MUTATION_STATUS.DISCARDED;
}

export const prunableStatuses = Object.freeze(new Set([
  MUTATION_STATUS.SYNCED, MUTATION_STATUS.RESOLVED, MUTATION_STATUS.DISCARDED,
]));
