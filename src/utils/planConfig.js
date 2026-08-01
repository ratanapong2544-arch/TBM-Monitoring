// Per-machine distance plan (localStorage). TBM1 ใช้ key เดิม (backward-compat + GAS sync ที่ RouteScheduleView).
// GAS per-machine = future; ตอนนี้หัวอื่น = local-only.

export const DEFAULT_PLAN_EPOCH = "2024-11"; // เดือนเริ่มสะสมแผน (project epoch)

export function distancePlanKey(machine) {
  return machine === "TBM1" ? "tbmDistancePlanConfig" : `tbmDistancePlanConfig__${machine}`;
}

// Pure: the same shape rule for a config from the snapshot as for one out of localStorage.
export function distancePlanFor(cfg) {
  const source = cfg || {};
  return { ...source, ranges: Array.isArray(source.ranges) ? source.ranges : [] };
}

// MIGRATION ONLY — no active React path reads this; the snapshot's config comes down as a prop.
export function loadDistancePlan(machine) {
  try {
    const raw = localStorage.getItem(distancePlanKey(machine));
    if (raw) return distancePlanFor(JSON.parse(raw));
  } catch (e) { /* ignore parse error */ }
  return { ranges: [] };
}

// MIGRATION ONLY — writes go through the mutation queue.
export function saveDistancePlan(machine, cfg) {
  try { localStorage.setItem(distancePlanKey(machine), JSON.stringify(cfg)); } catch (e) { /* ignore quota */ }
}

// แผนสะสม (เมตร) ตั้งแต่ fromMonth ถึง asOfMonth (รวมปลาย) ตาม ranges; clamp ด้วย totalRouteDistance เฉพาะเมื่อ > 0
export function plannedDistanceToNow(cfg, { asOfMonth, totalRouteDistance = 0, fromMonth = DEFAULT_PLAN_EPOCH } = {}) {
  const ranges = cfg && Array.isArray(cfg.ranges) ? cfg.ranges : [];
  if (ranges.length === 0 || !asOfMonth) return 0;
  let cur = fromMonth, acc = 0, loop = 0;
  while (cur <= asOfMonth && loop < 600) {
    let mPlan = 0;
    for (const r of ranges) {
      if ((!r.startMonth || cur >= r.startMonth) && (!r.endMonth || cur <= r.endMonth)) {
        mPlan = r.mode === "distance"
          ? (parseFloat(r.distancePerMonth) || 0)
          : (parseFloat(r.ringsPerDay) || 0) * (parseFloat(r.avgLength) || 1.2) * 30;
        break;
      }
    }
    acc += mPlan;
    if (totalRouteDistance > 0 && acc > totalRouteDistance) acc = totalRouteDistance;
    const [y, m] = cur.split("-"); let ny = +y, nm = +m + 1; if (nm > 12) { nm = 1; ny++; } cur = `${ny}-${String(nm).padStart(2, "0")}`; loop++;
  }
  return acc;
}

export function currentMonthBKK() {
  const nowTH = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  return `${nowTH.getFullYear()}-${String(nowTH.getMonth() + 1).padStart(2, "0")}`;
}
