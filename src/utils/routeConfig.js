// Per-machine route hierarchy config (localStorage) + distance-based leg progress.
// ตารางระยะทาง project-wide (TBM1+TBM2+รวม), แก้ config ได้ในแอพ, seed จากรูปที่ 2.
// progress คำนวณแบบ distance-based (ระยะสะสมแผนต่อ permanent leaf) — ตรงกับตัวเลขรายงาน
// (901.50 − 43.80 = 857.70) และเลี่ยงการเดา ring-range ของ leg อนาคตที่ไม่มีข้อมูล.
import { drilledMetersFromRecords } from "./alignmentGeo";

export const PROJECT_TOTAL_M = 13600;
// ค่าละเอียด (ปัดตอนแสดง); TBM1 = ค่าเดิมทั้งแอพ; TBM2 seed รอผู้ใช้ยืนยัน
export const ROUTE_TOTAL = { TBM1: 8874.683, TBM2: 4726 };
export const ROUTE_NAME = {
  TBM1: "TBM1 จากรัชดา → บางบัว",
  TBM2: "TBM2 จากรัชดา → ปากคลองซุง",
};

// seed จากรูปที่ 2 — ring range เก็บเป็น "remark" (แสดงอย่างเดียว) ไม่ใช้คำนวณ status
export const DEFAULT_ROUTE_LEGS = {
  TBM1: [
    { order: "1.1",   level: 2, name: "ช่วง Main Shaft รัชดา → Working Shaft รัชดา", plannedDistance: 43.80,  remark: "" },
    { order: "1.1.1", level: 3, name: "ประกอบและติดตั้ง Segment",                    plannedDistance: 43.80,  remark: "Ring No. 1–32" },
    { order: "1.1.2", level: 3, name: "ประกอบและติดตั้ง Temporary Segment",           plannedDistance: 10.30,  temporary: true, remark: "ในบ่อ Working Shaft · Ring P33–P40" },
    { order: "1.2",   level: 2, name: "ช่วง Working Shaft รัชดา → จุด Maintenance",   plannedDistance: 3056.00, remark: "" },
    { order: "1.2.1", level: 3, name: "ประกอบและติดตั้ง Segment",                    plannedDistance: 3056.00, remark: "Ring No. P41–P653" },
    { order: "1.3",   level: 2, name: "ช่วง จุด Maintenance → หลักสี่",              plannedDistance: 4100.00, remark: "" },
    { order: "1.4",   level: 2, name: "ช่วง หลักสี่ → บางบัว",                        plannedDistance: 1700.00, remark: "" },
  ],
  TBM2: [
    { order: "2.1",   level: 2, name: "ช่วง รัชดา → ปากคลองซุง",                     plannedDistance: 4700.00, remark: "" },
  ],
};

const STATUS = { DONE: "เสร็จ", CURRENT: "กำลังทำ", PENDING: "ยังไม่เริ่ม" };
export const ROUTE_STATUS = STATUS;

export function routeConfigKey(machine) {
  return machine === "TBM1" ? "tbmRouteConfig" : `tbmRouteConfig__${machine}`;
}

function seedFor(machine) {
  return { legs: (DEFAULT_ROUTE_LEGS[machine] || []).map((l) => ({ ...l })) };
}

export function loadRouteConfig(machine) {
  try {
    const raw = localStorage.getItem(routeConfigKey(machine));
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.legs)) return p;
    }
  } catch (e) { /* malformed → seed */ }
  return seedFor(machine);
}

export function saveRouteConfig(machine, cfg) {
  try { localStorage.setItem(routeConfigKey(machine), JSON.stringify(cfg)); } catch (e) { /* quota */ }
}

export function validateLeg(leg) {
  const errs = [];
  if (!leg || !String(leg.order || "").trim()) errs.push("order ว่าง");
  const d = parseFloat(leg && leg.plannedDistance);
  if (isNaN(d) || d < 0) errs.push("ระยะทางต้องเป็นเลข ≥ 0");
  const lv = parseInt(leg && leg.level, 10);
  if (isNaN(lv) || lv < 1) errs.push("level ต้อง ≥ 1");
  return errs;
}

