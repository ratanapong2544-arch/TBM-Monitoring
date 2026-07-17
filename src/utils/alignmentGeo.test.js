import {
  SHAFTS, SHAFT_SPANS, CH_EXCAV_START, TOTAL_ROUTE_DISTANCE, CH_MIN, CH_MAX,
} from "./alignmentGeo";
import {
  CH_EXCAV_START as C_EXCAV_START,
  TOTAL_ROUTE_DISTANCE as C_TOTAL,
  ROUTE_SEGMENTS,
} from "./constants";

// ระยะสะสมจาก launch (IS4) ตาม constants.js → map id → ระยะสะสม
const CUM = Object.fromEntries(ROUTE_SEGMENTS.map((s) => [s.id, s.distance]));
const chOf = (id) => SHAFTS.find((s) => s.id === id).ch;

test("CH_EXCAV_START / TOTAL_ROUTE_DISTANCE ตรงกับ constants.js (คอมเมนต์อ้างไว้ แต่ไม่มีอะไรบังคับ)", () => {
  expect(CH_EXCAV_START).toBe(C_EXCAV_START);
  expect(TOTAL_ROUTE_DISTANCE).toBe(C_TOTAL);
});

test("SHAFT_SPANS = ผลต่างของระยะสะสมใน ROUTE_SEGMENTS และรวมได้ระยะทั้งเส้น", () => {
  expect(SHAFT_SPANS.map((s) => s.distance)).toEqual([3065.962, 4093.624, 1715.097]);
  // ไล่ที่มาจาก constants.js: IS4-1=0 → IS3=3065.962 → IS2=7159.586 → IS1=8874.683
  expect(SHAFT_SPANS[0].distance).toBeCloseTo(CUM["IS3"] - CUM["IS4-1"], 3);
  expect(SHAFT_SPANS[1].distance).toBeCloseTo(CUM["IS2"] - CUM["IS3"], 3);
  expect(SHAFT_SPANS[2].distance).toBeCloseTo(CUM["IS1"] - CUM["IS2"], 3);
  const sum = SHAFT_SPANS.reduce((a, s) => a + s.distance, 0);
  expect(sum).toBeCloseTo(TOTAL_ROUTE_DISTANCE, 3);
});

test("SHAFT_SPANS อ้าง id ที่มีจริงใน SHAFTS และต่อกันเป็นสายเดียวจาก IS4 ถึง IS1", () => {
  const ids = SHAFTS.map((s) => s.id);
  SHAFT_SPANS.forEach((sp) => {
    expect(ids).toContain(sp.from);
    expect(ids).toContain(sp.to);
  });
  expect(SHAFT_SPANS.map((s) => s.from)).toEqual(ids.slice(0, -1));
  expect(SHAFT_SPANS.map((s) => s.to)).toEqual(ids.slice(1));
});

test("SHAFTS.ch (ระบบ KMZ) = CH_EXCAV_START − ระยะสะสม สำหรับ IS4/IS3/IS2", () => {
  expect(chOf("IS4")).toBeCloseTo(CH_EXCAV_START - CUM["IS4-1"], 3);
  expect(chOf("IS3")).toBeCloseTo(CH_EXCAV_START - CUM["IS3"], 3);
  expect(chOf("IS2")).toBeCloseTo(CH_EXCAV_START - CUM["IS2"], 3);
  // ค่าที่โชว์บนป้าย — ล็อกไว้ตรง ๆ กันปัดเศษหาย
  expect(chOf("IS4")).toBe(8830.488);
  expect(chOf("IS3")).toBe(5764.526);
  expect(chOf("IS2")).toBe(1670.902);
  expect(chOf("IS1")).toBe(0);
});

// สมมติฐานหลักของทั้งฟีเจอร์ — ถ้า test นี้แดง แปลว่า data เปลี่ยนจนป้าย CH/ระยะทางอาจไม่สอดคล้องกับที่ user เคาะไว้
test("ส่วนต่าง KMZ ↔ ตารางทางการ = 44.195 ม. อยู่ที่ช่วง IS2→IS1 ช่วงเดียว", () => {
  const chSpan = (sp) => chOf(sp.from) - chOf(sp.to);
  const [is4is3, is3is2, is2is1] = SHAFT_SPANS;
  expect(chSpan(is4is3)).toBeCloseTo(is4is3.distance, 3); // ตรงถึงระดับ มม.
  expect(chSpan(is3is2)).toBeCloseTo(is3is2.distance, 3); // ตรงถึงระดับ มม.
  expect(is2is1.distance - chSpan(is2is1)).toBeCloseTo(44.195, 3); // ← ต่างกันตั้งใจ
  expect(TOTAL_ROUTE_DISTANCE - CH_EXCAV_START).toBeCloseTo(44.195, 3);
});

test("SHAFTS เรียง chainage มาก→น้อย (ทิศเจาะ) และอยู่ในช่วงแนวจริง", () => {
  const chs = SHAFTS.map((s) => s.ch);
  expect(chs).toEqual([...chs].sort((a, b) => b - a));
  chs.forEach((ch) => {
    expect(ch).toBeGreaterThanOrEqual(CH_MIN);
    expect(ch).toBeLessThanOrEqual(CH_MAX);
  });
});
