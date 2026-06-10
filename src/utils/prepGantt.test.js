import {
  makePrepId, loadPrepTasks, savePrepTasks, normalizePrepTask,
  upsertPrepTask, removePrepTask, expectedPercent, taskStatus, ganttBounds, prepSummary,
  addDays, computePxPerDay, ganttTicks,
} from "./prepGantt";

beforeEach(() => localStorage.clear());

test("load/save per-machine แยก key", () => {
  savePrepTasks("TBM1", [{ id: "a", name: "x", start: "2026-06-01", end: "2026-06-10", percent: 50, milestone: false }]);
  savePrepTasks("TBM2", [{ id: "b", name: "y", start: "2026-07-01", end: "2026-07-05", percent: 0, milestone: false }]);
  expect(loadPrepTasks("TBM1").map((t) => t.id)).toEqual(["a"]);
  expect(loadPrepTasks("TBM2").map((t) => t.id)).toEqual(["b"]);
  expect(localStorage.getItem("tbmPrepTasks_TBM1")).toContain("\"a\"");
});

test("loadPrepTasks: ไม่มี/เสีย → []", () => {
  expect(loadPrepTasks("TBM2")).toEqual([]);
  localStorage.setItem("tbmPrepTasks_TBM2", "{bad");
  expect(loadPrepTasks("TBM2")).toEqual([]);
});

test("normalizePrepTask: clamp %, trim name, milestone→end=start", () => {
  expect(normalizePrepTask({ name: " งาน ", start: "2026-06-01", end: "2026-06-10", percent: 150 }))
    .toMatchObject({ name: "งาน", percent: 100, milestone: false, end: "2026-06-10" });
  expect(normalizePrepTask({ name: "m", start: "2026-06-05", milestone: true, percent: -5 }))
    .toMatchObject({ start: "2026-06-05", end: "2026-06-05", percent: 0, milestone: true });
});

test("upsert (add+edit) / remove", () => {
  const a = upsertPrepTask([], { name: "a", start: "2026-06-01", end: "2026-06-02", percent: 0 });
  expect(a).toHaveLength(1);
  expect(a[0].id).toMatch(/^prep_/);
  const b = upsertPrepTask(a, { id: a[0].id, name: "a2", start: "2026-06-01", end: "2026-06-03", percent: 20 });
  expect(b).toHaveLength(1);
  expect(b[0].name).toBe("a2");
  expect(b[0].id).toBe(a[0].id);
  expect(removePrepTask(b, a[0].id)).toEqual([]);
});

test("expectedPercent: ก่อน start→0, หลัง end→100, กลาง→%", () => {
  const t = { start: "2026-06-01", end: "2026-06-11" };
  expect(expectedPercent(t, "2026-05-20")).toBe(0);
  expect(expectedPercent(t, "2026-06-20")).toBe(100);
  expect(expectedPercent(t, "2026-06-06")).toBe(50);
});

test("taskStatus: done/notstarted/behind/ontrack", () => {
  expect(taskStatus({ start: "2026-06-01", end: "2026-06-11", percent: 100 }, "2026-06-06")).toBe("done");
  expect(taskStatus({ start: "2026-06-01", end: "2026-06-11", percent: 0 }, "2026-05-01")).toBe("notstarted");
  expect(taskStatus({ start: "2026-06-01", end: "2026-06-11", percent: 10 }, "2026-06-06")).toBe("behind");
  expect(taskStatus({ start: "2026-06-01", end: "2026-06-11", percent: 60 }, "2026-06-06")).toBe("ontrack");
});

test("ganttBounds + prepSummary", () => {
  const tasks = [
    { id: "1", start: "2026-06-05", end: "2026-06-10", percent: 100 },
    { id: "2", start: "2026-06-01", end: "2026-06-20", percent: 0 },
  ];
  expect(ganttBounds(tasks)).toEqual({ minDate: "2026-06-01", maxDate: "2026-06-20" });
  expect(ganttBounds([])).toBeNull();
  const s = prepSummary(tasks, "2026-06-15");
  expect(s.total).toBe(2);
  expect(s.done).toBe(1);
});

test("taskStatus: milestone (start===end) — เลยกำหนดยังไม่เสร็จ→behind, เสร็จ→done, อนาคต→notstarted", () => {
  const m = { start: "2026-06-10", end: "2026-06-10", milestone: true, percent: 0 };
  expect(taskStatus(m, "2026-06-15")).toBe("behind");
  expect(taskStatus({ ...m, percent: 100 }, "2026-06-15")).toBe("done");
  expect(taskStatus(m, "2026-06-01")).toBe("notstarted");
});

test("addDays: ข้ามเดือน/ปี", () => {
  expect(addDays("2026-06-01", -2)).toBe("2026-05-30");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2026-06-10", 0)).toBe("2026-06-10");
});

test("computePxPerDay: clamp 8–36, invalid → 8", () => {
  expect(computePxPerDay(900, 31)).toBe(29);
  expect(computePxPerDay(100, 31)).toBe(8);
  expect(computePxPerDay(3000, 31)).toBe(36);
  expect(computePxPerDay(0, 10)).toBe(8);
  expect(computePxPerDay(500, 0)).toBe(8);
});

test("ganttTicks: เดือนเดียว มิ.ย. 2026 — month/weekLines/weekendBands ถูกตำแหน่ง", () => {
  const t = ganttTicks("2026-06-01", "2026-06-30", 30); // 1 มิ.ย. 2026 = วันจันทร์
  expect(t.months).toEqual([{ iso: "2026-06-01", x: 0, label: "มิ.ย. 69" }]);
  expect(t.days).toHaveLength(30); // px 30 ≥ 22 → label ทุกวัน
  expect(t.weekLines).toEqual([210, 420, 630, 840]); // จันทร์ 8/15/22/29 มิ.ย.
  expect(t.weekendBands).toHaveLength(4);
  expect(t.weekendBands[0]).toEqual({ x: 150, width: 60 }); // ส.6–อา.7
});

test("ganttTicks: day-label step ตาม pxPerDay (anchor วันที่ 1 ของเดือน)", () => {
  expect(ganttTicks("2026-06-01", "2026-06-30", 12).days.map((d) => d.label))
    .toEqual(["1", "3", "5", "7", "9", "11", "13", "15", "17", "19", "21", "23", "25", "27", "29"]);
  expect(ganttTicks("2026-06-01", "2026-06-30", 8).days.map((d) => d.label))
    .toEqual(["1", "6", "11", "16", "21", "26"]);
});

test("ganttTicks: ข้ามเดือน — month tick ที่ axisStart และวันที่ 1", () => {
  const t = ganttTicks("2026-05-30", "2026-06-03", 30); // 30 พ.ค. 2026 = วันเสาร์
  expect(t.months).toEqual([
    { iso: "2026-05-30", x: 0, label: "พ.ค. 69" },
    { iso: "2026-06-01", x: 60, label: "มิ.ย. 69" },
  ]);
  expect(t.weekendBands).toEqual([{ x: 0, width: 60 }]); // ส.30–อา.31
  expect(t.weekLines).toEqual([60]); // จันทร์ 1 มิ.ย.
});