export function validateRouteConfig(cfg) {
  const legs = (cfg && cfg.legs) || [];
  const errs = [];
  const seen = new Set();
  legs.forEach((l, i) => {
    validateLeg(l).forEach((e) => errs.push(`แถว ${i + 1}: ${e}`));
    if (seen.has(l.order)) errs.push(`order ซ้ำ: ${l.order}`);
    seen.add(l.order);
  });
  return errs;
}

// ระยะขุดจริง (เมตร) ต่อเครื่อง — selected set เดียวกับทั้งแอพ (dedupe/perm/sum)
export function machineActualMeters(records = []) {
  return drilledMetersFromRecords(records);
}

// % clamp 0..100
export function pct(actual, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, (actual / total) * 100));
}

const isLeaf = (leg, legs) =>
  !legs.some((o) => o.order !== leg.order && String(o.order).startsWith(leg.order + "."));

// คืนแถวตาราง จาก records (ดึง bored เอง) — ใช้กับเครื่องที่มี records ครบ
export function routeRows(machine, cfg, records = []) {
  return routeRowsFromBored(machine, cfg, machineActualMeters(records));
}

// คืนแถวตาราง จากค่า bored โดยตรง — ใช้กับเครื่องที่ไม่ได้เลือก (bored มาจาก GAS machineProgress)
export function routeRowsFromBored(machine, cfg, bored = 0) {
  const legs = (cfg && cfg.legs) || [];

  // 1) คำนวณ leaf (permanent สะสมตามลำดับ; temp ไม่เข้าสาย cumulative)
  const leaf = {};
  let cum = 0;
  for (const leg of legs) {
    if (!isLeaf(leg, legs)) continue;
    const planned = parseFloat(leg.plannedDistance) || 0;
    if (leg.temporary) {
      leaf[leg.order] = { status: bored > cum + 1e-6 ? STATUS.DONE : STATUS.PENDING, actual: planned };
      continue;
    }
    const cumStart = cum, cumEnd = cum + planned;
    let status = STATUS.PENDING;
    if (bored >= cumEnd - 1e-6) status = STATUS.DONE;
    else if (bored > cumStart + 1e-6) status = STATUS.CURRENT;
    const actual = status === STATUS.CURRENT ? Math.max(0, Math.min(planned, bored - cumStart)) : planned;
    leaf[leg.order] = { status, actual };
    cum = cumEnd;
  }

  // 2) parent status = รวมจาก descendant leaves
  const parentStatus = (leg) => {
    const kids = legs.filter((o) => o.order !== leg.order && String(o.order).startsWith(leg.order + ".") && isLeaf(o, legs));
    const st = kids.map((k) => leaf[k.order] && leaf[k.order].status);
    if (st.length && st.every((s) => s === STATUS.DONE)) return STATUS.DONE;
    if (st.some((s) => s === STATUS.CURRENT) || (st.some((s) => s === STATUS.DONE) && st.some((s) => s !== STATUS.DONE))) return STATUS.CURRENT;
    return STATUS.PENDING;
  };

  // 3) ประกอบแถว
  return legs.map((leg) => {
    const planned = parseFloat(leg.plannedDistance) || 0;
    let status, displayDistance;
    if (isLeaf(leg, legs)) {
      const info = leaf[leg.order] || { status: STATUS.PENDING, actual: planned };
      status = leg.statusOverride || info.status;
      displayDistance = info.status === STATUS.CURRENT ? info.actual : planned;
    } else {
      status = leg.statusOverride || parentStatus(leg);
      displayDistance = planned;
    }
    return { order: leg.order, level: leg.level, name: leg.name, remark: leg.remark || "", plannedDistance: planned, displayDistance, status };
  });
}
