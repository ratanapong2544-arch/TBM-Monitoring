// คณิตศาสตร์ pure สำหรับภาคตัด profile — ไม่ import React/SVG (jest-safe)
import { parseCH } from "./alignmentGeo";

export { parseCH };

// map ค่าเชิงเส้นจาก domain [d0,d1] → range [r0,r1] (รองรับ domain กลับด้าน)
export function linScale(v, [d0, d1], [r0, r1]) {
  if (d1 === d0) return r0;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

// ดึงเลขริงจากสตริง (prefix-aware: "P41"→41, "P-123"→123, "572"→572), ไม่มีเลข → null
// สอดคล้องกับ getRingNumeric (helpers.js) แต่คงไว้ใน profileSection ให้ไฟล์ pure (ไม่ import helpers ที่มี browser API)
export function parseRingNo(ringNo) {
  if (ringNo == null) return null;
  const m = String(ringNo).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// number helper: null/NaN → null, อื่นๆ → float
function numOrNull(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// record มีค่าหัวเจาะอย่างน้อย 1 metric (V/H head/art/tail + vrt) ไหม
function hasAnyHeadMetric(r) {
  if (r == null) return false;
  return [r.headV, r.artV, r.tailV, r.vrt, r.headH, r.artH, r.tailH].some((v) => numOrNull(v) != null);
}

// RL ของแนวออกแบบที่ chainage ch (interpolate เชิงเส้น) — null ถ้านอกช่วง
export function designRLAtCh(designLine, ch) {
  const pts = [...designLine].sort((a, b) => a.ch - b.ch);
  if (!pts.length) return null;
  if (ch < pts[0].ch || ch > pts[pts.length - 1].ch) return null;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].ch >= ch) {
      const a = pts[i - 1], b = pts[i];
      return linScale(ch, [a.ch, b.ch], [a.rl, b.rl]);
    }
  }
  return pts[pts.length - 1].rl; // designLine จุดเดียว: ch ตรงจุดนั้นพอดี
}

// RL ที่แสดง (ขยาย deviation ×exagg รอบเส้นออกแบบ)
export function exaggeratedRL(designRL, devMM, exagg) {
  return designRL + (devMM / 1000) * exagg;
}

// จัดประเภทค่าเบี่ยงเบนเทียบ tolerance (mm)
// NaN (ข้อมูลขาด) ตกที่ "ok" — caller ต้อง pre-filter ถ้าไม่ต้องการ
export function classifyDeviation(devMM, tolMM = 75) {
  if (devMM > tolMM) return "over";
  if (devMM < -tolMM) return "under";
  return "ok";
}

// แปลง records → จุดค่าเบี่ยงเบน (metric-aware: เก็บ record ที่มี metric ใดก็ได้), เรียงตาม chainage มาก→น้อย (ทิศเจาะ)
export function deviationSeries(records = [], designLine = []) {
  const out = [];
  for (const r of records) {
    if (!hasAnyHeadMetric(r)) continue;
    const ch = parseCH(r.finishCH);
    if (isNaN(ch)) continue;
    const designRL = designRLAtCh(designLine, ch);
    const headV = numOrNull(r.headV);
    out.push({
      ringNo: r.ringNo, ch, headV,
      artV: numOrNull(r.artV),
      tailV: numOrNull(r.tailV),
      vrt: numOrNull(r.vrt),
      designRL,
      actualRL: designRL == null || headV == null ? null : designRL + headV / 1000,
    });
  }
  return out.sort((a, b) => b.ch - a.ch);
}

// ring ตัวเลขมากสุดที่มี metric ใดก็ได้ (metric-aware) → state สำหรับ callout หัวเจาะ; null ถ้าไม่มี
export function latestRingState(records = []) {
  let best = null, bestN = -Infinity;
  for (const r of records) {
    if (!hasAnyHeadMetric(r)) continue;
    const n = parseRingNo(r.ringNo);
    if (n == null || n <= bestN) continue;
    bestN = n;
    const ch = parseCH(r.finishCH);
    best = {
      ringNo: r.ringNo,
      ch: isNaN(ch) ? null : ch, // NaN (finishCH หาย) → null; เก็บ ch=0 (0+000) ได้ถูกต้อง
      headV: numOrNull(r.headV),
      artV: numOrNull(r.artV),
      tailV: numOrNull(r.tailV),
      vrt: numOrNull(r.vrt),
      headH: numOrNull(r.headH), // แนวราบ (ซ้าย-ขวา) mm — สำหรับ bullseye 2 แกน
      artH: numOrNull(r.artH),
      tailH: numOrNull(r.tailH),
    };
  }
  return best;
}

// ring ที่เกิน tolerance (mm) จาก series → [{ringNo, ch, side}]
// metric-aware: breach ถ้าค่าใดค่าหนึ่งของ head/art/tail เกิน tol (over ก่อน under)
export function toleranceBreaches(series = [], tolMM = 75) {
  return series
    .map((s) => {
      const vals = [s.headV, s.artV, s.tailV].filter((v) => v != null && !isNaN(v));
      let side = "ok";
      if (vals.some((v) => v > tolMM)) side = "over";
      else if (vals.some((v) => v < -tolMM)) side = "under";
      return { ringNo: s.ringNo, ch: s.ch, side };
    })
    .filter((s) => s.side !== "ok");
}
