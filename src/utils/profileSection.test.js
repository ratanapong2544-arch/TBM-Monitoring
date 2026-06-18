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

test("parseRingNo: numeric → int, อื่นๆ → null", () => {
  expect(parseRingNo("572")).toBe(572);
  expect(parseRingNo(572)).toBe(572);
  expect(parseRingNo("T7")).toBeNull();
  expect(parseRingNo("")).toBeNull();
  expect(parseRingNo(null)).toBeNull();
  expect(parseRingNo(undefined)).toBeNull();
  expect(parseRingNo("7.5")).toBeNull();
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
});

test("toleranceBreaches: คืน ring ที่ |headV| > tol พร้อม side", () => {
  const b = toleranceBreaches(deviationSeries(RECS, DLINE2), 75);
  expect(b).toEqual([
    { ringNo: "571", ch: 8200, side: "over" },
    { ringNo: "572", ch: 8100, side: "under" },
  ]);
});
