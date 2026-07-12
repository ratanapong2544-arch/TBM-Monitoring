import {
  distanceDue,
  longTermTargetDate,
  getEffectiveLongTermTargetDate,
  scheduleStatus,
  summarizeSchedules,
  markMeasurementDone,
  markMeasurementNA,
  cancelMeasurement,
  groupDistanceSchedules,
  sortLongTerm,
  approachingIndex,
  isPassed,
  isTbmHere,
  formatOffsetLabel,
  getOperationalChainage,
  formatMeasuredAtLabel,
  formatLongTermDate,
} from "./instrumentSchedule";

describe("distanceDue (STA ลดลงเมื่อเจาะหน้า)", () => {
  // tbmChainage = STA ที่ TBM ต้องถึงเพื่อ trigger; ถึงเมื่อ curChainage <= tbmChainage
  test("ยังไม่ถึง", () => expect(distanceDue({ scheduleType:"DISTANCE", tbmChainage:8300 }, 8360)).toBe(false));
  test("ถึงแล้ว", () => expect(distanceDue({ scheduleType:"DISTANCE", tbmChainage:8300 }, 8290)).toBe(true));
});

describe("longTermTargetDate (แก้ bug: ต้องอ่าน targetDate ตรงๆ ไม่ใช่ triggerMeasuredAt ที่ไม่มีจริงใน data)", () => {
  test("มี targetDate → คืนตรงๆ", () => {
    expect(longTermTargetDate({ scheduleType:"LONG_TERM", targetDate:"2026-01-08T00:00:00.000Z" }))
      .toBe("2026-01-08T00:00:00.000Z");
  });
  test("ไม่มี targetDate → null", () => {
    expect(longTermTargetDate({ scheduleType:"LONG_TERM", longTermDays:7 })).toBeNull();
  });
  test("bug fix: ต้องไม่อ่าน triggerMeasuredAt อีกต่อไป (field นี้ไม่มีจริงใน INST_SC_HEADERS)", () => {
    // เดิม bug: base = new Date(sched.triggerMeasuredAt) แล้วบวก longTermDays — ทำให้ LONG_TERM ค้าง pending ตลอดกาล
    // เพราะ field นี้ไม่มีจริง ต่อให้มันดันมีค่าอยู่ (ข้อมูลเก่าค้าง) ก็ต้องไม่ถูกใช้คำนวณอีก
    const sched = { scheduleType:"LONG_TERM", triggerMeasuredAt:"2026-01-01T00:00:00.000Z", longTermDays:7 };
    expect(longTermTargetDate(sched)).toBeNull();
  });
  test("ไม่ใช่ LONG_TERM → null", () => {
    expect(longTermTargetDate({ scheduleType:"DISTANCE", targetDate:"2026-01-08T00:00:00.000Z" })).toBeNull();
  });
  test("sched ว่าง → null", () => {
    expect(longTermTargetDate(null)).toBeNull();
  });
});

