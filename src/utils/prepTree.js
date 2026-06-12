// Tree/WBS helpers สำหรับ Prep Gantt — pure ทั้งไฟล์ (ยกเว้น collapse persist ที่แตะ localStorage)
import { dayDiff } from "./prepForecast";

// สร้างโครงต้นไม้จาก parentId — guard: parentId ผี/ชี้ตัวเอง/วงจรบรรพบุรุษ → treat เป็น root
export function buildTree(tasks) {
  const list = (Array.isArray(tasks) ? tasks : []).filter((t) => t && t.id);
  const byId = new Map(list.map((t) => [t.id, t]));
  const rawParent = (t) => (t.parentId && byId.has(t.parentId) && t.parentId !== t.id ? t.parentId : null);
  const parentOf = new Map();
  for (const t of list) {
    let p = rawParent(t);
    if (p) {
      const seen = new Set([t.id]);
      let cur = p;
      while (cur) {
        if (seen.has(cur)) { p = null; break; } // วงจร → root
        seen.add(cur);
        cur = rawParent(byId.get(cur));
      }
    }
    parentOf.set(t.id, p);
  }
  const childrenOf = new Map(list.map((t) => [t.id, []]));
  const roots = [];
  for (const t of list) {
    const p = parentOf.get(t.id);
    if (p) childrenOf.get(p).push(t);
    else roots.push(t);
  }
  const order = [];
  const depthOf = new Map();
  const numberOf = new Map();
  const walk = (nodes, depth, prefix) => {
    nodes.forEach((t, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      order.push(t);
      depthOf.set(t.id, depth);
      numberOf.set(t.id, num);
      walk(childrenOf.get(t.id), depth + 1, num);
    });
  };
  walk(roots, 0, "");
  const isParent = new Set(list.filter((t) => childrenOf.get(t.id).length > 0).map((t) => t.id));
  return { order, childrenOf, parentOf, depthOf, numberOf, isParent };
}

// แถวที่มองเห็น — ตัดลูกหลานทุกชั้นของแม่ที่ย่อ
export function visibleOrder(tree, collapsedSet) {
  return tree.order.filter((t) => {
    let p = tree.parentOf.get(t.id);
    while (p) {
      if (collapsedSet.has(p)) return false;
      p = tree.parentOf.get(p);
    }
    return true;
  });
}

// Convenience wrapper — ถ้ามี tree อยู่แล้ว ใช้ tree.order.filter((t) => !tree.isParent.has(t.id)) ตรงๆ จะไม่ build ซ้ำ
// งานที่ไม่มีลูก (ชุดที่ส่งเข้า computeForecast / prepSummary / forecastBounds)
export function leafTasks(tasks) {
  const tr = buildTree(tasks);
  return tr.order.filter((t) => !tr.isParent.has(t.id));
}

// เลือก candidateParentId เป็นแม่ของ taskId แล้ววนไหม (เดินขึ้นจาก candidate ตาม parentId)
export function wouldCreateParentCycle(tasks, taskId, candidateParentId) {
  if (!taskId) return false;
  if (taskId === candidateParentId) return true;
  const byId = new Map((Array.isArray(tasks) ? tasks : []).map((t) => [t.id, t]));
  const seen = new Set();
  let cur = candidateParentId;
  while (cur) {
    if (cur === taskId) return true;
    if (seen.has(cur)) return true; // วงจรเดิมในข้อมูล — กันไว้
    seen.add(cur);
    const t = byId.get(cur);
    cur = t ? t.parentId : null;
  }
  return false;
}

// ---- สถานะย่อ/ขยาย ต่อ machine ----
const COLLAPSE_PREFIX = "tbmPrepCollapsed_";

export function loadCollapsed(machine) {
  try {
    const arr = JSON.parse(localStorage.getItem(COLLAPSE_PREFIX + machine) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) { return new Set(); }
}

export function saveCollapsed(machine, set) {
  try { localStorage.setItem(COLLAPSE_PREFIX + machine, JSON.stringify([...set])); } catch (e) { /* ignore quota */ }
}

// สรุปงานแม่ทุกตัวจาก leaf descendants — คืน Map(parentId → rollup)
// isRedFn(leafTask) = เงื่อนไขสีแดงของ leaf (view ส่ง behind||critical เข้ามา) — default ไม่แดง
export function rollupAll(tasks, fcById, isRedFn = () => false) {
  const tr = buildTree(tasks);
  const rollups = new Map();
  for (const t of tr.order) {
    if (!tr.isParent.has(t.id)) continue;
    // เก็บ leaf descendants ทุกชั้น
    const leaves = [];
    const stack = [...tr.childrenOf.get(t.id)];
    while (stack.length) {
      const c = stack.pop();
      if (tr.isParent.has(c.id)) stack.push(...tr.childrenOf.get(c.id));
      else leaves.push(c);
    }
    let start = null, end = null, fcS = null, fcE = null, bS = null, bE = null;
    let wSum = 0, pSum = 0, anyRed = false, allDone = true;
    for (const l of leaves) {
      const planEnd = l.end || l.start;
      if (!start || l.start < start) start = l.start;
      if (!end || planEnd > end) end = planEnd;
      const f = fcById && fcById[l.id];
      const fs = f ? f.fcStart : l.start;
      const fe = f ? f.fcEnd : planEnd;
      if (!fcS || fs < fcS) fcS = fs;
      if (!fcE || fe > fcE) fcE = fe;
      const lbS = l.baseStart || l.start;
      const lbE = l.baseEnd || planEnd;
      if (!bS || lbS < bS) bS = lbS;
      if (!bE || lbE > bE) bE = lbE;
      const dur = Math.max(1, dayDiff(l.start, planEnd) + 1);
      const pct = Number(l.percent) || 0;
      wSum += dur;
      pSum += pct * dur;
      if (pct < 100) allDone = false;
      if (isRedFn(l)) anyRed = true;
    }
    rollups.set(t.id, {
      start, end,
      percent: wSum ? Math.round(pSum / wSum) : 0,
      fcStart: fcS, fcEnd: fcE,
      baseStart: bS, baseEnd: bE,
      slipDays: dayDiff(bE, fcE),
      anyRed, allDone,
    });
  }
  return rollups;
}
