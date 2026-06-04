// Daily-report domain logic + localStorage (localStorage-first; PDF gen = SP2/SP3)
import { EQUIPMENT, LABOR, WEATHER_SLOTS } from "./dailyReportSchema";

export const STORAGE_KEY = "tbmDailyReports";
export const MACHINES = ["TBM1", "TBM2"];

export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function newItem() {
  return { id: makeId("it"), title: "", done: "", total: "", note: "" };
}

function emptyCounts(catalog) {
  const o = {};
  catalog.forEach((c) => { o[c.key] = ""; });
  return o;
}
function emptyWeather() {
  const o = {};
  WEATHER_SLOTS.forEach((s) => { o[s] = null; });
  return o;
}

export function newDailyReport(machine = "TBM1") {
  return {
    id: "",
    date: new Date().toISOString().split("T")[0],
    area: "",
    machine,
    weather: emptyWeather(),
    equipment: emptyCounts(EQUIPMENT),
    labor: emptyCounts(LABOR),
    workLog: [newItem()],
    problems: "",
    solutions: "",
    sign: { recorderName: "", recorderPos: "", checkerName: "", checkerPos: "" },
  };
}

export function itemPercent(item) {
  const d = Number(item.done);
  const t = Number(item.total);
  if (!t || t <= 0 || isNaN(d) || isNaN(t)) return null;
  return Math.max(0, Math.min(100, Math.round((d / t) * 100)));
}

export function validateReport(r) {
  const errors = {};
  if (!r.date) errors.date = "กรุณาเลือกวันที่";
  if (!r.area || !r.area.trim()) errors.area = "กรุณากรอกพื้นที่ทำงาน";
  return { valid: Object.keys(errors).length === 0, errors };
}

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function normalizeCounts(catalog, src) {
  const o = {};
  catalog.forEach((c) => { o[c.key] = numOrNull(src ? src[c.key] : null); });
  return o;
}
function normalizeWeather(src) {
  const o = {};
  WEATHER_SLOTS.forEach((s) => {
    const v = src && typeof src === "object" ? src[s] : null;
    o[s] = v === "clear" || v === "light" || v === "heavy" ? v : null;
  });
  return o;
}
function normalizeWorkLog(src) {
  return (Array.isArray(src) ? src : [])
    .filter((it) => it.title && it.title.trim())
    .map((it) => ({
      id: it.id || makeId("it"),
      title: it.title.trim(),
      done: numOrNull(it.done),
      total: numOrNull(it.total),
      note: (it.note || "").trim(),
    }));
}

export function normalizeReport(r) {
  r = r && typeof r === "object" ? r : {};
  const sign = r.sign || {};
  return {
    date: r.date || "",
    area: (r.area || r.driveShaft || "").trim(),
    machine: MACHINES.includes(r.machine) ? r.machine : "",
    weather: normalizeWeather(r.weather),
    equipment: normalizeCounts(EQUIPMENT, r.equipment),
    labor: normalizeCounts(LABOR, r.labor),
    workLog: normalizeWorkLog(r.workLog || r.items),
    problems: (r.problems || "").trim(),
    solutions: (r.solutions || "").trim(),
    sign: {
      recorderName: (sign.recorderName || "").trim(),
      recorderPos: (sign.recorderPos || "").trim(),
      checkerName: (sign.checkerName || "").trim(),
      checkerPos: (sign.checkerPos || "").trim(),
    },
  };
}

export function normalize(list) {
  return (Array.isArray(list) ? list : []).map((r) => ({
    ...normalizeReport(r),
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

function countsToForm(counts) {
  const o = {};
  Object.keys(counts || {}).forEach((k) => { o[k] = counts[k] == null ? "" : String(counts[k]); });
  return o;
}

export function prefillFromLatest(list, { machine = "TBM1" } = {}) {
  const norm = normalize(list);
  const pool = machine ? norm.filter((r) => r.machine === machine) : norm;
  const latest = pool.slice().sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")) ||
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  )[0];
  const base = newDailyReport(latest ? latest.machine || machine : machine);
  if (!latest) return base;
  return {
    ...base,
    area: latest.area || "",
    equipment: { ...base.equipment, ...countsToForm(latest.equipment) },
    labor: { ...base.labor, ...countsToForm(latest.labor) },
    sign: { ...base.sign, ...(latest.sign || {}) },
  };
}

export function upsertDailyReport(list, report, now = new Date().toISOString()) {
  const base = normalizeReport(report);
  if (report.id) {
    return list.map((r) => (r.id === report.id ? { ...r, ...base, id: report.id, updatedAt: now } : r));
  }
  return [{ id: makeId("dr"), ...base, createdAt: now, updatedAt: now }, ...list];
}

export function removeDailyReport(list, id) {
  return list.filter((r) => r.id !== id);
}

export function sortReports(list, machineFilter = "All") {
  return list
    .filter((r) => machineFilter === "All" || r.machine === machineFilter)
    .slice()
    .sort((a, b) => {
      const d = String(b.date || "").localeCompare(String(a.date || ""));
      return d !== 0 ? d : String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
}

export function loadDailyReports() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function persistDailyReports(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    /* ignore quota / serialization errors */
  }
}
