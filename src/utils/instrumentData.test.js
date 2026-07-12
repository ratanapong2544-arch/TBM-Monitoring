import { parseProfile, parseThresholds, serializeProfile, resolveThreshold, latestReading } from "./instrumentData";

test("parseProfile ปลอดภัย", () => {
  expect(parseProfile("")).toEqual([]);
  expect(parseProfile("ไม่ใช่ json")).toEqual([]);
  expect(parseProfile('[{"depth":5,"a":1.2,"b":-0.3}]')).toEqual([{ depth:5, a:1.2, b:-0.3 }]);
});

test("serialize→parse round-trip", () => {
  const arr = [{ depth:0, a:0, b:0 }, { depth:5, a:1.1, b:2.2 }];
  expect(parseProfile(serializeProfile(arr))).toEqual(arr);
});

// Task 4.3: preset-to-readings.mjs writes profileJson as { points/piezometers/ssCode, _thresholds }
// (not a bare array) so the report ± thresholds can travel with the reading — see
// docs/superpowers/plans/2026-07-11-instrument-integration.md Task 6.3 ("อ่านจาก reading.profileJson._thresholds")
describe("object-shaped profileJson (report migration)", () => {
  const json = JSON.stringify({
    type: "INCLINOMETER_PROFILE",
    points: [{ depth: 0, a: 0, b: 0 }, { depth: 0.5, a: -1.21, b: 1.38 }],
    _thresholds: { alert: 15, alarm: 17, action: 20 },
  });
  test("parseProfile ดึง .points ออกมาเป็น array", () => {
    expect(parseProfile(json)).toEqual([{ depth: 0, a: 0, b: 0 }, { depth: 0.5, a: -1.21, b: 1.38 }]);
  });
  test("parseThresholds ดึง ._thresholds", () => {
    expect(parseThresholds(json)).toEqual({ alert: 15, alarm: 17, action: 20 });
  });
  test("parseProfile คืน [] เมื่อไม่มี .points (เช่น PIEZOMETER_BUNDLE/SETTLEMENT_POINT)", () => {
    expect(parseProfile(JSON.stringify({ type: "SETTLEMENT_POINT", ssCode: "SS-T1-01", _thresholds: {} }))).toEqual([]);
  });
  test("parseThresholds คืน null เมื่อไม่มี _thresholds หรือ input ผิดรูป", () => {
    expect(parseThresholds("")).toBeNull();
    expect(parseThresholds("ไม่ใช่ json")).toBeNull();
    expect(parseThresholds('[{"depth":5}]')).toBeNull();
  });
});

describe("resolveThreshold", () => {
  const ths = [
    { scope:"type", key:"INCLINOMETER", alert:18, alarm:20, action:22 },
    { scope:"instrument", key:"inst-1", alert:15, alarm:17, action:20 },
  ];
  test("มี override per-instrument", () =>
    expect(resolveThreshold(ths, { id:"inst-1", type:"INCLINOMETER" })).toMatchObject({ alert:15, action:20 }));
  test("ไม่มี override → default per-type", () =>
    expect(resolveThreshold(ths, { id:"inst-9", type:"INCLINOMETER" })).toMatchObject({ alert:18, action:22 }));
  test("ไม่มีเลย → null", () =>
    expect(resolveThreshold(ths, { id:"x", type:"VIBRATION" })).toBeNull());
});

test("latestReading คืนอันวันที่ล่าสุด", () => {
  const rs = [
    { instrumentId:"a", date:"2026-01-01", valuePrimary:1 },
    { instrumentId:"a", date:"2026-03-01", valuePrimary:9 },
    { instrumentId:"b", date:"2026-05-01", valuePrimary:5 },
  ];
  expect(latestReading(rs, "a").valuePrimary).toBe(9);
  expect(latestReading(rs, "z")).toBeNull();
});
