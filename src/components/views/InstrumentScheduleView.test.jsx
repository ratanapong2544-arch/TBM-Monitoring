// Task R6 — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching InstrumentLocationView.test.jsx / DashboardToolbar.test.jsx
// conventions). Covers the 3 v1 bugs this task fixes: KPI actionable bucketing (+ the
// cross-location effective-target-date scoping hazard this project-wide view is the first caller
// to actually hit), tick -> SchedReportModal -> onMark wiring, the na-row mark guard, the new
// measured-date column, and readOnly hiding the action column.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import InstrumentScheduleView from "./InstrumentScheduleView";
import { currentChainage } from "../../utils/chainageAdapter";
import { CH_EXCAV_START } from "../../utils/constants";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<InstrumentScheduleView {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

function click(el) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function findButtonByText(container, text) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(text));
  expect(btn).toBeTruthy();
  return btn;
}

function findRow(container, text) {
  const row = Array.from(container.querySelectorAll("tbody tr")).find((tr) => tr.textContent.includes(text));
  expect(row).toBeTruthy();
  return row;
}

// StatCard (ui-ux-pro-max/components/StatCard.jsx) renders the label as a leaf <div> (text node
// only, no element children) inside a `flex items-center gap-3 mb-3` header row; the value <div>
// is that header row's NEXT sibling (not the label div's own sibling — the wrapper's ancestor also
// has textContent === label, since the icon <svg> contributes no text, so the leaf check below is
// needed to not match that wrapper instead).
function statValue(container, label) {
  const labelEl = Array.from(container.querySelectorAll("div")).find((d) => d.textContent === label && d.children.length === 0);
  expect(labelEl).toBeTruthy();
  const valueEl = labelEl.parentElement.nextElementSibling;
  expect(valueEl).toBeTruthy();
  return valueEl.textContent;
}

