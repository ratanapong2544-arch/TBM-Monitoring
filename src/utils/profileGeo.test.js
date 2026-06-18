import { LAYERS, DESIGN_LINE, BORE_DIA, BOREHOLES, CH_RANGE } from "./profileGeo";

test("CH_RANGE: min < max", () => {
  expect(CH_RANGE.min).toBeLessThan(CH_RANGE.max);
});

test("LAYERS: ทุกชั้นมี top/bottom และ ch อยู่ใน CH_RANGE", () => {
  expect(LAYERS.length).toBeGreaterThan(0);
  for (const l of LAYERS) {
    expect(Array.isArray(l.top)).toBe(true);
    expect(Array.isArray(l.bottom)).toBe(true);
    expect(l.top.length).toBeGreaterThan(0);
    for (const p of [...l.top, ...l.bottom]) {
      expect(p.ch).toBeGreaterThanOrEqual(CH_RANGE.min);
      expect(p.ch).toBeLessThanOrEqual(CH_RANGE.max);
      expect(typeof p.rl).toBe("number");
    }
  }
});

test("DESIGN_LINE: ≥2 จุด, rl เป็นตัวเลข, ch อยู่ใน CH_RANGE", () => {
  expect(DESIGN_LINE.length).toBeGreaterThanOrEqual(2);
  for (const p of DESIGN_LINE) {
    expect(typeof p.rl).toBe("number");
    expect(p.ch).toBeGreaterThanOrEqual(CH_RANGE.min);
    expect(p.ch).toBeLessThanOrEqual(CH_RANGE.max);
  }
});

test("BORE_DIA เป็นตัวเลขบวก; BOREHOLES มี strata เรียงลง", () => {
  expect(BORE_DIA).toBeGreaterThan(0);
  for (const b of BOREHOLES) {
    expect(typeof b.ch).toBe("number");
    expect(b.strata.length).toBeGreaterThan(0);
    for (const s of b.strata) {
      expect(s.fromRL).toBeGreaterThan(s.toRL); // strata เรียงจากบนลงล่าง
    }
  }
});
