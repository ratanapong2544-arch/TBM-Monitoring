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
