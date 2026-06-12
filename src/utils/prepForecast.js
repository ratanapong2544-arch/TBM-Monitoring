// Forecast engine (CPM) สำหรับ Prep Gantt — pure functions ทั้งไฟล์ (jest ตรงๆ ไม่ต้อง mock)
import { addDays } from "./prepGantt";

const _d = (s) => new Date(s + "T00:00:00");
export const dayDiff = (a, b) => Math.round((_d(b) - _d(a)) / 86400000);

const MODE_KEY = "tbmPrepForecastMode";

export function loadForecastMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "rate" ? "rate" : "remaining";
  } catch (e) { return "remaining"; }
}

export function saveForecastMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode === "rate" ? "rate" : "remaining"); } catch (e) { /* ignore quota */ }
}

// ---- forecast หลัก ----
// คืน { byId: {id: {fcStart, fcEnd, slipDays, totalFloat, isCritical}}, project, cycleIds }
export function computeForecast(tasks, todayStr, mode = "remaining") {
  const list = (Array.isArray(tasks) ? tasks : []).filter((t) => t && t.id && t.start);
  const byIdTask = new Map(list.map((t) => [t.id, t]));
  const validDeps = (t) =>
    (Array.isArray(t.deps) ? t.deps : []).filter((d) => d && byIdTask.has(d.id) && d.id !== t.id);

  // --- topological sort (Kahn) ---
  const indeg = new Map(list.map((t) => [t.id, validDeps(t).length]));
  const succs = new Map(list.map((t) => [t.id, []])); // pred id → [succ task]
  list.forEach((t) => validDeps(t).forEach((d) => succs.get(d.id).push(t)));
  const queue = list.filter((t) => indeg.get(t.id) === 0);
  const order = [];
  while (queue.length) {
    const t = queue.shift();
    order.push(t);
    succs.get(t.id).forEach((s) => {
      indeg.set(s.id, indeg.get(s.id) - 1);
      if (indeg.get(s.id) === 0) queue.push(s);
    });
  }
  const placed = new Set(order.map((t) => t.id));
  const cycleIds = list.filter((t) => !placed.has(t.id)).map((t) => t.id);
  const inCycle = new Set(cycleIds);
  cycleIds.forEach((id) => order.push(byIdTask.get(id))); // งานในวงจรคำนวณแบบไม่มี dep

  // --- forward pass ---
  const fc = {};
  for (const t of order) {
    const planEnd = t.end || t.start;
    const dur = Math.max(1, dayDiff(t.start, planEnd) + 1);
    const pct = Number(t.percent) || 0;
    let fcStart, fcEnd;
    if (pct >= 100) {
      fcStart = t.start;
      fcEnd = planEnd;
    } else if (pct > 0) {
      // เริ่มจริงแล้ว — dep ไม่ดัน
      fcStart = t.start;
      let remDays;
      if (mode === "rate") {
        const elapsed = Math.max(1, dayDiff(t.start, todayStr) + 1);
        remDays = Math.ceil((100 - pct) / (pct / elapsed));
      } else {
        remDays = Math.ceil(((100 - pct) / 100) * dur);
      }
      fcEnd = addDays(todayStr, remDays);
    } else {
      let s = t.start;
      if (todayStr > s) s = todayStr; // ควรเริ่มแล้วแต่ยังไม่เริ่ม → ดันเป็นวันนี้
      if (!inCycle.has(t.id)) {
        for (const d of validDeps(t)) {
          const p = fc[d.id];
          if (!p) continue;
          let cand;
          if (d.type === "SS") cand = addDays(p.fcStart, d.lag);
          else if (d.type === "FF") cand = addDays(addDays(p.fcEnd, d.lag), -(dur - 1));
          else if (d.type === "SF") cand = addDays(addDays(p.fcStart, d.lag), -(dur - 1));
          else cand = addDays(p.fcEnd, 1 + d.lag); // FS
          if (cand > s) s = cand;
        }
      }
      fcStart = s;
      fcEnd = addDays(s, dur - 1);
    }
    if (fcEnd < fcStart) fcEnd = fcStart; // guard
    fc[t.id] = { fcStart, fcEnd };
  }

  // --- project summary ---
  let projFcEnd = null, projBaseEnd = null;
  list.forEach((t) => {
    const e = fc[t.id].fcEnd;
    if (!projFcEnd || e > projFcEnd) projFcEnd = e;
    const b = t.baseEnd || t.end || t.start;
    if (!projBaseEnd || b > projBaseEnd) projBaseEnd = b;
  });

  // --- backward pass (CPM) ---
  // กลับทิศ link (เอาค่า min เมื่อมีหลาย successor):
  //   FS: lateFinish ≤ succ.lateStart − 1 − lag   · SS: lateStart ≤ succ.lateStart − lag
  //   FF: lateFinish ≤ succ.lateFinish − lag      · SF: lateStart ≤ succ.lateFinish − lag
  // ข้อจำกัดฝั่ง start แปลงเป็น finish-equivalent ด้วย fdur − 1
  const late = {};
  for (let i = order.length - 1; i >= 0; i--) {
    const t = order[i];
    const fdur = dayDiff(fc[t.id].fcStart, fc[t.id].fcEnd) + 1;
    let lf = projFcEnd;
    for (const s of succs.get(t.id) || []) {
      if (inCycle.has(s.id) || inCycle.has(t.id) || !late[s.id]) continue;
      // successor ที่เริ่มแล้ว/เสร็จแล้วไม่สร้างข้อจำกัดย้อนกลับ (forward ก็ไม่ดันมัน)
      if ((Number(s.percent) || 0) > 0) continue;
      const d = validDeps(s).find((x) => x.id === t.id);
      if (!d) continue;
      let cand;
      if (d.type === "SS") cand = addDays(addDays(late[s.id].lateStart, -d.lag), fdur - 1);
      else if (d.type === "FF") cand = addDays(late[s.id].lateFinish, -d.lag);
      else if (d.type === "SF") cand = addDays(addDays(late[s.id].lateFinish, -d.lag), fdur - 1);
      else cand = addDays(late[s.id].lateStart, -(1 + d.lag)); // FS
      if (cand < lf) lf = cand;
    }
    late[t.id] = { lateStart: addDays(lf, -(fdur - 1)), lateFinish: lf };
  }

  // --- ประกอบผลลัพธ์ ---
  const byId = {};
  list.forEach((t) => {
    const f = fc[t.id];
    const baseEnd = t.baseEnd || t.end || t.start;
    const pct = Number(t.percent) || 0;
    const totalFloat = dayDiff(f.fcStart, late[t.id].lateStart);
    byId[t.id] = {
      ...f,
      slipDays: dayDiff(baseEnd, f.fcEnd),
      totalFloat,
      isCritical: pct < 100 && totalFloat <= 0,
    };
  });

  return {
    byId,
    project: projFcEnd
      ? { fcEnd: projFcEnd, baseEnd: projBaseEnd, slipDays: dayDiff(projBaseEnd, projFcEnd) }
      : null,
    cycleIds,
  };
}