describe("getEffectiveLongTermTargetDate (port จาก page.tsx — read-side fallback)", () => {
  test("(a) มี targetDate อยู่แล้ว → คืนเลย ไม่สนใจ trigger", () => {
    const sched = { scheduleType:"LONG_TERM", targetDate:"2026-03-01T00:00:00.000Z", triggerOffset:-20, longTermDays:7 };
    expect(getEffectiveLongTermTargetDate(sched, [])).toBe("2026-03-01T00:00:00.000Z");
  });
  test("(b) ไม่มี targetDate แต่ trigger DISTANCE ที่ offset นั้นวัดครบ → max(measuredAt) + longTermDays วัน", () => {
    const sched = { scheduleType:"LONG_TERM", targetDate:null, triggerOffset:-20, longTermDays:7 };
    const all = [
      sched,
      { scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:true, measuredAt:"2026-01-01T00:00:00.000Z" },
      { scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:true, measuredAt:"2026-01-03T00:00:00.000Z" },
    ];
    // max(Jan1, Jan3) = Jan3 + 7d = Jan10
    expect(getEffectiveLongTermTargetDate(sched, all)).toBe("2026-01-10T00:00:00.000Z");
  });
  test("(c) trigger offset นั้นยังไม่มีตัวไหน measured เลย → null", () => {
    const sched = { scheduleType:"LONG_TERM", targetDate:null, triggerOffset:-20, longTermDays:7 };
    const all = [
      sched,
      { scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:false, measuredAt:null },
    ];
    expect(getEffectiveLongTermTargetDate(sched, all)).toBeNull();
  });
  test("(nuance ตาม source ต้นทาง) มี measured บางส่วนที่ offset เดียวกัน → คำนวณจากเท่าที่ measured แล้ว (ไม่ต้องรอครบ — ต่างจาก cascade ที่ setฟิลด์จริงตอนครบเท่านั้น)", () => {
    const sched = { scheduleType:"LONG_TERM", targetDate:null, triggerOffset:-20, longTermDays:7 };
    const all = [
      sched,
      { scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:true, measuredAt:"2026-01-01T00:00:00.000Z" },
      { scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:false, measuredAt:null },
    ];
    expect(getEffectiveLongTermTargetDate(sched, all)).toBe("2026-01-08T00:00:00.000Z");
  });
  test("(d) ไม่ใช่ LONG_TERM → คืน targetDate ของตัวเอง", () => {
    const sched = { scheduleType:"DISTANCE", targetDate:"2026-05-05T00:00:00.000Z" };
    expect(getEffectiveLongTermTargetDate(sched, [])).toBe("2026-05-05T00:00:00.000Z");
  });
  test("triggerOffset หรือ longTermDays เป็น null → null", () => {
    expect(getEffectiveLongTermTargetDate({ scheduleType:"LONG_TERM", targetDate:null, triggerOffset:null, longTermDays:7 }, [])).toBeNull();
    expect(getEffectiveLongTermTargetDate({ scheduleType:"LONG_TERM", targetDate:null, triggerOffset:-20, longTermDays:null }, [])).toBeNull();
  });
});

