// คณิตศาสตร์ pure สำหรับภาคตัด profile — ไม่ import React/SVG (jest-safe)
import { parseCH } from "./alignmentGeo";

export { parseCH };

// map ค่าเชิงเส้นจาก domain [d0,d1] → range [r0,r1] (รองรับ domain กลับด้าน)
export function linScale(v, [d0, d1], [r0, r1]) {
  if (d1 === d0) return r0;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

// ringNo ที่เป็นตัวเลขล้วน → int, อื่นๆ (เช่น "T7") → null
export function parseRingNo(ringNo) {
  if (ringNo == null) return null;
  const s = String(ringNo).trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
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

// แปลง records → จุดค่าเบี่ยงเบน (เฉพาะที่มี headV ตัวเลข), เรียงตาม chainage มาก→น้อย (ทิศเจาะ)
export function deviationSeries(records = [], designLine = []) {
  const out = [];
  for (const r of records) {
    if (r == null || r.headV == null || isNaN(parseFloat(r.headV))) continue;
    const ch = parseCH(r.finishCH);
    if (isNaN(ch)) continue;
    const designRL = designRLAtCh(designLine, ch);
    const headV = parseFloat(r.headV);
    out.push({
      ringNo: r.ringNo, ch, headV,
      artV: r.artV == null ? null : parseFloat(r.artV),
      tailV: r.tailV == null ? null : parseFloat(r.tailV),
      vrt: r.vrt == null ? null : parseFloat(r.vrt),
      designRL,
      actualRL: designRL == null ? null : designRL + headV / 1000,
    });
  }
  return out.sort((a, b) => b.ch - a.ch);
}

// ring ตัวเลขมากสุดที่มี headV → state สำหรับ callout หัวเจาะ; null ถ้าไม่มี
export function latestRingState(records = []) {
  let best = null, bestN = -Infinity;
  for (const r of records) {
    if (r == null || r.headV == null || isNaN(parseFloat(r.headV))) continue;
    const n = parseRingNo(r.ringNo);
    if (n == null || n <= bestN) continue;
    bestN = n;
    best = {
      ringNo: r.ringNo,
      ch: parseCH(r.finishCH) || null,
      headV: parseFloat(r.headV),
      artV: r.artV == null ? null : parseFloat(r.artV),
      tailV: r.tailV == null ? null : parseFloat(r.tailV),
      vrt: r.vrt == null ? null : parseFloat(r.vrt),
    };
  }
  return best;
}

// ring ที่เกิน tolerance (mm) จาก series → [{ringNo, ch, side}]
export function toleranceBreaches(series = [], tolMM = 75) {
  return series
    .map((s) => ({ ringNo: s.ringNo, ch: s.ch, side: classifyDeviation(s.headV, tolMM) }))
    .filter((s) => s.side !== "ok");
}
