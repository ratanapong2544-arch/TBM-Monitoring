import {
  STORAGE_KEY, MACHINES, makeId, newItem, newDailyReport, itemPercent,
  validateReport, upsertDailyReport, removeDailyReport, sortReports,
  loadDailyReports, persistDailyReports,
} from "./dailyReports";

test("itemPercent: คำนวณ + กัน total<=0/null", () => {
  expect(itemPercent({ done: 28, total: 54 })).toBe(52);
  expect(itemPercent({ done: 54, total: 54 })).toBe(100);
  expect(itemPercent({ done: 10, total: 0 })).toBeNull();
  expect(itemPercent({ done: 5, total: null })).toBeNull();
  expect(itemPercent({ done: "", total: "" })).toBeNull();
});

test("validateReport: date+machine+>=1 titled item", () => {
  const ok = { date: "2026-06-01", machine: "TBM2", items: [{ title: "king post" }] };
  expect(validateReport(ok).valid).toBe(true);
  expect(validateReport({ ...ok, date: "" }).valid).toBe(false);
  expect(validateReport({ ...ok, machine: "X" }).valid).toBe(false);
  expect(validateReport({ ...ok, items: [{ title: "" }] }).valid).toBe(false);
});

test("upsertDailyReport: add → dr_ id + prepend + timestamps", () => {
  const out = upsertDailyReport([], { date: "2026-06-01", machine: "TBM2", items: [{ title: "a", done: "1", total: "2", note: "" }], problems: "" }, "2026-06-01T00:00:00Z");
  expect(out).toHaveLength(1);
  expect(out[0].id).toMatch(/^dr_/);
  expect(out[0].items[0].done).toBe(1);
  expect(out[0].items[0].total).toBe(2);
  expect(out[0].createdAt).toBe("2026-06-01T00:00:00Z");
});

test("upsertDailyReport: edit (มี id) replace + keep createdAt", () => {
  const existing = [{ id: "dr_x", date: "2026-06-01", machine: "TBM1", items: [], problems: "", createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z" }];
  const out = upsertDailyReport(existing, { id: "dr_x", date: "2026-06-02", machine: "TBM1", items: [{ title: "b" }], problems: "" }, "2026-06-09T00:00:00Z");
  expect(out).toHaveLength(1);
  expect(out[0].date).toBe("2026-06-02");
  expect(out[0].createdAt).toBe("2026-06-01T00:00:00Z");
  expect(out[0].updatedAt).toBe("2026-06-09T00:00:00Z");
});

test("normalizeItems: ตัด item ไม่มี title + แปลง done/total เป็น number|null", () => {
  const out = upsertDailyReport([], { date: "d", machine: "TBM1", items: [{ title: "keep", done: "3", total: "" }, { title: "  ", done: "9", total: "9" }], problems: "" }, "t");
  expect(out[0].items).toHaveLength(1);
  expect(out[0].items[0].title).toBe("keep");
  expect(out[0].items[0].done).toBe(3);
  expect(out[0].items[0].total).toBeNull();
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

test("newDailyReport: id ว่าง + 1 item + machine ที่ส่ง; newItem ขึ้น it_", () => {
  const r = newDailyReport("TBM2");
  expect(r.id).toBe("");
  expect(r.machine).toBe("TBM2");
  expect(r.items).toHaveLength(1);
  expect(makeId("it")).toMatch(/^it_/);
});
