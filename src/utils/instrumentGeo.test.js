import {
  INSTRUMENT_SECTIONS, SETTLEMENT_CROSSES, INSTRUMENT_META, settlementGeoJSON,
} from "./instrumentGeo";

const num = (v) => typeof v === "number" && !Number.isNaN(v);

test("10 instrument sections, all well-formed", () => {
  expect(INSTRUMENT_SECTIONS).toHaveLength(10);
  for (const s of INSTRUMENT_SECTIONS) {
    expect(num(s.lng) && num(s.lat) && num(s.chainage)).toBe(true);
    expect(s.types.length).toBeGreaterThan(0);
    expect(s.types.every((t) => ["EXT", "INC", "VW"].includes(t))).toBe(true);
    expect(typeof s.aboveTunnel).toBe("boolean");
  }
});

test("chainages within alignment span", () => {
  for (const s of INSTRUMENT_SECTIONS) {
    expect(s.chainage).toBeGreaterThanOrEqual(0);
    expect(s.chainage).toBeLessThanOrEqual(8882.226);
  }
  // at least one section is 'Above Tunnel'
  expect(INSTRUMENT_SECTIONS.some((s) => s.aboveTunnel)).toBe(true);
});

test("656 settlement crosses, each a 2-point segment", () => {
  expect(SETTLEMENT_CROSSES).toHaveLength(656);
  for (const seg of SETTLEMENT_CROSSES) {
    expect(seg).toHaveLength(2);
    expect(num(seg[0][0]) && num(seg[0][1]) && num(seg[1][0]) && num(seg[1][1])).toBe(true);
  }
});

test("settlementGeoJSON returns one MultiLineString FeatureCollection with 656 segments", () => {
  const fc = settlementGeoJSON();
  expect(fc.type).toBe("FeatureCollection");
  expect(fc.features).toHaveLength(1);
  expect(fc.features[0].geometry.type).toBe("MultiLineString");
  expect(fc.features[0].geometry.coordinates).toHaveLength(656);
});

test("INSTRUMENT_META shape mapping fixed", () => {
  expect(INSTRUMENT_META.INC.shape).toBe("circle");
  expect(INSTRUMENT_META.EXT.shape).toBe("square");
  expect(INSTRUMENT_META.VW.shape).toBe("triangle");
});
