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
const BASE = { totalRouteDistance: 1400 };

// ชุดข้อมูลร่วม: พ.ค. 1 วัน (10) + มิ.ย. 5 วันทำงาน (วันละ 4 = 20) → รวม 30 ริง
const RECORDS = build([
  ["2026-05-01", 10],
  ["2026-06-10", 4], ["2026-06-11", 4], ["2026-06-12", 4], ["2026-06-13", 4], ["2026-06-14", 4],
]);

test("filter=All: เรท=ริง/วันทำงาน, วันเสร็จคิดจากวันปฏิทิน, behind=true", () => {
  const r = computePaceStats({ ...BASE, segmentRecords: RECORDS, today: "2026-06-29", deadline: "2027-06-29" });
  expect(r.doneRings).toBe(30);
  expect(r.targetRings).toBe(1000);
  expect(r.remainingRings).toBe(970);
  // ทั้งช่วง: 6 วันทำงาน (พ.ค.1 + มิ.ย.10-14), 30 ริง → 5.0 ริง/วันทำงาน
  expect(r.windowWorkingDays).toBe(6);
  expect(r.workingRate).toBeCloseTo(30 / 6, 5);
  // วันปฏิทิน 2026-05-01..2026-06-29 = 60 วัน → 0.5 ริง/วันปฏิทิน (ใช้ทายวันเสร็จ)
  expect(r.windowCalendarDays).toBe(60);
  expect(r.windowCalendarRate).toBeCloseTo(0.5, 5);
  expect(r.requiredRate).toBeCloseTo(970 / 365, 4); // ถึง 2027-06-29
  expect(r.behind).toBe(true);
  expect(r.finishWindow > "2027-06-29").toBe(true);
});

test("filter=Monthly(มิ.ย.): เรท+วันทำงาน+วันปฏิทิน คิดเฉพาะเดือนนั้น", () => {
  const r = computePaceStats({ ...BASE, segmentRecords: RECORDS, today: "2026-06-29", deadline: "2027-06-29",
    filterStart: "2026-06-01", filterEnd: "2026-06-30" });
  expect(r.windowRings).toBe(20);          // เฉพาะ มิ.ย.
  expect(r.windowWorkingDays).toBe(5);     // 5 วันทำงาน
  expect(r.workingRate).toBeCloseTo(20 / 5, 5); // 4.0 ริง/วันทำงาน
  // winEnd clamp เป็น today (2026-06-29) เพราะ < filterEnd; 2026-06-01..2026-06-29 = 29 วัน
  expect(r.windowCalendarDays).toBe(29);
});

test("filter=Range ก่อนเริ่มงาน (ไม่มีงานในช่วง): workingRate=0, finishWindow=null", () => {
  const r = computePaceStats({ ...BASE, segmentRecords: RECORDS, today: "2026-06-29", deadline: "2027-06-29",
    filterStart: "2026-01-01", filterEnd: "2026-02-01" });
  expect(r.windowRings).toBe(0);
  expect(r.workingRate).toBe(0);
  expect(r.finishWindow).toBeNull();
  expect(r.behind).toBe(true); // ยังมีงานเหลือ
});

test("doneRings=0: workingRate=0, finishWindow=null, behind=true", () => {
  const r = computePaceStats({ ...BASE, segmentRecords: [], today: "2026-06-29", deadline: "2027-06-29" });
  expect(r.doneRings).toBe(0);
  expect(r.workingRate).toBe(0);
  expect(r.finishWindow).toBeNull();
  expect(r.behind).toBe(true);
});

test("เลยกำหนดแล้ว: requiredRate=null", () => {
  const r = computePaceStats({ ...BASE, segmentRecords: RECORDS, today: "2026-06-29", deadline: "2026-06-01" });
  expect(r.requiredRate).toBeNull();
});

test("เรทเร็วพอ: behind=false, เสร็จก่อนกำหนด", () => {
  // 30 วันติด วันละ 33 ริง = 990, เหลือ 10 → calendarRate=33 → เสร็จเกือบทันที
  const fast = build([
    ...Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 4, 31 + i)).toISOString().slice(0, 10); // 2026-05-31 + i
      return [d, 33];
    }),
  ]);
  const r = computePaceStats({ ...BASE, segmentRecords: fast, today: "2026-06-29", deadline: "2027-06-29" });
  expect(r.doneRings).toBe(990);
  expect(r.remainingRings).toBe(10);
  expect(r.workingRate).toBeCloseTo(33, 5);
  expect(r.behind).toBe(false);
  expect(r.finishWindow <= "2027-06-29").toBe(true);
  expect(r.deltaWindowDays).toBeLessThan(0);
});
