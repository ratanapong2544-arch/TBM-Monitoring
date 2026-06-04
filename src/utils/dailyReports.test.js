import {
  STORAGE_KEY, MACHINES, makeId, newItem, newDailyReport, itemPercent,
  validateReport, normalizeReport, normalize, prefillFromLatest,
  upsertDailyReport, removeDailyReport, sortReports,
  loadDailyReports, persistDailyReports,
} from "./dailyReports";
import { EQUIPMENT, LABOR, WEATHER_SLOTS } from "./dailyReportSchema";

test("itemPercent: คำนวณ + กัน total<=0/null", () => {
  expect(itemPercent({ done: 28, total: 54 })).toBe(52);
  expect(itemPercent({ done: 54, total: 54 })).toBe(100);
  expect(itemPercent({ done: 10, total: 0 })).toBeNull();
  expect(itemPercent({ done: 5, total: null })).toBeNull();
  expect(itemPercent({ done: "", total: "" })).toBeNull();
});

test("newDailyReport: shape ใหม่ครบ (area, weather/equipment/labor เป็น key map, workLog 1 แถว)", () => {
  const r = newDailyReport("TBM2");
  expect(r.id).toBe("");
  expect(r.machine).toBe("TBM2");
  expect(r.area).toBe("");
  expect(Object.keys(r.equipment)).toHaveLength(EQUIPMENT.length);
  expect(Object.keys(r.labor)).toHaveLength(LABOR.length);
  expect(new Set(Object.keys(r.weather))).toEqual(new Set(WEATHER_SLOTS));
  expect(r.equipment.eq_backhoe).toBe("");
  expect(r.weather["06"]).toBeNull();
  expect(r.workLog).toHaveLength(1);
  expect(r.sign).toEqual({ recorderName: "", recorderPos: "", checkerName: "", checkerPos: "" });
  expect(makeId("it")).toMatch(/^it_/);
});

test("validateReport: ต้องมี date + area", () => {
  const ok = { date: "2026-06-01", area: "AOB โซน A" };
  expect(validateReport(ok).valid).toBe(true);
  expect(validateReport({ ...ok, date: "" }).valid).toBe(false);
  expect(validateReport({ ...ok, area: "" }).valid).toBe(false);
  expect(validateReport({ ...ok, area: "   " }).valid).toBe(false);
});

test("normalizeReport: legacy items→workLog, driveShaft→area, counts ''→null|number", () => {
  const legacy = { date: "d", machine: "TBM1", driveShaft: "IS4", weather: "แจ่มใส",
    items: [{ title: "king post", done: "28", total: "54" }, { title: "  ", done: "1", total: "2" }],
    equipment: { eq_backhoe: "2", eq_welder: "" }, problems: "ฝน" };
  const n = normalizeReport(legacy);
  expect(n.area).toBe("IS4");
  expect(n.workLog).toHaveLength(1);
  expect(n.workLog[0]).toMatchObject({ title: "king post", done: 28, total: 54 });
  expect(n.equipment.eq_backhoe).toBe(2);
  expect(n.equipment.eq_welder).toBeNull();
  expect(Object.keys(n.equipment)).toHaveLength(EQUIPMENT.length);
  expect(n.weather["06"]).toBeNull();
  expect(n.problems).toBe("ฝน");
});

test("upsertDailyReport: add → dr_ id + prepend + timestamps + counts เป็น number|null", () => {
  const out = upsertDailyReport([], { date: "2026-06-01", area: "A", machine: "TBM2",
    equipment: { eq_backhoe: "2" }, workLog: [{ title: "a", done: "1", total: "2" }] }, "2026-06-01T00:00:00Z");
  expect(out).toHaveLength(1);
  expect(out[0].id).toMatch(/^dr_/);
  expect(out[0].equipment.eq_backhoe).toBe(2);
  expect(out[0].workLog[0].done).toBe(1);
  expect(out[0].createdAt).toBe("2026-06-01T00:00:00Z");
});

test("upsertDailyReport: edit (มี id) replace + keep createdAt", () => {
  const existing = [{ id: "dr_x", date: "2026-06-01", area: "A", machine: "TBM1", createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z" }];
  const out = upsertDailyReport(existing, { id: "dr_x", date: "2026-06-02", area: "B", machine: "TBM1" }, "2026-06-09T00:00:00Z");
  expect(out).toHaveLength(1);
  expect(out[0].id).toBe("dr_x");
  expect(out[0].date).toBe("2026-06-02");
  expect(out[0].area).toBe("B");
  expect(out[0].createdAt).toBe("2026-06-01T00:00:00Z");
  expect(out[0].updatedAt).toBe("2026-06-09T00:00:00Z");
});

test("prefillFromLatest: copy equipment/labor/sign + reset วันเฉพาะ", () => {
  const list = [{ id: "dr_1", date: "2026-06-03", area: "AOB", machine: "TBM2",
    equipment: { eq_backhoe: 2 }, labor: { lb_worker: 12 },
    sign: { recorderName: "สมชาย", recorderPos: "โฟร์แมน", checkerName: "", checkerPos: "" },
    workLog: [{ title: "เก่า", done: 1, total: 2 }], problems: "เก่า", createdAt: "x" }];
  const r = prefillFromLatest(list, { machine: "TBM2" });
  expect(r.id).toBe("");
  expect(r.equipment.eq_backhoe).toBe("2");
  expect(r.labor.lb_worker).toBe("12");
  expect(r.sign.recorderName).toBe("สมชาย");
  expect(r.area).toBe("AOB");
  expect(r.problems).toBe("");
  expect(r.workLog).toHaveLength(1);
  expect(r.workLog[0].title).toBe("");
  expect(r.date).toBe(new Date().toISOString().split("T")[0]);
});

test("prefillFromLatest: ไม่มีข้อมูล → ฟอร์มเปล่า", () => {
  const r = prefillFromLatest([], { machine: "TBM1" });
  expect(r.area).toBe("");
  expect(r.equipment.eq_backhoe).toBe("");
});

test("normalize(list): คง id/createdAt + เติม shape", () => {
  const out = normalize([{ id: "dr_1", date: "d", machine: "TBM1", items: [], createdAt: "c" }]);
  expect(out[0].id).toBe("dr_1");
  expect(out[0].createdAt).toBe("c");
  expect(Object.keys(out[0].labor)).toHaveLength(LABOR.length);
});

test("removeDailyReport", () => {
  expect(removeDailyReport([{ id: "a" }, { id: "b" }], "a")).toEqual([{ id: "b" }]);
});

test("sortReports: date ใหม่→เก่า + กรองเครื่อง", () => {
  const arr = [
    { id: "1", date: "2026-06-01", machine: "TBM1", createdAt: "x" },
    { id: "2", date: "2026-06-03", machine: "TBM2", createdAt: "y" },
    { id: "3", date: "2026-06-02", machine: "TBM1", createdAt: "z" },
  ];
  expect(sortReports(arr).map((r) => r.id)).toEqual(["2", "3", "1"]);
  expect(sortReports(arr, "TBM1").map((r) => r.id)).toEqual(["3", "1"]);
});

test("load/persist roundtrip + MACHINES", () => {
  expect(MACHINES).toEqual(["TBM1", "TBM2"]);
  localStorage.removeItem(STORAGE_KEY);
  expect(loadDailyReports()).toEqual([]);
  persistDailyReports([{ id: "z" }]);
  expect(loadDailyReports()).toEqual([{ id: "z" }]);
});
