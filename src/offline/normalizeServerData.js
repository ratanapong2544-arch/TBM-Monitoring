import { formatDisplayTime } from "../utils/formatters";

const defaultManpower = { Engineer: "", Operator: "", Surveyor: "", Machanic: "", Electrician: "", Foreman: "", Worker: "", CraneOp: "" };
const defaultResult = { startSta: "", finishSta: "", numberRing: "", totalDistance: "", progressRate: "" };
const segmentTimes = ["excavStartTime", "excavEndTime", "installStartTime", "installEndTime", "startTime", "endTime"];

function safeParseJSON(value, fallback) { if (value && typeof value === "object") return value; if (!value || typeof value !== "string") return fallback; try { return JSON.parse(value); } catch (error) { return fallback; } }
function parsePositions(value) {
  if (value && typeof value === "object") return value;
  if (!value || typeof value !== "string") return {};
  try { return JSON.parse(value); } catch (error) {
    return value.replace(/[{}]/g, "").split(",").reduce((positions, pair) => { const parts = pair.split("=").length === 2 ? pair.split("=") : pair.split(":"); if (parts.length === 2) positions[parts[0].trim().replace(/[\"']/g, "")] = parts[1].trim().replace(/[\"']/g, "").toLowerCase() === "true"; return positions; }, {});
  }
}
function parseConfig(value) { if (typeof value !== "string") return value == null ? null : value; try { return JSON.parse(value); } catch (error) { return value; } }

export function emptyServerData(machine) {
  return { machine, segments: [], grouts: [], secondaryGrouts: [], shiftReports: [], issues: [], dailyReports: [], prepTasks: [], planConfig: null, distPlanConfig: null, routeConfigs: {}, routeProjectTotal: null, machineProgress: null, instLocations: [], instInstruments: [], instThresholds: [], instReadings: [], instSchedules: [], syncMeta: {} };
}

export function normalizeServerData(result = {}, machine) {
  const normalized = emptyServerData(machine);
  normalized.segments = (result.segments || []).map(segment => segmentTimes.reduce((record, key) => ({ ...record, [key]: formatDisplayTime(segment[key]) }), { ...segment }));
  normalized.grouts = (result.grouts || []).map(grout => {
    const partA = grout.partA !== undefined && grout.partA !== "" ? grout.partA : String((Number(grout.primaryPartA || 0) + Number(grout.secondaryPartA || 0)).toFixed(2));
    const partB = grout.partB !== undefined && grout.partB !== "" ? grout.partB : String((Number(grout.primaryPartB || 0) + Number(grout.secondaryPartB || 0)).toFixed(2));
    return { ...grout, positions: parsePositions(grout.positions), primaryPositions: parsePositions(grout.primaryPositions), secondaryPositions: parsePositions(grout.secondaryPositions), primaryPartA: grout.primaryPartA || "", primaryPartB: grout.primaryPartB || "", secondaryPartA: grout.secondaryPartA || "", secondaryPartB: grout.secondaryPartB || "", partA, partB, total: Number(grout.total || 0), ratio: Number(grout.ratio || 0) };
  });
  normalized.secondaryGrouts = (result.secondaryGrouts || []).map(grout => ({ ...grout, positions: parsePositions(grout.positions), total: Number(grout.total || 0) }));
  normalized.shiftReports = (result.shiftReports || []).map(report => ({ ...report, events: safeParseJSON(report.events, {}), manpower: safeParseJSON(report.manpower, defaultManpower), result: safeParseJSON(report.result, defaultResult) }));
  ["issues", "dailyReports", "prepTasks", "instLocations", "instInstruments", "instThresholds", "instReadings", "instSchedules"].forEach(key => { normalized[key] = Array.isArray(result[key]) ? result[key] : []; });
  normalized.planConfig = parseConfig(result.planConfig); normalized.distPlanConfig = parseConfig(result.distPlanConfig);
  normalized.routeConfigs = result.routeConfigs && typeof result.routeConfigs === "object" ? result.routeConfigs : {};
  normalized.routeProjectTotal = typeof result.routeProjectTotal === "number" ? result.routeProjectTotal : null;
  normalized.machineProgress = result.machineProgress || null;
  normalized.syncMeta = result.syncMeta && typeof result.syncMeta === "object" ? result.syncMeta : {};
  return normalized;
}
