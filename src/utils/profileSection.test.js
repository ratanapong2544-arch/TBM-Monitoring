import {
  linScale, parseRingNo, parseCH,
  designRLAtCh, exaggeratedRL, classifyDeviation,
  deviationSeries, latestRingState, toleranceBreaches,
} from "./profileSection";

test("linScale: map ค่าเชิงเส้นระหว่างสองช่วง", () => {
  expect(linScale(5, [0, 10], [0, 100])).toBe(50);
  expect(linScale(0, [0, 10], [20, 120])).toBe(20);
  expect(linScale(10, [0, 10], [20, 120])).toBe(120);
  expect(linScale(8400, [8400, 8000], [54, 884])).toBe(54);
  expect(linScale(8000, [8400, 8000], [54, 884])).toBe(884);
  expect(linScale(5, [10, 10], [99, 200])).toBe(99);
});

test("parseRingNo: prefix-aware (สอดคล้อง getRingNumeric) — ดึงเลขจาก P41/P-123", () => {
  expect(parseRingNo("572")).toBe(572);
  expect(parseRingNo(572)).toBe(572);
  expect(parseRingNo("P41")).toBe(41);     // permanent ring prefix
  expect(parseRingNo("P-123")).toBe(123);
  expect(parseRingNo(" P653 ")).toBe(653);
  expect(parseRingNo("T7")).toBe(7);        // เลขแรกในสตริง (temp ถูก filter ด้วย metric ที่อื่น)
  expect(parseRingNo("7.5")).toBe(7);
  expect(parseRingNo("")).toBeNull();       // ไม่มีเลข → null
  expect(parseRingNo("PX")).toBeNull();
  expect(parseRingNo(null)).toBeNull();
  expect(parseRingNo(undefined)).toBeNull();
});

test("parseCH (re-export) แปลง chainage string", () => {
  expect(parseCH("8+300")).toBe(8300);
});

const DLINE = [{ ch: 8400, rl: -19.5 }, { ch: 8200, rl: -20.2 }, { ch: 8000, rl: -21.0 }];

test("designRLAtCh: interpolate เชิงเส้น (ไม่สนลำดับ input)", () => {
  expect(designRLAtCh(DLINE, 8400)).toBeCloseTo(-19.5, 6);
  expect(designRLAtCh(DLINE, 8000)).toBeCloseTo(-21.0, 6);
  expect(designRLAtCh(DLINE, 8300)).toBeCloseTo(-19.85, 6);
  expect(designRLAtCh(DLINE, 9999)).toBeNull();
  expect(designRLAtCh(DLINE, 7999)).toBeNull();   // below range
  expect(designRLAtCh([], 8300)).toBeNull();        // empty designLine → null (guard)
});

test("exaggeratedRL: design + (devMM/1000)*exagg", () => {
  expect(exaggeratedRL(-20, 75, 30)).toBeCloseTo(-17.75, 6);
  expect(exaggeratedRL(-20, -100, 10)).toBeCloseTo(-21.0, 6);
  expect(exaggeratedRL(-20, 0, 30)).toBeCloseTo(-20, 6);
});

test("classifyDeviation: ok/over/under เทียบ tolerance", () => {
  expect(classifyDeviation(50)).toBe("ok");
  expect(classifyDeviation(75)).toBe("ok");
  expect(classifyDeviation(76)).toBe("over");
  expect(classifyDeviation(-90)).toBe("under");
  expect(classifyDeviation(120, 100)).toBe("over");
  expect(classifyDeviation(-75)).toBe("ok");    // boundary, exclusive
  expect(classifyDeviation(-76)).toBe("under");
});

const DLINE2 = [{ ch: 8400, rl: -19.5 }, { ch: 8000, rl: -21.0 }];
const RECS = [
  { ringNo: "570", finishCH: "8+300", headV: 50, artV: 40, tailV: 30, vrt: 0.2 },
  { ringNo: "571", finishCH: "8+200", headV: 90, artV: 80, tailV: 70, vrt: 0.4 },
  { ringNo: "572", finishCH: "8+100", headV: -120, artV: -100, tailV: -80, vrt: -0.3 },
  { ringNo: "T7",  finishCH: "8+050", headV: 10 },
  { ringNo: "569", finishCH: "8+350" },
];

