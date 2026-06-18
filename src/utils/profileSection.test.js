import { linScale, parseRingNo, parseCH } from "./profileSection";

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

// --- Task 3 ---
import { designRLAtCh, exaggeratedRL, classifyDeviation } from "./profileSection";

const DLINE = [{ ch: 8400, rl: -19.5 }, { ch: 8200, rl: -20.2 }, { ch: 8000, rl: -21.0 }];

test("designRLAtCh: interpolate เชิงเส้น (ไม่สนลำดับ input)", () => {
  expect(designRLAtCh(DLINE, 8400)).toBeCloseTo(-19.5, 6);
  expect(designRLAtCh(DLINE, 8000)).toBeCloseTo(-21.0, 6);
  expect(designRLAtCh(DLINE, 8300)).toBeCloseTo(-19.85, 6);
  expect(designRLAtCh(DLINE, 9999)).toBeNull();
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
});
