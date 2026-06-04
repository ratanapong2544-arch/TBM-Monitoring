import { EQUIPMENT, LABOR, WEATHER_SLOTS, WEATHER_CONDITIONS } from "./dailyReportSchema";

test("EQUIPMENT: 13 ชนิด, key ขึ้น eq_, มี label", () => {
  expect(EQUIPMENT).toHaveLength(13);
  EQUIPMENT.forEach((e) => {
    expect(e.key).toMatch(/^eq_/);
    expect(typeof e.label).toBe("string");
    expect(e.label.length).toBeGreaterThan(0);
  });
  expect(EQUIPMENT[0]).toEqual({ key: "eq_mobile_crane", label: "Mobile/OVH Crane" });
});

test("LABOR: 16 ชนิด, key ขึ้น lb_, มี label", () => {
  expect(LABOR).toHaveLength(16);
  LABOR.forEach((l) => {
    expect(l.key).toMatch(/^lb_/);
    expect(l.label.length).toBeGreaterThan(0);
  });
  expect(LABOR[12]).toEqual({ key: "lb_safety", label: "จ.ป." });
});

test("keys ไม่ซ้ำ", () => {
  const keys = [...EQUIPMENT, ...LABOR].map((x) => x.key);
  expect(new Set(keys).size).toBe(keys.length);
});

test("WEATHER: 8 ช่วง 3-24, 3 สภาพ", () => {
  expect(WEATHER_SLOTS).toEqual(["03", "06", "09", "12", "15", "18", "21", "24"]);
  expect(WEATHER_CONDITIONS.map((c) => c.key)).toEqual(["clear", "light", "heavy"]);
  expect(WEATHER_CONDITIONS[0].label).toBe("แจ่มใส");
});