test("deviationSeries: เฉพาะ record ที่มี headV, มี designRL/actualRL, เรียงตาม ch จากมาก→น้อย", () => {
  const s = deviationSeries(RECS, DLINE2);
  expect(s.map(r => r.ringNo)).toEqual(["570", "571", "572", "T7"]);
  const r571 = s.find(r => r.ringNo === "571");
  expect(r571.ch).toBe(8200);
  expect(r571.designRL).toBeCloseTo(-20.25, 6);
  expect(r571.actualRL).toBeCloseTo(-20.16, 6);
  expect(deviationSeries([], DLINE2)).toEqual([]);
});

test("latestRingState: ring ตัวเลขมากสุดที่มี headV", () => {
  const l = latestRingState(RECS);
  expect(l.ringNo).toBe("572");
  expect(l.headV).toBe(-120);
  expect(l.vrt).toBe(-0.3);
  expect(latestRingState([])).toBeNull();
  // ch=0 (0+000) ต้องไม่ถูกทิ้งเป็น null
  expect(latestRingState([{ ringNo: "1", finishCH: "0+000", headV: 5 }]).ch).toBe(0);
  // finishCH หาย → ch = null (ไม่ใช่ NaN)
  expect(latestRingState([{ ringNo: "2", headV: 5 }]).ch).toBeNull();
});

test("toleranceBreaches: คืน ring ที่ |headV| > tol พร้อม side", () => {
  const b = toleranceBreaches(deviationSeries(RECS, DLINE2), 75);
  expect(b).toEqual([
    { ringNo: "571", ch: 8200, side: "over" },
    { ringNo: "572", ch: 8100, side: "under" },
  ]);
});

// metric-aware: record ที่มีแค่ art/tail/vrt (ไม่มี headV) ต้องไม่ถูกทิ้งทั้งแถว
const RECS_M = [
  { ringNo: "P100", finishCH: "8+300", artV: 20, tailV: 10 },              // ไม่มี headV → ยังนับ
  { ringNo: "P101", finishCH: "8+200", tailV: 90 },                        // tail เกิน tol → breach
  { ringNo: "P102", finishCH: "8+100", headV: 5, artV: 5, tailV: 5, vrt: 0.1 },
  { ringNo: "P103", finishCH: "8+050" },                                   // ไม่มี metric เลย → ตัดทิ้ง
];

test("deviationSeries: metric-aware — เก็บ record ที่มี metric ใดก็ได้, ตัดเฉพาะที่ไม่มีเลย", () => {
  const s = deviationSeries(RECS_M, DLINE2);
  expect(s.map(r => r.ringNo)).toEqual(["P100", "P101", "P102"]); // P103 ถูกตัด
  const p100 = s.find(r => r.ringNo === "P100");
  expect(p100.headV).toBeNull();
  expect(p100.artV).toBe(20);
  expect(p100.actualRL).toBeNull(); // headV null → actualRL null
});

test("latestRingState: metric-aware — ริงล่าสุดที่มี metric ใดก็ได้", () => {
  const l = latestRingState(RECS_M);
  expect(l.ringNo).toBe("P102"); // เลขมากสุด = 102
  const l2 = latestRingState([{ ringNo: "P77", finishCH: "8+000", tailV: 3 }]);
  expect(l2.ringNo).toBe("P77");
  expect(l2.headV).toBeNull();
  expect(l2.tailV).toBe(3);
});

test("toleranceBreaches: metric-aware — art/tail เกิน tol ก็ถือ breach", () => {
  const b = toleranceBreaches(deviationSeries(RECS_M, DLINE2), 75);
  expect(b).toEqual([{ ringNo: "P101", ch: 8200, side: "over" }]); // tailV 90 > 75
});

test("latestRingState: คืนค่าแนวราบ headH/artH/tailH (Concept B)", () => {
  const recs = [
    { ringNo: "P200", finishCH: "8+100", headV: 41, artV: 36, tailV: 35, vrt: -0.3, headH: -8, artH: -5, tailH: -7 },
  ];
  const l = latestRingState(recs);
  expect(l.headV).toBe(41);
  expect(l.headH).toBe(-8);
  expect(l.artH).toBe(-5);
  expect(l.tailH).toBe(-7);
  // record ที่มีแค่แนวราบ (ไม่มี V) ก็ยังนับ
  const l2 = latestRingState([{ ringNo: "P201", finishCH: "8+000", headH: 12 }]);
  expect(l2.ringNo).toBe("P201");
  expect(l2.headH).toBe(12);
  expect(l2.headV).toBeNull();
});
