import {
  SEVERITY, SEVERITY_ORDER, makeIssueId, progressPct, openCount,
  splitAndSort, validateForm, upsertIssue, setIssueStatus, removeIssue,
  loadIssues, persistIssues, STORAGE_KEY, effectiveCurrent,
} from "./issues";
import { forMachine, ISSUE_MACHINES, MACHINE_LABEL } from "./issues";

const baseForm = { title: "ติดตั้ง Platform", severity: "delay", qtyEnabled: false,
  qtyCurrent: "", qtyTarget: "", qtyUnit: "", date: "", detail: "", ringCH: "" };

test("SEVERITY มี 3 ระดับ ตามลำดับ", () => {
  expect(SEVERITY_ORDER).toEqual(["delay", "blocker", "info"]);
  expect(SEVERITY.delay.badge).toBe("d");
  expect(SEVERITY.blocker.badge).toBe("c");
  expect(SEVERITY.info.badge).toBe("info");
});

test("progressPct clamp + กัน target<=0", () => {
  expect(progressPct(350, 450)).toBe(78);
  expect(progressPct(500, 450)).toBe(100);
  expect(progressPct(10, 0)).toBe(0);
  expect(progressPct(-5, 450)).toBe(0);
});

test("openCount นับเฉพาะ open", () => {
  expect(openCount([{ status: "open" }, { status: "closed" }, { status: "open" }])).toBe(2);
});