// ---- helpers สำหรับ View/Modal ----

export function setBaseline(tasks) {
  return (Array.isArray(tasks) ? tasks : []).map((t) => ({
    ...t,
    baseStart: t.start,
    baseEnd: t.end || t.start,
  }));
}

// แสดง split bar เมื่อ baseline ต่างจากแผน หรือ forecast ต่างจากแผน (display preservation)
export function showSplit(task, f) {
  if (!task || !f) return false;
  const planEnd = task.end || task.start;
  const baselineDiffers =
    !!(task.baseStart && task.baseEnd) &&
    (task.baseStart !== task.start || task.baseEnd !== planEnd);
  const fcDiffers = f.fcStart !== task.start || f.fcEnd !== planEnd;
  return baselineDiffers || fcDiffers;
}

// ขอบเขตแกนเวลา ครอบทั้งแผน + baseline + forecast
export function forecastBounds(tasks, byId) {
  let min = null, max = null;
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || !t.start) continue;
    const f = byId && byId[t.id];
    for (const c of [t.start, t.baseStart, f && f.fcStart]) {
      if (c && (!min || c < min)) min = c;
    }
    for (const c of [t.end || t.start, t.baseEnd, f && f.fcEnd]) {
      if (c && (!max || c > max)) max = c;
    }
  }
  return min ? { minDate: min, maxDate: max } : null;
}

// เพิ่ม predId เป็นงานก่อนหน้าของ taskId แล้ววนไหม? (เดินขึ้นตามโซ่ deps ของ predId)
export function wouldCreateCycle(tasks, taskId, predId) {
  if (!taskId) return false; // งานใหม่ยังไม่มีงานอื่นพึ่ง → ไม่มีทางวน
  if (taskId === predId) return true;
  const byId = new Map((Array.isArray(tasks) ? tasks : []).map((t) => [t.id, t]));
  const stack = [predId];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const t = byId.get(cur);
    (Array.isArray(t && t.deps) ? t.deps : []).forEach((d) => stack.push(d.id));
  }
  return false;
}

// จุดต่อลูกศรตาม link type — xOf(dateStr, isEnd) → px
export function depEndpoints(type, pred, succ, xOf) {
  const x1 = type === "SS" || type === "SF" ? xOf(pred.fcStart, false) : xOf(pred.fcEnd, true);
  const intoLeft = type === "FS" || type === "SS";
  const x2 = intoLeft ? xOf(succ.fcStart, false) : xOf(succ.fcEnd, true);
  return { x1, x2, intoLeft };
}
