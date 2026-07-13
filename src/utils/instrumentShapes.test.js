import { instrumentShapesGeoJSON } from "./instrumentShapes";
import { INSTRUMENT_SECTIONS } from "./instrumentGeo";

const num = (v) => typeof v === "number" && !Number.isNaN(v);

test("one polygon feature per (section, type)", () => {
  const expected = INSTRUMENT_SECTIONS.reduce((n, s) => n + s.types.length, 0);
  const fc = instrumentShapesGeoJSON();
  expect(fc.type).toBe("FeatureCollection");
  expect(fc.features).toHaveLength(expected); // 8*3 + 2*2 = 28
});

test("each feature is a closed polygon with instrument props", () => {
  for (const f of instrumentShapesGeoJSON().features) {
    expect(f.geometry.type).toBe("Polygon");
    const ring = f.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed
    for (const [lng, lat] of ring) expect(num(lng) && num(lat)).toBe(true);
    expect(["EXT", "INC", "VW"]).toContain(f.properties.type);
    expect(num(f.properties.chainage)).toBe(true);
    expect(typeof f.properties.sectionId).toBe("string");
    expect(typeof f.properties.aboveTunnel).toBe("boolean");
  }
});

test("shape vertex counts distinguish type", () => {
  const byType = {};
  for (const f of instrumentShapesGeoJSON().features) {
    byType[f.properties.type] = f.geometry.coordinates[0].length;
  }
  expect(byType.INC).toBe(17); // 16-gon + close
  expect(byType.EXT).toBe(5);  // square + close
  expect(byType.VW).toBe(4);   // triangle + close
});
