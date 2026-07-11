import { classifyStatus, STATUS_BADGE, STATUS_ORDER, worstStatus } from "./instrumentStatus";

describe("classifyStatus", () => {
  const th = { alert: 15, alarm: 17, action: 20 };
  test("null/ไม่มี threshold → normal", () => {
    expect(classifyStatus(null, th)).toBe("normal");
    expect(classifyStatus(10, null)).toBe("normal");
  });
  test("ต่ำกว่า alert → normal", () => expect(classifyStatus(14.9, th)).toBe("normal"));
  test("ถึง alert → alert", () => expect(classifyStatus(15, th)).toBe("alert"));
  test("ถึง alarm → alarm", () => expect(classifyStatus(17, th)).toBe("alarm"));
  test("ถึง action → action", () => expect(classifyStatus(21, th)).toBe("action"));
  test("ค่าติดลบใช้ absolute (inclinometer ±)", () => expect(classifyStatus(-21, th)).toBe("action"));
});

test("STATUS_BADGE map ครบ 4 ระดับ", () => {
  expect(STATUS_BADGE).toEqual({ normal:"a", alert:"b", alarm:"c", action:"d" });
});

test("worstStatus คืนระดับรุนแรงสุด", () => {
  expect(worstStatus(["normal","alarm","alert"])).toBe("alarm");
  expect(worstStatus(["normal","normal"])).toBe("normal");
  expect(worstStatus([])).toBe("normal");
});
