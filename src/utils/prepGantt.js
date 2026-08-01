// Preparation Gantt tasks — pure helpers, plus the per-machine localStorage accessors that are now
// MIGRATION ONLY. No active React path calls `loadPrepTasks`/`savePrepTasks`: App holds the rows
// from the snapshot and hands `PrepGanttView` the slice for the machine on screen (Task 9 Step 5).
// They stay for `legacyMigration` staging and for reading a device that predates the change.
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

const DEP_TYPES = ["FS", "SS", "FF", "SF"];

export function normalizeDeps(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d) => d && d.id)
    .map((d) => ({
      id: String(d.id),
      type: DEP_TYPES.includes(d.type) ? d.type : "FS",
      lag: Number.isFinite(Number(d.lag)) ? Math.round(Number(d.lag)) : 0,
    }));
}

export function normalizePlog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && e.d)
    .map((e) => ({ d: String(e.d), p: clampPct(e.p) }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

// append ประวัติ % — วันซ้ำแทนที่ (เก็บค่าสุดท้ายของวัน), เรียงวัน, cap 200 ตัวล่าสุด
export function appendPlog(plog, d, p) {
  const log = (Array.isArray(plog) ? plog : []).filter((e) => e && e.d && e.d !== d);
  log.push({ d, p: clampPct(p) });
  log.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return log.slice(-200);
}

export function normalizePrepTask(form) {
  const milestone = !!form.milestone;
  const start = form.start || "";
  const end = milestone ? start : (form.end || start);
  const out = {
    name: (form.name || "").trim(),
    start,
    end,
    percent: clampPct(form.percent),
    milestone,
    deps: normalizeDeps(form.deps),
  };
  if (form.baseStart) out.baseStart = form.baseStart;
  if (form.baseEnd) out.baseEnd = form.baseEnd;
  out.parentId = form.parentId ? String(form.parentId) : undefined;
  if (form.plog) out.plog = normalizePlog(form.plog);
  return out;
}

export function upsertPrepTask(tasks, form, todayStr) {
  const base = normalizePrepTask(form);
  if (form.id) {
    return tasks.map((t) => {
      if (t.id !== form.id) return t;
      const next = { ...t, ...base, id: form.id };
      if (todayStr && next.percent !== t.percent) next.plog = appendPlog(t.plog, todayStr, next.percent);
      return next;
    });
  }
  const fresh = { id: makePrepId(), ...base };
  if (todayStr && fresh.percent > 0) fresh.plog = appendPlog([], todayStr, fresh.percent);
  return [...tasks, fresh];
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

// ---- Gantt axis helpers (MS-Project look) — pure, ใช้โดย PrepGanttView ----
export const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const _iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function addDays(dateStr, n) {
  const d = _d(dateStr);
  d.setDate(d.getDate() + n);
  return _iso(d);
}

export function computePxPerDay(availWidth, totalDays) {
  const w = Number(availWidth), days = Number(totalDays);
  if (!isFinite(w) || !isFinite(days) || w <= 0 || days <= 0) return 8;
  return Math.max(8, Math.min(36, Math.floor(w / days)));
}

export function ganttTicks(startStr, endStr, pxPerDay) {
  const months = [], days = [], weekLines = [], weekendBands = [];
  const total = _diff(startStr, endStr);
  const step = pxPerDay >= 22 ? 1 : pxPerDay >= 11 ? 2 : 5;
  let bandStart = null;
  for (let i = 0; i <= total; i++) {
    const cur = _d(startStr);
    cur.setDate(cur.getDate() + i);
    const x = i * pxPerDay;
    const dow = cur.getDay(); // 0=อา. … 6=ส.
    const dayNum = cur.getDate();
    if (i === 0 || dayNum === 1) {
      months.push({ iso: _iso(cur), x, label: `${TH_MONTHS[cur.getMonth()]} ${String(cur.getFullYear() + 543).slice(-2)}` });
    }
    if ((dayNum - 1) % step === 0) days.push({ iso: _iso(cur), x, label: String(dayNum) });
    if (dow === 1 && i > 0) weekLines.push(x);
    if (dow === 6 || dow === 0) {
      if (bandStart === null) bandStart = x;
    } else if (bandStart !== null) {
      weekendBands.push({ x: bandStart, width: x - bandStart });
      bandStart = null;
    }
  }
  if (bandStart !== null) weekendBands.push({ x: bandStart, width: (total + 1) * pxPerDay - bandStart });
  // span = ความกว้าง (px) ของช่วงเดือนบนแกน — view ใช้ซ่อน label เดือนหัว/ท้ายที่โดนตัดจนแคบ (กัน label ซ้อนกัน)
  months.forEach((m, i) => {
    m.span = (i + 1 < months.length ? months[i + 1].x : (total + 1) * pxPerDay) - m.x;
  });
  return { months, days, weekLines, weekendBands };
}
