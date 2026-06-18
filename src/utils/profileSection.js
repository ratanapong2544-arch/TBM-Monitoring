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
  if (ch < pts[0].ch || ch > pts[pts.length - 1].ch) return null;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].ch >= ch) {
      const a = pts[i - 1], b = pts[i];
      return linScale(ch, [a.ch, b.ch], [a.rl, b.rl]);
    }
  }
  return pts[pts.length - 1].rl;
}

// RL ที่แสดง (ขยาย deviation ×exagg รอบเส้นออกแบบ)
export function exaggeratedRL(designRL, devMM, exagg) {
  return designRL + (devMM / 1000) * exagg;
}

// จัดประเภทค่าเบี่ยงเบนเทียบ tolerance (mm)
export function classifyDeviation(devMM, tolMM = 75) {
  if (devMM > tolMM) return "over";
  if (devMM < -tolMM) return "under";
  return "ok";
}
