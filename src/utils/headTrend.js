// pure logic ของกราฟแนวโน้มระดับหัวเจาะ — ไม่ import React/recharts (jest-safe)
// series ที่รับ = {ringN, headV, artV, tailV}[] จาก chartData ใน HeadLevelView

export const RANGE_OPTIONS = [
  { value: 50, label: "50 ริง" },
  { value: 150, label: "150 ริง" },
  { value: 0, label: "ทั้งหมด" },
];

const STEP = 25;        // ขั้นเลขกลมของแกน Y
const MIN_HALF = 100;   // ครึ่งแกนขั้นต่ำ — ให้แถบ ±75 ไม่ชิดขอบและอยู่ที่เดิมทุกช่วง
const NEAR_RATIO = 0.66; // เกินเท่านี้ของ tolerance = "ใกล้ขอบ"

const vals = (d) => [d.headV, d.artV, d.tailV].filter((v) => v != null && !isNaN(v));
const maxAbs = (d) => { const v = vals(d); return v.length ? Math.max(...v.map(Math.abs)) : null; };
const byRing = (s) => [...s].sort((a, b) => a.ringN - b.ringN);

// N ริงท้าย (size<=0 = ทั้งหมด) · endRing != null → ให้หน้าต่างจบที่ริงนั้น
export function focusWindow(series, size, endRing = null) {
  const s = byRing(series);
  if (!size || size <= 0 || size >= s.length) return s;
  let end = s.length;
  if (endRing != null) {
    const i = s.findIndex((d) => d.ringN >= endRing);
    if (i >= 0) end = Math.min(s.length, Math.max(size, i + 1));
  }
  return s.slice(end - size, end);
}

// [lo, hi] เลขกลมขั้น 25 · ครอบ ±tol+25 เสมอ (อย่างน้อย ±MIN_HALF)
export function niceDomain(series, tol) {
  const all = series.flatMap(vals);
  const lo = Math.min(-MIN_HALF, -(tol + STEP), ...all);
  const hi = Math.max(MIN_HALF, tol + STEP, ...all);
  return [Math.floor(lo / STEP) * STEP, Math.ceil(hi / STEP) * STEP];
}

// ช่วงริงที่เกิน tolerance ติดกัน → วาดเป็นพื้นหลังแดงแทนจุดรายริง
export function breachSpans(series, tol) {
  const out = [];
  let cur = null;
  for (const d of byRing(series)) {
    const m = maxAbs(d);
    if (m != null && m > tol) {
      if (!cur) cur = { from: d.ringN, to: d.ringN };
      else cur.to = d.ringN;
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

const classify = (m, tol) => (m > tol ? "over" : m > tol * NEAR_RATIO ? "near" : "ok");

// สถานะรายริงสำหรับแถบภาพรวม — ริงที่ไม่มีค่าเลยถูกข้าม (ไม่ใช่ ok)
export function ribbonStatus(series, tol) {
  return byRing(series).reduce((acc, d) => {
    const m = maxAbs(d);
    if (m != null) acc.push({ ringN: d.ringN, status: classify(m, tol), mag: m });
    return acc;
  }, []);
}

// สถานะของริงเลขมากสุด — ตอบ "ตอนนี้เป็นไง" ไม่ใช่ "เคยเป็นไง"
export function latestStatus(series, tol) {
  const s = ribbonStatus(series, tol);
  return s.length ? s[s.length - 1] : null;
}