function selectLocation(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const locations = [
  { id: "L1", name: "Shaft IS01" },
  { id: "L2", name: "Above Tunnel AT1" },
];

const machineProgress = { TBM1: { dist: 500, rings: 120 } };
const tbm = currentChainage(machineProgress, "TBM1"); // real derivation via the same util the view uses

const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString();
const daysFromNowISO = (n) => new Date(Date.now() + n * 86400000).toISOString();

// One project-wide fixture set spanning 2 locations, exercising every KPI bucket at once plus the
// cross-location scoping hazard for LONG_TERM effective-target resolution:
//   ถึงกำหนด (due)     : dist-due                                              -> 1
//   เลยกำหนด (overdue) : lt-overdue, lt-effective-l1 (via L1's OWN trigger)     -> 2
//   รอ (pending)       : dist-pending, lt-waiting                              -> 2
//   เสร็จ (done)       : dist-done, dist-na, dist-trigger-l1, dist-trigger-l2  -> 4
// lt-effective-l1 has no persisted targetDate — its effective target must come from
// dist-trigger-l1 (SAME location L1, measured 30 days ago -> target 23 days ago -> overdue). A
// same-offset DISTANCE row also exists at L2 (dist-trigger-l2-decoy, measured TODAY). If the view
// incorrectly passed the whole project-wide `schedules` array as scheduleStatus's 4th arg instead
// of location-scoping it first, getEffectiveLongTermTargetDate's `Math.max(...measuredTimes)` would
// pick up L2's decoy (today) instead of L1's own trigger (30 days ago), giving a target 7 days in
// the FUTURE (waiting, not overdue) -> lt-effective-l1 would wrongly land in "รอ" instead of
// "เลยกำหนด", flipping the totals to due=1/overdue=1/pending=3/done=4. The exact counts below only
// hold under correct per-location scoping.
const schedules = [
  { id: "dist-due", locationId: "L1", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 5, tbmChainage: tbm + 50, isMeasured: false, measuredAt: null, measuredBy: null, notes: null },
  { id: "dist-pending", locationId: "L1", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 6, tbmChainage: tbm - 50, isMeasured: false, measuredAt: null, measuredBy: null, notes: null },
  { id: "dist-done", locationId: "L2", scheduleType: "DISTANCE", instrumentGroup: "DEEP", distanceOffset: 7, tbmChainage: tbm + 100, isMeasured: true, measuredAt: "2026-02-10T00:00:00.000Z", measuredBy: "Field Engineer", notes: null },
  { id: "dist-na", locationId: "L2", scheduleType: "DISTANCE", instrumentGroup: "DEEP", distanceOffset: 8, tbmChainage: tbm + 80, isMeasured: true, measuredAt: null, measuredBy: "System (N/A)", notes: "N/A" },
  { id: "lt-waiting", locationId: "L1", scheduleType: "LONG_TERM", longTermLabel: "LT 6M", longTermDays: 180, triggerOffset: 5, targetDate: daysFromNowISO(180), isMeasured: false, measuredAt: null, measuredBy: null, notes: null },
  { id: "lt-overdue", locationId: "L1", scheduleType: "LONG_TERM", longTermLabel: "LT 1W", longTermDays: 7, triggerOffset: 5, targetDate: daysAgoISO(10), isMeasured: false, measuredAt: null, measuredBy: null, notes: null },
  { id: "dist-trigger-l1", locationId: "L1", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 0, tbmChainage: tbm + 20, isMeasured: true, measuredAt: daysAgoISO(30), measuredBy: "Field Engineer", notes: null },
  { id: "lt-effective-l1", locationId: "L1", scheduleType: "LONG_TERM", longTermLabel: "LT EFF", longTermDays: 7, triggerOffset: 0, targetDate: null, isMeasured: false, measuredAt: null, measuredBy: null, notes: null },
  { id: "dist-trigger-l2-decoy", locationId: "L2", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 0, tbmChainage: tbm + 20, isMeasured: true, measuredAt: daysAgoISO(0), measuredBy: "Field Engineer", notes: null },
];

function baseProps(overrides = {}) {
  return { schedules, locations, machineProgress, onMark: jest.fn(), readOnly: false, ...overrides };
}

test("KPI: LONG_TERM still in its waiting window counts as รอ (not ถึงกำหนด); overdue LONG_TERM (incl. via its own location's trigger only) counts as เลยกำหนด; DISTANCE-passed counts as ถึงกำหนด; N/A counts as เสร็จ", () => {
  const { container, root } = mount(baseProps());

  expect(statValue(container, "ถึงกำหนด")).toBe("1"); // dist-due only
  expect(statValue(container, "เลยกำหนด")).toBe("2"); // lt-overdue + lt-effective-l1 (would be 1 if L2's decoy leaked in)
  expect(statValue(container, "รอ")).toBe("2"); // dist-pending + lt-waiting (the R3d-class bug: lt-waiting must NOT be in ถึงกำหนด)
  expect(statValue(container, "เสร็จ")).toBe("4"); // dist-done + dist-na + dist-trigger-l1 + dist-trigger-l2-decoy

  unmount(container, root);
});

test("tick button on a due row opens SchedReportModal; Confirm fires onMark(sched, \"done\", isoDate) for that exact row", () => {
  const onMark = jest.fn();
  const { container, root } = mount(baseProps({ onMark }));

  const row = findRow(container, "SURFACE @5m"); // dist-due
  click(row.querySelector("button"));
  expect(container.textContent).toContain("บันทึกผลตรวจวัด");

  click(findButtonByText(container, "ยืนยันตรวจวัดเสร็จสิ้น"));

  expect(onMark).toHaveBeenCalledTimes(1);
  const [sched, kind, iso] = onMark.mock.calls[0];
  expect(sched.id).toBe("dist-due");
  expect(kind).toBe("done");
  expect(new Date(iso).toString()).not.toBe("Invalid Date");

  unmount(container, root);
});

test("na (skipped) row has no mark button — can't be silently re-cascaded; an already-done row has none either", () => {
  const { container, root } = mount(baseProps());

  const naRow = findRow(container, "DEEP @8m"); // dist-na
  expect(naRow.querySelector("button")).toBeNull();

  const doneRow = findRow(container, "DEEP @7m"); // dist-done (measured, not N/A)
  expect(doneRow.querySelector("button")).toBeNull();

  unmount(container, root);
});

test("วันที่วัด column: formatted date + measuredBy for a done row, N/A for a skipped row, — for an unmeasured row", () => {
  const { container, root } = mount(baseProps());

  const doneRow = findRow(container, "DEEP @7m"); // dist-done
  const expectedDate = new Date("2026-02-10T00:00:00.000Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  expect(doneRow.textContent).toContain(expectedDate);
  expect(doneRow.textContent).toContain("Field Engineer");

  const naRow = findRow(container, "DEEP @8m"); // dist-na
  expect(naRow.textContent).toContain("N/A");

  const dueRow = findRow(container, "SURFACE @5m"); // dist-due, unmeasured
  expect(dueRow.textContent).toContain("—");

  unmount(container, root);
});

test("readOnly hides the entire mark action column (no buttons anywhere in the table)", () => {
  const { container, root } = mount(baseProps({ readOnly: true }));
  expect(container.querySelectorAll("tbody button").length).toBe(0);
  unmount(container, root);
});

test("location filter narrows the table to the selected location's rows only", () => {
  const { container, root } = mount(baseProps());
  expect(container.querySelectorAll("tbody tr").length).toBe(9);

  selectLocation(container.querySelector("select"), "L1");
  expect(container.querySelectorAll("tbody tr").length).toBe(6); // dist-due/pending, lt-waiting/overdue, dist-trigger-l1, lt-effective-l1

  unmount(container, root);
});

// --- Task R7b — machine-aware schedule table (fixture locations lack `chainage` → default to TBM1
// via locationMachine's missing-chainage fallback, so activeMachine="TBM1" preserves every count
// above unchanged) ---

test("activeMachine defaults to TBM1 when omitted — no regression for existing callers", () => {
  const { container, root } = mount(baseProps());
  expect(container.querySelectorAll("tbody tr").length).toBe(9);
  unmount(container, root);
});

test("activeMachine=TBM2 (no TBM2-zone locations yet) shows the machine empty state instead of the table, with all-zero KPIs — never a fabricated row", () => {
  const { container, root } = mount(baseProps({ activeMachine: "TBM2" }));

  expect(statValue(container, "ถึงกำหนด")).toBe("0");
  expect(statValue(container, "เลยกำหนด")).toBe("0");
  expect(statValue(container, "รอ")).toBe("0");
  expect(statValue(container, "เสร็จ")).toBe("0");
  expect(container.textContent).toContain("ยังไม่มีเครื่องมือวัดสำหรับ TBM2");
  expect(container.textContent).toContain("แนว/จุดตรวจวัดของ TBM2 กำหนดภายหลัง");
  expect(container.querySelectorAll("tbody tr").length).toBe(0);

  unmount(container, root);
});

test("machine filter scopes locations+schedules by chainage zone (locationMachine) — a TBM2-zone location/row is excluded from the TBM1 view and included in the TBM2 view", () => {
  const tbm2Loc = { id: "L3", name: "OS-01", chainage: CH_EXCAV_START + 500 };
  const tbm2Sched = { id: "dist-tbm2", locationId: "L3", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 0, tbmChainage: CH_EXCAV_START + 500, isMeasured: false, measuredAt: null, measuredBy: null, notes: null };

  const tbm1 = mount(baseProps({ locations: [...locations, tbm2Loc], schedules: [...schedules, tbm2Sched], activeMachine: "TBM1" }));
  expect(tbm1.container.textContent).not.toContain("OS-01");
  expect(tbm1.container.querySelectorAll("tbody tr").length).toBe(9); // unchanged — TBM2 row excluded
  unmount(tbm1.container, tbm1.root);

  const tbm2 = mount(baseProps({ locations: [...locations, tbm2Loc], schedules: [...schedules, tbm2Sched], activeMachine: "TBM2" }));
  expect(tbm2.container.textContent).toContain("OS-01");
  expect(tbm2.container.querySelectorAll("tbody tr").length).toBe(1); // only the TBM2 row
  unmount(tbm2.container, tbm2.root);
});
