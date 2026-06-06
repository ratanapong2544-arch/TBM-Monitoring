import {
  makePrepId, loadPrepTasks, savePrepTasks, normalizePrepTask,
  upsertPrepTask, removePrepTask, expectedPercent, taskStatus, ganttBounds, prepSummary,
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
