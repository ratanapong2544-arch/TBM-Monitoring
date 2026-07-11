import { distanceDue, longTermTargetDate, scheduleStatus, summarizeSchedules } from "./instrumentSchedule";

describe("distanceDue (STA ลดลงเมื่อเจาะหน้า)", () => {
  // tbmChainage = STA ที่ TBM ต้องถึงเพื่อ trigger; ถึงเมื่อ curChainage <= tbmChainage
  test("ยังไม่ถึง", () => expect(distanceDue({ scheduleType:"DISTANCE", tbmChainage:8300 }, 8360)).toBe(false));
  test("ถึงแล้ว", () => expect(distanceDue({ scheduleType:"DISTANCE", tbmChainage:8300 }, 8290)).toBe(true));
});

test("longTermTargetDate = triggerDate + days", () => {
  const s = { scheduleType:"LONG_TERM", longTermDays:7, triggerMeasuredAt:"2026-01-01T00:00:00.000Z" };
  expect(longTermTargetDate(s)).toBe("2026-01-08T00:00:00.000Z");
});
test("longTermTargetDate null เมื่อยังไม่ trigger", () => {
  expect(longTermTargetDate({ scheduleType:"LONG_TERM", longTermDays:7 })).toBeNull();
});

describe("scheduleStatus", () => {
  const today = "2026-02-01T00:00:00.000Z";
  test("measured → done", () => expect(scheduleStatus({ isMeasured:true }, 8000, today)).toBe("done"));
  test("DISTANCE ยังไม่ถึง → pending", () =>
    expect(scheduleStatus({ scheduleType:"DISTANCE", tbmChainage:8300, isMeasured:false }, 8360, today)).toBe("pending"));
  test("DISTANCE ถึงแล้วยังไม่วัด → due", () =>
    expect(scheduleStatus({ scheduleType:"DISTANCE", tbmChainage:8300, isMeasured:false }, 8290, today)).toBe("due"));
});

test("summarizeSchedules นับถูก", () => {
  const list = [
    { isMeasured:true },
    { scheduleType:"DISTANCE", tbmChainage:8300, isMeasured:false },
  ];
  const s = summarizeSchedules(list, 8290, "2026-02-01T00:00:00.000Z");
  expect(s.done).toBe(1);
  expect(s.due).toBe(1);
});
