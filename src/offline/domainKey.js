const GLOBAL_ENTITY_TYPES = new Set(["issue", "dailyReport", "prepTask", "instrument", "instReading", "instSchedule"]);

export function makeDomainKey({ entityType, machine, recordId, payload = {} }) {
  const source = payload || {};
  const machineKey = machine || "GLOBAL";
  switch (entityType) {
    case "segment":
      return `segment:${machineKey}:${source.ringNo}:${source.installType || "Permanent"}`;
    case "grout":
      return `grout:${machineKey}:${source.ringNo}:${source.groutPass || "Primary"}`;
    case "secondaryGrout":
      return `secondaryGrout:${machineKey}:${source.ringNo}:${recordId}`;
    case "shiftReport":
      return `shiftReport:${machineKey}:${source.date}:${source.shift}`;
    case "planConfig":
    case "distPlanConfig":
    case "routeConfig":
      return `${entityType}:${machineKey}`;
    default:
      if (GLOBAL_ENTITY_TYPES.has(entityType)) return `${entityType}:${machineKey}:${recordId}`;
      return `${entityType}:${machineKey}:${recordId}`;
  }
}