test("splitAndSort: open=createdAt ใหม่→เก่า, closed=updatedAt ใหม่→เก่า", () => {
  const arr = [
    { id: "a", status: "open", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
    { id: "b", status: "open", createdAt: "2026-06-03", updatedAt: "2026-06-03" },
    { id: "c", status: "closed", createdAt: "2026-05-01", updatedAt: "2026-06-02" },
  ];
  const { open, closed } = splitAndSort(arr);
  expect(open.map(i => i.id)).toEqual(["b", "a"]);
  expect(closed.map(i => i.id)).toEqual(["c"]);
});

test("validateForm: title+severity ต้องมี", () => {
  expect(validateForm({ ...baseForm, title: "" }).valid).toBe(false);
  expect(validateForm(baseForm).valid).toBe(true);
});

test("validateForm: qtyEnabled ต้องเป็นตัวเลข", () => {
  expect(validateForm({ ...baseForm, qtyEnabled: true, qtyCurrent: "x", qtyTarget: "5" }).valid).toBe(false);
  expect(validateForm({ ...baseForm, qtyEnabled: true, qtyCurrent: "3", qtyTarget: "5" }).valid).toBe(true);
});

test("upsertIssue: add ใส่ id/status/timestamps แล้วต่อหัว array", () => {
  const out = upsertIssue([], baseForm, "2026-06-03T00:00:00Z");
  expect(out).toHaveLength(1);
  expect(out[0].id).toMatch(/^iss_/);
  expect(out[0].status).toBe("open");
  expect(out[0].createdAt).toBe("2026-06-03T00:00:00Z");
  expect(out[0].title).toBe("ติดตั้ง Platform");
});

test("upsertIssue: edit (มี id) แก้ field + updatedAt ไม่เพิ่มแถว", () => {
  const existing = [{ id: "x1", title: "เดิม", severity: "info", status: "open",
    qtyEnabled: false, createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z" }];
  const out = upsertIssue(existing, { ...baseForm, id: "x1", title: "ใหม่" }, "2026-06-03T00:00:00Z");
  expect(out).toHaveLength(1);
  expect(out[0].title).toBe("ใหม่");
  expect(out[0].createdAt).toBe("2026-06-01T00:00:00Z");
  expect(out[0].updatedAt).toBe("2026-06-03T00:00:00Z");
});

test("setIssueStatus / removeIssue", () => {
  const arr = [{ id: "a", status: "open", updatedAt: "" }];
  expect(setIssueStatus(arr, "a", "closed", "2026-06-03T00:00:00Z")[0].status).toBe("closed");
  expect(removeIssue(arr, "a")).toHaveLength(0);
});

test("loadIssues/persistIssues roundtrip ผ่าน localStorage", () => {
  localStorage.removeItem(STORAGE_KEY);
  expect(loadIssues()).toEqual([]);
  persistIssues([{ id: "z" }]);
  expect(loadIssues()).toEqual([{ id: "z" }]);
});

test("makeIssueId ขึ้นต้น iss_ และไม่ซ้ำ", () => {
  expect(makeIssueId()).toMatch(/^iss_/);
  expect(makeIssueId()).not.toBe(makeIssueId());
});

test("effectiveCurrent: auto = currentRing + offset (clamp >=0)", () => {
  expect(effectiveCurrent({ qtyAuto: true, qtyOffset: -80 }, 521)).toBe(441);
  expect(effectiveCurrent({ qtyAuto: true, qtyOffset: 0 }, 521)).toBe(521);
  expect(effectiveCurrent({ qtyAuto: true, qtyOffset: -600 }, 521)).toBe(0);
});
test("effectiveCurrent: manual = qtyCurrent (ignores ring)", () => {
  expect(effectiveCurrent({ qtyAuto: false, qtyCurrent: 350 }, 521)).toBe(350);
  expect(effectiveCurrent({ qtyCurrent: 350 }, 521)).toBe(350);
});
test("upsertIssue: auto stores qtyOffset + qtyCurrent null", () => {
  const out = upsertIssue([], { ...baseForm, qtyEnabled: true, qtyAuto: true, qtyOffset: "-80", qtyTarget: "450" }, "t");
  expect(out[0].qtyAuto).toBe(true);
  expect(out[0].qtyOffset).toBe(-80);
  expect(out[0].qtyCurrent).toBeNull();
});
test("upsertIssue: manual stores qtyCurrent + qtyOffset 0", () => {
  const out = upsertIssue([], { ...baseForm, qtyEnabled: true, qtyCurrent: "350", qtyTarget: "450" }, "t");
  expect(out[0].qtyAuto).toBe(false);
  expect(out[0].qtyCurrent).toBe(350);
  expect(out[0].qtyOffset).toBe(0);
});
test("validateForm: auto valid without qtyCurrent (needs target only)", () => {
  expect(validateForm({ ...baseForm, qtyEnabled: true, qtyAuto: true, qtyOffset: "-80", qtyTarget: "450" }).valid).toBe(true);
  expect(validateForm({ ...baseForm, qtyEnabled: true, qtyAuto: true, qtyOffset: "0", qtyTarget: "" }).valid).toBe(false);
});

test("upsertIssue: เซ็ต machine (valid→ตามเลือก; ไม่มี/ผิด→TBM1)", () => {
  expect(upsertIssue([], { title: "a", severity: "delay", machine: "TBM2" }, "t")[0].machine).toBe("TBM2");
  expect(upsertIssue([], { title: "b", severity: "delay", machine: "all" }, "t")[0].machine).toBe("all");
  expect(upsertIssue([], { title: "c", severity: "delay" }, "t")[0].machine).toBe("TBM1");
  expect(upsertIssue([], { title: "d", severity: "delay", machine: "bogus" }, "t")[0].machine).toBe("TBM1");
});

test("forMachine: TBM1 เห็น TBM1+all; TBM2 เห็น TBM2+all; legacy→TBM1; กัน non-array", () => {
  const issues = [
    { id: "1", machine: "TBM1" },
    { id: "2", machine: "TBM2" },
    { id: "3", machine: "all" },
    { id: "4" },
  ];
  expect(forMachine(issues, "TBM1").map((i) => i.id)).toEqual(["1", "3", "4"]);
  expect(forMachine(issues, "TBM2").map((i) => i.id)).toEqual(["2", "3"]);
  expect(forMachine(null, "TBM1")).toEqual([]);
});

test("MACHINE_LABEL + ISSUE_MACHINES", () => {
  expect(ISSUE_MACHINES).toEqual(["TBM1", "TBM2", "all"]);
  expect(MACHINE_LABEL.all).toBe("ทั้งโครงการ");
});
