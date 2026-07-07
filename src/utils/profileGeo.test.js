import { CH_RANGE, RL_RANGE, BACKDROP, BORE_DIA, SHAFTS, DESIGN_LINE } from "./profileGeo";

test("CH_RANGE / RL_RANGE: min < max", () => {
  expect(CH_RANGE.min).toBeLessThan(CH_RANGE.max);
  expect(RL_RANGE.min).toBeLessThan(RL_RANGE.max);
});

test("BACKDROP: มี src และ bounds ตรงกับ CH_RANGE/RL_RANGE", () => {
  expect(typeof BACKDROP.src).toBe("string");
  expect(BACKDROP.src.length).toBeGreaterThan(0);
  expect(BACKDROP.chMin).toBe(CH_RANGE.min);
  expect(BACKDROP.chMax).toBe(CH_RANGE.max);
  expect(BACKDROP.rlMin).toBe(RL_RANGE.min);
  expect(BACKDROP.rlMax).toBe(RL_RANGE.max);
  expect(BACKDROP.aspect).toBeGreaterThan(0);
});

test("DESIGN_LINE: ≥2 จุด, rl เป็นตัวเลข, ch อยู่ใน CH_RANGE", () => {
  expect(DESIGN_LINE.length).toBeGreaterThanOrEqual(2);
  for (const p of DESIGN_LINE) {
    expect(typeof p.rl).toBe("number");
    expect(p.ch).toBeGreaterThanOrEqual(CH_RANGE.min);
    expect(p.ch).toBeLessThanOrEqual(CH_RANGE.max);
  }
});

test("BORE_DIA เป็นตัวเลขบวก; SHAFTS มี ch", () => {
  expect(BORE_DIA).toBeGreaterThan(0);
  expect(SHAFTS.length).toBeGreaterThan(0);
  for (const s of SHAFTS) expect(typeof s.ch).toBe("number");
});
