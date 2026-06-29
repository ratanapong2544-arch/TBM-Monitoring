import { computeMuckImpact } from "./muckStats";

test("ไม่มี Muck Full: hasData = false", () => {
  const r = computeMuckImpact({
    catMin: { "Power Supply": 60 },
    delayItems: [{ name: "Power Supply", minutes: 60 }],
    avgCycleHours: 6,
  });
  expect(r.muckMin).toBe(0);
  expect(r.hasData).toBe(false);
  expect(r.isTopCause).toBe(false);
});

test("มี Muck Full แต่ไม่ใช่อันดับ 1: hasData = true, isTopCause = false", () => {
  const r = computeMuckImpact({
    catMin: { "Muck Full": 60, "TBM Equipment": 120 },
    delayItems: [{ name: "TBM Equipment", minutes: 120 }, { name: "Muck Full", minutes: 60 }],
    avgCycleHours: 5,
  });
  expect(r.hasData).toBe(true);
  expect(r.isTopCause).toBe(false);
  expect(r.muckShare).toBeCloseTo(60 / 180, 5);
});

test("Muck Full เป็นอันดับ 1: isTopCause = true, equivRings ถูกต้อง", () => {
  const r = computeMuckImpact({
    catMin: { "Muck Full": 300, "TBM Equipment": 60 },
    delayItems: [{ name: "Muck Full", minutes: 300 }, { name: "TBM Equipment", minutes: 60 }],
    avgCycleHours: 5,
  });
  expect(r.isTopCause).toBe(true);
  expect(r.muckHours).toBeCloseTo(5, 5);
  expect(r.equivRings).toBe(1); // 5 ชม. / 5 ชม.ต่อริง
});

test("avgCycleHours = 0: equivRings = null", () => {
  const r = computeMuckImpact({
    catMin: { "Muck Full": 120 },
    delayItems: [{ name: "Muck Full", minutes: 120 }],
    avgCycleHours: 0,
  });
  expect(r.equivRings).toBeNull();
  expect(r.muckHours).toBeCloseTo(2, 5);
});
