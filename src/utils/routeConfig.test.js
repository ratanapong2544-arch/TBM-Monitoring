import {
  PROJECT_TOTAL_M, ROUTE_TOTAL, DEFAULT_ROUTE_LEGS,
  routeConfigKey, loadRouteConfig, saveRouteConfig,
  validateLeg, validateRouteConfig,
  machineActualMeters, routeRows, pct,
} from "./routeConfig";

beforeEach(() => localStorage.clear());

test("constants: project total + per-machine route totals (ค่าละเอียด)", () => {
  expect(PROJECT_TOTAL_M).toBe(13600);
  expect(ROUTE_TOTAL.TBM1).toBeCloseTo(8874.683, 3);
  expect(ROUTE_TOTAL.TBM2).toBe(4726);
});

test("routeConfigKey: TBM1 ใช้ key เดิม, อื่นๆ ต่อ __machine", () => {
  expect(routeConfigKey("TBM1")).toBe("tbmRouteConfig");
  expect(routeConfigKey("TBM2")).toBe("tbmRouteConfig__TBM2");
});

test("load: ไม่มีใน localStorage → seed default; malformed → seed (ไม่ throw)", () => {
  const c = loadRouteConfig("TBM1");
  expect(c.legs.length).toBe(DEFAULT_ROUTE_LEGS.TBM1.length);
  expect(c.legs.find(l => l.order === "1.2.1")).toBeTruthy();
  localStorage.setItem("tbmRouteConfig", "{not json");
  expect(loadRouteConfig("TBM1").legs.length).toBe(DEFAULT_ROUTE_LEGS.TBM1.length);
});

test("save→load roundtrip", () => {
  const cfg = { legs: [{ order: "1", level: 1, name: "x", plannedDistance: 100 }] };
  saveRouteConfig("TBM2", cfg);
  expect(loadRouteConfig("TBM2").legs[0].name).toBe("x");
});

test("validateLeg: order/distance/level", () => {
  expect(validateLeg({ order: "1.1", level: 2, plannedDistance: 43.8 })).toEqual([]);
  expect(validateLeg({ order: "", level: 2, plannedDistance: 10 }).length).toBeGreaterThan(0);
  expect(validateLeg({ order: "1", level: 2, plannedDistance: -5 }).length).toBeGreaterThan(0);
  expect(validateLeg({ order: "1", level: 0, plannedDistance: 10 }).length).toBeGreaterThan(0);
});

test("validateRouteConfig: order ซ้ำ = error", () => {
  const errs = validateRouteConfig({ legs: [
    { order: "1", level: 1, plannedDistance: 1 },
    { order: "1", level: 1, plannedDistance: 2 },
  ]});
  expect(errs.some(e => /ซ้ำ/.test(e))).toBe(true);
});

// bored = 43.80 (perm) + 857.70 (perm, in progress) = 901.50 ตรงตามรูปที่ 2
const RECS = [
  { ringNo: "P1", length: "43.80", status: "Completed", installType: "Permanent" },
  { ringNo: "P2", length: "857.70", status: "In Progress", installType: "Permanent" },
  { ringNo: "T1", length: "10.30", status: "Completed", installType: "Temporary" }, // ตัดออก (temp)
];

test("machineActualMeters: dedupe/perm/sum = 901.50 (ตัด temp)", () => {
  expect(machineActualMeters(RECS)).toBeCloseTo(901.50, 2);
});

test("routeRows TBM1: distance-based — 1.2.1 กำลังทำ actual 857.70 (901.50−43.80), 1.2 กำลังทำ, 1.1 เสร็จ, 1.3 ยังไม่เริ่ม", () => {
  const rows = routeRows("TBM1", loadRouteConfig("TBM1"), RECS);
  const by = (o) => rows.find(r => r.order === o);
  expect(by("1.1.1").status).toBe("เสร็จ");
  expect(by("1.2.1").status).toBe("กำลังทำ");
  expect(by("1.2.1").displayDistance).toBeCloseTo(857.70, 2);
  expect(by("1.2").status).toBe("กำลังทำ");           // parent aggregate
  expect(by("1.1").status).toBe("เสร็จ");              // parent aggregate
  expect(by("1.3").status).toBe("ยังไม่เริ่ม");
  expect(by("1.3").displayDistance).toBeCloseTo(4100, 2); // ยังไม่เริ่ม → planned
});

test("pct: clamp 0..100; TBM1 10.16%, รวม 6.63%", () => {
  expect(pct(901.5, ROUTE_TOTAL.TBM1)).toBeCloseTo(10.16, 1);
  expect(pct(901.5, PROJECT_TOTAL_M)).toBeCloseTo(6.63, 1);
  expect(pct(20000, PROJECT_TOTAL_M)).toBe(100);   // clamp
  expect(pct(0, PROJECT_TOTAL_M)).toBe(0);
});
