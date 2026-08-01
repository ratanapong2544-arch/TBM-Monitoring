// entities whose key carries a machine; everything else is GLOBAL even when a caller passes a
// machine, because GAS always bumps the GLOBAL key for them and two version streams over one row
// would let a stale edit win. Mirrors SYNC_MACHINE_ENTITIES/SYNC_CONFIG_ENTITIES in gas-live/Code.js.
export const MACHINE_ENTITY_TYPES = new Set([
  "segment", "grout", "secondaryGrout", "shiftReport", "dailyReport", "prepTask",
  "planConfig", "distPlanConfig", "routeConfig",
]);

// A shift report loaded from the server carries `date` as a UTC ISO string, because GAS reads the
// sheet cell as a Date and serializes it. Reduce it to the Asia/Bangkok calendar date so an edit
// of a loaded record keys the same as the record itself. Thailand is a fixed UTC+7 with no DST.
// MUST stay identical to syncDateKey_ in gas-live/Code.js.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad2 = n => String(n).padStart(2, "0");

export function syncDateKey(value) {
  // A Date reduces by its own calendar fields, matching how GAS reads a sheet date cell under a
  // Bangkok script timezone. Unreachable on the client — `normalizeServerData` yields JSON strings,
  // never Dates — and it would be WRONG here if it were reachable, since a browser east of UTC+7
  // reads its own local fields. It exists so this function and `syncDateKey_` stay one function in
  // two files, which is what the shared vector file checks.
  if (value instanceof Date) return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  const text = String(value == null ? "" : value);
  if (!text.includes("T")) return text;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return text;
  return new Date(parsed + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function makeDomainKey({ entityType, machine, recordId, payload = {} }) {
  const source = payload || {};
  const machineKey = MACHINE_ENTITY_TYPES.has(entityType) ? (machine || "GLOBAL") : "GLOBAL";
  switch (entityType) {
    case "segment":
      return `segment:${machineKey}:${source.ringNo}:${source.installType || "Permanent"}`;
    case "grout":
      return `grout:${machineKey}:${source.ringNo}:${source.groutPass || "Primary"}`;
    case "secondaryGrout":
      return `secondaryGrout:${machineKey}:${source.ringNo}:${recordId}`;
    case "shiftReport":
      return `shiftReport:${machineKey}:${syncDateKey(source.date)}:${source.shift}`;
    case "planConfig":
    case "distPlanConfig":
    case "routeConfig":
      return `${entityType}:${machineKey}`;
    default:
      return `${entityType}:${machineKey}:${recordId}`;
  }
}
