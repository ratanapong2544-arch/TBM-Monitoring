import { computePaceStats } from "./paceStats";

// สร้าง record permanent ตาม spec [date, count] โดยไล่ ringNo ไม่ซ้ำ
function build(spec) {
  let ring = 0;
  const out = [];
  spec.forEach(([date, count]) => {
    for (let i = 0; i < count; i++) {
      ring += 1;
      out.push({ ringNo: ring, date, length: 1.4, installType: "Permanent" });
    }
  });
  return out;
}
// route 1400 / avgLen 1.4 = targetRings 1000 (ทำให้คำนวณตรวจง่าย)
const BASE = { totalRouteDistance: 1400, recentWindowDays: 30 };

test("เคสปกติ: เรท 30 วัน = ฐานปฏิทิน, behind = true", () => {
  const records = build([["2026-04-01", 10], ["2026-06-20", 30]]);
  const r = computePaceStats({ ...BASE, segmentRecords: records, today: "2026-06-29", deadline: "2026-12-29" });
  expect(r.doneRings).toBe(40);
  expect(r.targetRings).toBe(1000);
  expect(r.remainingRings).toBe(960);
  expect(r.recentRate).toBeCloseTo(1.0, 5);      // 30 ริง / 30 วัน
  expect(r.lifetimeRate).toBeCloseTo(40 / 89, 4); // 89 วันปฏิทินตั้งแต่ 2026-04-01
  expect(r.requiredRate).toBeCloseTo(960 / 183, 4);
  expect(r.behind).toBe(true);
});

test("doneRings = 0: finishRecent = null, behind = true", () => {
  const r = computePaceStats({ ...BASE, segmentRecords: [], today: "2026-06-29", deadline: "2026-12-29" });
  expect(r.doneRings).toBe(0);
  expect(r.recentRate).toBe(0);
  expect(r.finishRecent).toBeNull();
  expect(r.behind).toBe(true);
});

test("โครงการอายุ < 30 วัน: หารด้วยอายุจริง ไม่ใช่ 30", () => {
  const records = build([["2026-06-25", 18]]); // เริ่ม 2026-06-20? ไม่—ริงแรก = 2026-06-25
  const r = computePaceStats({ ...BASE, segmentRecords: records, today: "2026-06-29", deadline: "2026-12-29" });
  // daysSinceStart = dayDiff(2026-06-25, 2026-06-29) = 4 → recentDenom = min(30,4) = 4
  expect(r.recentRate).toBeCloseTo(18 / 4, 5);
});

test("เลยกำหนดแล้ว: requiredRate = null", () => {
  const records = build([["2026-05-01", 10]]);
  const r = computePaceStats({ ...BASE, segmentRecords: records, today: "2026-06-29", deadline: "2026-06-01" });
  expect(r.requiredRate).toBeNull();
});

test("เรทเร็วพอ: behind = false, เสร็จก่อนกำหนด", () => {
  const records = build([["2026-06-28", 980]]);
  const r = computePaceStats({ ...BASE, segmentRecords: records, today: "2026-06-29", deadline: "2027-06-29" });
  expect(r.remainingRings).toBe(20);
  expect(r.behind).toBe(false);
  expect(r.finishRecent <= "2027-06-29").toBe(true);
  expect(r.deltaRecentDays).toBeLessThan(0);
});

test("ไม่มีงานใน 30 วันล่าสุด: finishRecent = null แต่ finishLifetime มีค่า", () => {
  const records = build([["2026-04-01", 50]]);
  const r = computePaceStats({ ...BASE, segmentRecords: records, today: "2026-06-29", deadline: "2026-12-29" });
  expect(r.recentRate).toBe(0);
  expect(r.finishRecent).toBeNull();
  expect(r.finishLifetime).not.toBeNull();
});