describe("scheduleStatus", () => {
  const today = "2026-02-01T00:00:00.000Z";
  test("measured → done", () => expect(scheduleStatus({ isMeasured:true }, 8000, today)).toBe("done"));
  test("DISTANCE ยังไม่ถึง → pending", () =>
    expect(scheduleStatus({ scheduleType:"DISTANCE", tbmChainage:8300, isMeasured:false }, 8360, today)).toBe("pending"));
  test("DISTANCE ถึงแล้วยังไม่วัด → due", () =>
    expect(scheduleStatus({ scheduleType:"DISTANCE", tbmChainage:8300, isMeasured:false }, 8290, today)).toBe("due"));

  test("notes==='N/A' → na (แม้ isMeasured=true เหมือน markMeasurementNA ตั้งไว้)", () => {
    expect(scheduleStatus({ isMeasured:true, notes:"N/A" }, 8000, today)).toBe("na");
  });
  test("LONG_TERM เลยกำหนด (targetDate ของตัวเอง) → overdue", () => {
    expect(scheduleStatus({ scheduleType:"LONG_TERM", targetDate:"2026-01-01T00:00:00.000Z" }, 8000, today)).toBe("overdue");
  });
  test("LONG_TERM ยังไม่เลยกำหนด → due", () => {
    expect(scheduleStatus({ scheduleType:"LONG_TERM", targetDate:"2026-03-01T00:00:00.000Z" }, 8000, today)).toBe("due");
  });
  test("LONG_TERM ไม่มี target เลย (ไม่ส่ง allSchedules) → pending", () => {
    expect(scheduleStatus({ scheduleType:"LONG_TERM" }, 8000, today)).toBe("pending");
  });
  test("LONG_TERM: เมื่อส่ง allSchedules ให้ใช้ effective fallback แทน targetDate ดิบ", () => {
    const sched = { scheduleType:"LONG_TERM", triggerOffset:-20, longTermDays:7, targetDate:null };
    const all = [
      sched,
      { scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:true, measuredAt:"2026-01-01T00:00:00.000Z" },
    ];
    // Jan1 + 7d = Jan8 < today(Feb1) → overdue
    expect(scheduleStatus(sched, 8000, today, all)).toBe("overdue");
  });
  test("all-nodata (sched ว่างเปล่า) ไม่ระเบิด → pending", () => {
    expect(() => scheduleStatus({}, null, today)).not.toThrow();
    expect(scheduleStatus({}, null, today)).toBe("pending");
  });
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

describe("markMeasurementDone (cascade → LONG_TERM ที่ trigger บน offset เดียวกัน)", () => {
  test("mark ตัวสุดท้ายที่ offset (ครบทุกตัวแล้ว) → LONG_TERM ที่ triggerOffset นั้นได้ targetDate = completionTime + longTermDays", () => {
    const schedules = [
      { id:"d1", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:true, measuredAt:"2026-01-01T00:00:00.000Z" },
      { id:"d2", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:false, measuredAt:null },
      { id:"lt1", locationId:"L1", scheduleType:"LONG_TERM", triggerOffset:-20, longTermDays:7, targetDate:null },
    ];
    const { next, changed } = markMeasurementDone(schedules, "d2", "2026-01-05T00:00:00.000Z");

    const d2 = next.find((s) => s.id === "d2");
    expect(d2.isMeasured).toBe(true);
    expect(d2.measuredAt).toBe("2026-01-05T00:00:00.000Z");
    expect(d2.measuredBy).toBe("Field Engineer");

    const lt = next.find((s) => s.id === "lt1");
    expect(lt.targetDate).toBe("2026-01-12T00:00:00.000Z"); // 2026-01-05 + 7d

    expect(changed.some((s) => s.id === "d2")).toBe(true);
    expect(changed.some((s) => s.id === "lt1")).toBe(true);
    expect(changed.length).toBe(2);
  });

  test("mark ตัวที่ offset ยังไม่ครบ (ยังมีตัวอื่นค้าง) → LONG_TERM ยังไม่ถูก set", () => {
    const schedules = [
      { id:"d1", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:false, measuredAt:null },
      { id:"d2", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:-20, isMeasured:false, measuredAt:null },
      { id:"lt1", locationId:"L1", scheduleType:"LONG_TERM", triggerOffset:-20, longTermDays:7, targetDate:null },
    ];
    const { next, changed } = markMeasurementDone(schedules, "d1", "2026-01-05T00:00:00.000Z");

    const lt = next.find((s) => s.id === "lt1");
    expect(lt.targetDate).toBeNull();
    expect(changed.some((s) => s.id === "lt1")).toBe(false);
    expect(changed.length).toBe(1); // มีแค่ d1 เอง
  });

  test("measuredAtISO ไม่ส่งมา → ใช้วันนี้ (ไม่ระเบิด, ยังคง isMeasured=true)", () => {
    const schedules = [{ id:"d1", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:5, isMeasured:false }];
    const { next } = markMeasurementDone(schedules, "d1");
    const d1 = next.find((s) => s.id === "d1");
    expect(d1.isMeasured).toBe(true);
    expect(typeof d1.measuredAt).toBe("string");
  });

  test("ไม่แก้ไข array/object เดิม (immutable)", () => {
    const schedules = [{ id:"d1", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:5, isMeasured:false }];
    const original = JSON.parse(JSON.stringify(schedules));
    markMeasurementDone(schedules, "d1", "2026-01-05T00:00:00.000Z");
    expect(schedules).toEqual(original);
  });
});

describe("markMeasurementNA", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-02-01T00:00:00.000Z")); });
  afterEach(() => { jest.useRealTimers(); });

  test("set notes='N/A', measuredAt=null, measuredBy='System (N/A)', isMeasured=true — cascade ใช้ completionTime=วันนี้", () => {
    const schedules = [
      { id:"d1", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:10, isMeasured:true, measuredAt:"2026-01-20T00:00:00.000Z" },
      { id:"d2", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:10, isMeasured:false, measuredAt:null },
      { id:"lt2", locationId:"L1", scheduleType:"LONG_TERM", triggerOffset:10, longTermDays:3, targetDate:null },
    ];
    const { next, changed } = markMeasurementNA(schedules, "d2");

    const d2 = next.find((s) => s.id === "d2");
    expect(d2.notes).toBe("N/A");
    expect(d2.measuredAt).toBeNull();
    expect(d2.isMeasured).toBe(true);
    expect(d2.measuredBy).toBe("System (N/A)");

    const lt = next.find((s) => s.id === "lt2");
    expect(lt.targetDate).toBe("2026-02-04T00:00:00.000Z"); // วันนี้ (Feb1) + 3d

    expect(changed.some((s) => s.id === "lt2")).toBe(true);
  });
});

describe("cancelMeasurement", () => {
  test("reset isMeasured/measuredAt/notes/measuredBy ครบ ไม่มี cascade reverse", () => {
    const schedules = [
      { id:"d1", locationId:"L1", scheduleType:"DISTANCE", distanceOffset:10, isMeasured:true, measuredAt:"2026-01-20T00:00:00.000Z", notes:"N/A", measuredBy:"System (N/A)" },
      { id:"lt1", locationId:"L1", scheduleType:"LONG_TERM", triggerOffset:10, longTermDays:3, targetDate:"2026-01-23T00:00:00.000Z" },
    ];
    const { next, changed } = cancelMeasurement(schedules, "d1");

    const d1 = next.find((s) => s.id === "d1");
    expect(d1.isMeasured).toBe(false);
    expect(d1.measuredAt).toBeNull();
    expect(d1.notes).toBeNull();
    expect(d1.measuredBy).toBeNull();

    // ไม่มี cascade reverse: LONG_TERM ที่เคย set ไปแล้วต้องไม่ถูกแตะ
    const lt = next.find((s) => s.id === "lt1");
    expect(lt.targetDate).toBe("2026-01-23T00:00:00.000Z");

    expect(changed.length).toBe(1);
    expect(changed[0].id).toBe("d1");
  });
});

describe("groupDistanceSchedules", () => {
  test("negatives ก่อน positives เรียง asc ทั้งคู่", () => {
    const schedules = [
      { id:"a", scheduleType:"DISTANCE", distanceOffset:20 },
      { id:"b", scheduleType:"DISTANCE", distanceOffset:-10 },
      { id:"c", scheduleType:"DISTANCE", distanceOffset:0 },
      { id:"d", scheduleType:"DISTANCE", distanceOffset:-30 },
    ];
    const groups = groupDistanceSchedules(schedules, "IS02");
    expect(groups.map((g) => g[0].distanceOffset)).toEqual([-30, -10, 0, 20]);
  });
  test("SHAFT IS04 คง duplicate offset 0 แยกเป็นหลาย group", () => {
    const schedules = [
      { id:"a", scheduleType:"DISTANCE", distanceOffset:0 },
      { id:"b", scheduleType:"DISTANCE", distanceOffset:0 },
    ];
    const groups = groupDistanceSchedules(schedules, "SHAFT IS04");
    expect(groups.length).toBe(2);
  });
  test("non-SHAFT รวม offset เดียวกันเป็น group เดียว", () => {
    const schedules = [
      { id:"a", scheduleType:"DISTANCE", distanceOffset:0 },
      { id:"b", scheduleType:"DISTANCE", distanceOffset:0 },
    ];
    const groups = groupDistanceSchedules(schedules, "IS02");
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(2);
  });
  test("กรอง LONG_TERM และ distanceOffset null ออก", () => {
    const schedules = [
      { id:"a", scheduleType:"DISTANCE", distanceOffset:5 },
      { id:"b", scheduleType:"LONG_TERM", distanceOffset:null },
      { id:"c", scheduleType:"DISTANCE", distanceOffset:null },
    ];
    const groups = groupDistanceSchedules(schedules, "IS02");
    expect(groups.length).toBe(1);
    expect(groups[0][0].id).toBe("a");
  });
});

describe("sortLongTerm", () => {
  test("เรียงตาม side priority (FINAL/(L) ก่อน INIT ก่อนอื่นๆ) แล้ว longTermDays แล้ว label", () => {
    const schedules = [
      { id:"a", scheduleType:"LONG_TERM", longTermLabel:"INIT", longTermDays:1 },
      { id:"b", scheduleType:"LONG_TERM", longTermLabel:"FINAL", longTermDays:30 },
      { id:"c", scheduleType:"DISTANCE", distanceOffset:0 },
    ];
    const sorted = sortLongTerm(schedules);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("approachingIndex / isPassed / isTbmHere", () => {
  const groups = [
    [{ tbmChainage: 8300, distanceOffset: -20 }],
    [{ tbmChainage: 8200, distanceOffset: 0 }],
    [{ tbmChainage: 8100, distanceOffset: 20 }],
  ];

  test("isPassed: true เมื่อ TBM ผ่านจุดแล้ว (curChainage <= tbmChainage)", () => {
    expect(isPassed(groups[0], 8290)).toBe(true);
    expect(isPassed(groups[0], 8310)).toBe(false);
  });

  test("approachingIndex: กลุ่มแรกที่ยังไปไม่ถึง และอยู่ในระยะ 50m", () => {
    expect(approachingIndex(groups, 8330)).toBe(0);
  });

  test("approachingIndex: -1 ถ้าไกลเกิน 50m จากกลุ่มถัดไป", () => {
    expect(approachingIndex(groups, 8400)).toBe(-1);
  });

  test("approachingIndex: -1 ถ้าผ่านหมดทุกกลุ่มแล้ว", () => {
    expect(approachingIndex(groups, 8000)).toBe(-1);
  });

  test("isTbmHere: TBM อยู่ระหว่าง node ปัจจุบันกับ node ถัดไป", () => {
    expect(isTbmHere(groups, 0, -15)).toBe(true); // -20 <= -15 < 0
    expect(isTbmHere(groups, 0, 5)).toBe(false); // เลย node ถัดไปแล้ว
  });

  test("isTbmHere: node สุดท้ายใช้ window +15", () => {
    expect(isTbmHere(groups, 2, 25)).toBe(true); // 20 <= 25 <= 35
    expect(isTbmHere(groups, 2, 40)).toBe(false);
  });
});

describe("formatOffsetLabel", () => {
  test("null → 'N/A'", () => expect(formatOffsetLabel(null, "IS02")).toBe("N/A"));
  test("0 → '0'", () => expect(formatOffsetLabel(0, "IS02")).toBe("0"));
  test("SHAFT IS04 → บวกเสมอ (+|offset|)", () => expect(formatOffsetLabel(-15, "SHAFT IS04")).toBe("+15"));
  test("ปกติ negative → คงเครื่องหมายลบ", () => expect(formatOffsetLabel(-15, "IS02")).toBe("-15"));
  test("ปกติ positive → เติม '+'", () => expect(formatOffsetLabel(15, "IS02")).toBe("+15"));
});

describe("getOperationalChainage (R3a — port จาก LocationDetailClient.tsx:47-49)", () => {
  test("มี actualChainage → ใช้ค่านั้น", () => {
    expect(getOperationalChainage({ chainage: 8300, actualChainage: 8360 })).toBe(8360);
  });
  test("actualChainage เป็น null → fallback ไปที่ chainage", () => {
    expect(getOperationalChainage({ chainage: 8300, actualChainage: null })).toBe(8300);
  });
  test("location ว่างเปล่า → null (ไม่ throw)", () => {
    expect(getOperationalChainage(null)).toBeNull();
  });
});

describe("formatMeasuredAtLabel (R3a — port จาก LocationDetailClient.tsx:55-62)", () => {
  test("isMeasured=true แต่ไม่มี measuredAt (มาร์ค N/A) → 'N/A'", () => {
    expect(formatMeasuredAtLabel(null, true)).toBe("N/A");
  });
  test("ยังไม่วัด (isMeasured=false, measuredAt=null) → ว่าง", () => {
    expect(formatMeasuredAtLabel(null, false)).toBe("");
  });
  test("มี measuredAt → 'dd Mon'", () => {
    expect(formatMeasuredAtLabel("2026-01-08T12:00:00.000Z", true)).toBe("08 Jan");
  });
});

describe("formatLongTermDate (R3a — port จาก LocationDetailClient.tsx:64-71)", () => {
  test("null → ว่าง", () => expect(formatLongTermDate(null)).toBe(""));
  test("มีวันที่ → 'dd Mon yyyy'", () => {
    expect(formatLongTermDate("2026-01-08T12:00:00.000Z")).toBe("08 Jan 2026");
  });
});
