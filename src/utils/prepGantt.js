// Preparation Gantt tasks — per-machine localStorage + pure helpers. (localStorage-only; GAS = future)
const STORAGE_PREFIX = "tbmPrepTasks_";
const keyFor = (machine) => `${STORAGE_PREFIX}${machine}`;

export function makePrepId() {
  return `prep_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function loadPrepTasks(machine) {
  try {
    const raw = localStorage.getItem(keyFor(machine));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

export function savePrepTasks(machine, tasks) {
  try { localStorage.setItem(keyFor(machine), JSON.stringify(tasks)); } catch (e) { /* ignore quota */ }
}

function clampPct(v) {
  const n = Number(v);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizePrepTask(form) {
  const milestone = !!form.milestone;
  const start = form.start || "";
  const end = milestone ? start : (form.end || start);
  return {
    name: (form.name || "").trim(),
    start,
    end,
    percent: clampPct(form.percent),
    milestone,
  };
}

export function upsertPrepTask(tasks, form) {
  const base = normalizePrepTask(form);
  if (form.id) {
    return tasks.map((t) => (t.id === form.id ? { ...t, ...base, id: form.id } : t));
  }
  return [...tasks, { id: makePrepId(), ...base }];
}

export function removePrepTask(tasks, id) {
  return tasks.filter((t) => t.id !== id);
}

export function todayBKK() {
  const n = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

const _d = (s) => new Date(s + "T00:00:00");
const _diff = (a, b) => Math.round((_d(b) - _d(a)) / 86400000);

export function expectedPercent(task, todayStr) {
  if (!task || !task.start || !task.end) return 0;
  if (todayStr < task.start) return 0;
  if (todayStr >= task.end) return 100;
  const total = _diff(task.start, task.end);
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((_diff(task.start, todayStr) / total) * 100)));
}

export function taskStatus(task, todayStr) {
  const pct = Number(task.percent) || 0;
  if (pct >= 100) return "done";
  if (task.start && todayStr < task.start) return "notstarted";
  if (pct < expectedPercent(task, todayStr)) return "behind";
  return "ontrack";
}

export function ganttBounds(tasks) {
  const valid = (Array.isArray(tasks) ? tasks : []).filter((t) => t && t.start);
  if (valid.length === 0) return null;
  let min = valid[0].start, max = valid[0].start;
  for (const t of valid) {
    if (t.start < min) min = t.start;
    const e = t.end || t.start;
    if (e > max) max = e;
  }
  return { minDate: min, maxDate: max };
}

export function prepSummary(tasks, todayStr) {
  const list = Array.isArray(tasks) ? tasks : [];
  let done = 0, behind = 0;
  for (const t of list) {
    const s = taskStatus(t, todayStr);
    if (s === "done") done++;
    else if (s === "behind") behind++;
  }
  return { total: list.length, done, behind };
}
