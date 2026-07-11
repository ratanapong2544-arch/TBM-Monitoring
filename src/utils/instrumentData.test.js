import { parseProfile, serializeProfile, resolveThreshold, latestReading } from "./instrumentData";

test("parseProfile ปลอดภัย", () => {
  expect(parseProfile("")).toEqual([]);
  expect(parseProfile("ไม่ใช่ json")).toEqual([]);
  expect(parseProfile('[{"depth":5,"a":1.2,"b":-0.3}]')).toEqual([{ depth:5, a:1.2, b:-0.3 }]);
});

test("serialize→parse round-trip", () => {
  const arr = [{ depth:0, a:0, b:0 }, { depth:5, a:1.1, b:2.2 }];
  expect(parseProfile(serializeProfile(arr))).toEqual(arr);
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
