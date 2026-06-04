// Daily-report domain logic + localStorage (localStorage-first; GAS sync = future phase)
export const STORAGE_KEY = "tbmDailyReports";
export const MACHINES = ["TBM1", "TBM2"];

export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function newItem() {
  return { id: makeId("it"), title: "", done: "", total: "", note: "" };
}

export function newDailyReport(machine = "TBM1") {
  return {
    id: "",
    date: new Date().toISOString().split("T")[0],
    machine,
    driveShaft: "",
    weather: "",
    items: [newItem()],
    problems: "",
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
  if (!r.machine || !MACHINES.includes(r.machine)) errors.machine = "กรุณาเลือกเครื่อง";
  const titled = (r.items || []).filter((it) => it.title && it.title.trim());
  if (titled.length === 0) errors.items = "กรอกอย่างน้อย 1 รายการงาน";
  return { valid: Object.keys(errors).length === 0, errors };
}

function normalizeItems(items) {
  return (items || [])
    .filter((it) => it.title && it.title.trim())
    .map((it) => ({
      id: it.id || makeId("it"),
      title: it.title.trim(),
      done: it.done === "" || it.done == null ? null : Number(it.done),
      total: it.total === "" || it.total == null ? null : Number(it.total),
      note: (it.note || "").trim(),
    }));
}

function normalize(r) {
  return {
    date: r.date || "",
    machine: r.machine,
    driveShaft: (r.driveShaft || "").trim(),
    weather: (r.weather || "").trim(),
    items: normalizeItems(r.items),
    problems: (r.problems || "").trim(),
  };
}

export function upsertDailyReport(list, report, now = new Date().toISOString()) {
  const base = normalize(report);
  if (report.id) {
    return list.map((r) => (r.id === report.id ? { ...r, ...base, updatedAt: now } : r));
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
