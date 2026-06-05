import { distancePlanKey, loadDistancePlan, saveDistancePlan, plannedDistanceToNow } from "./planConfig";

beforeEach(() => { localStorage.clear(); });

test("distancePlanKey: TBM1 = legacy key; อื่น = suffix", () => {
  expect(distancePlanKey("TBM1")).toBe("tbmDistancePlanConfig");
  expect(distancePlanKey("TBM2")).toBe("tbmDistancePlanConfig__TBM2");
});

test("load/saveDistancePlan: per-machine roundtrip, แยก key", () => {
  saveDistancePlan("TBM1", { ranges: [{ startMonth: "2024-11", mode: "distance", distancePerMonth: 300 }] });
  saveDistancePlan("TBM2", { ranges: [{ startMonth: "2026-08", mode: "distance", distancePerMonth: 100 }] });
  expect(loadDistancePlan("TBM1").ranges[0].distancePerMonth).toBe(300);
  expect(loadDistancePlan("TBM2").ranges[0].distancePerMonth).toBe(100);
  expect(localStorage.getItem("tbmDistancePlanConfig")).toContain("300");
  expect(localStorage.getItem("tbmDistancePlanConfig__TBM2")).toContain("100");
});

test("loadDistancePlan: ไม่มี/เสีย → {ranges:[]}", () => {
  expect(loadDistancePlan("TBM2")).toEqual({ ranges: [] });
  localStorage.setItem("tbmDistancePlanConfig__TBM2", "{bad json");
  expect(loadDistancePlan("TBM2")).toEqual({ ranges: [] });
});

test("plannedDistanceToNow: ranges ว่าง / ไม่มี asOfMonth → 0", () => {
  expect(plannedDistanceToNow({ ranges: [] }, { asOfMonth: "2026-06" })).toBe(0);
  expect(plannedDistanceToNow({ ranges: [{ startMonth: "2024-11", mode: "distance", distancePerMonth: 100 }] }, {})).toBe(0);
});

test("plannedDistanceToNow: mode distance สะสมรายเดือน (3 เดือน × 100 = 300)", () => {
  const cfg = { ranges: [{ startMonth: "2024-11", endMonth: "2025-12", mode: "distance", distancePerMonth: 100 }] };
  expect(plannedDistanceToNow(cfg, { asOfMonth: "2025-01" })).toBe(300);
});

test("plannedDistanceToNow: mode rings = ringsPerDay*avgLength*30", () => {
  const cfg = { ranges: [{ startMonth: "2024-11", endMonth: "2025-12", mode: "rings", ringsPerDay: 1, avgLength: 1.2 }] };
  expect(plannedDistanceToNow(cfg, { asOfMonth: "2024-11" })).toBe(36);
});

test("plannedDistanceToNow: range อนาคต (asOf ก่อน startMonth) → 0", () => {
  const cfg = { ranges: [{ startMonth: "2026-08", mode: "distance", distancePerMonth: 100 }] };
  expect(plannedDistanceToNow(cfg, { asOfMonth: "2026-06" })).toBe(0);
});

test("plannedDistanceToNow: clamp ด้วย totalRouteDistance เฉพาะเมื่อ >0", () => {
  const cfg = { ranges: [{ startMonth: "2024-11", endMonth: "2030-12", mode: "distance", distancePerMonth: 1000 }] };
  expect(plannedDistanceToNow(cfg, { asOfMonth: "2025-05" })).toBe(7000);
  expect(plannedDistanceToNow(cfg, { asOfMonth: "2025-05", totalRouteDistance: 500 })).toBe(500);
});
