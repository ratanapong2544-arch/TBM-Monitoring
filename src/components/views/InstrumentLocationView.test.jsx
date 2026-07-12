// Task R3d — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching the R3a/R3b/R3c sibling *.test.jsx files under components/instrument/).
// Covers the shell-integration concerns specific to this task: header chip derivation (instCounts /
// measured count / action-req count), locationId-filtering of the project-wide `schedules` prop (a
// decoy row for another location must not leak into counts), the empty-location guard, readOnly
// threading into ScheduleTimeline's modal, and the full node-click -> SchedReportModal -> Confirm ->
// onMark round trip. ScheduleTimeline/LongTermMonitoring/InstallationStatus/LocationRightPane's own
// internals (grouping edge cases, tab switching, blueprint pins, etc.) are already covered by their
// own test files — this file only proves the shell wires them together correctly.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import InstrumentLocationView from "./InstrumentLocationView";
import { currentChainage } from "../../utils/chainageAdapter";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<InstrumentLocationView {...props} />);
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

const location = { id: "L1", name: "Above Tunnel 8+300", chainage: 8300, actualChainage: 8360 };

const instruments = [
  { id: "i1", code: "P6379", type: "INCLINOMETER", installStatus: "INSTALLED" },
  { id: "i2", code: "P6377", type: "EXTENSOMETER", installStatus: "PENDING" },
];

const machineProgress = { TBM1: { dist: 500, rings: 120 } };
const tbm = currentChainage(machineProgress, "TBM1"); // real derivation via the same util the view uses — no hardcoded chainage

const schedules = [
  // this location — 1 already measured, 2 due (unmeasured, TBM already past their trigger)
  { id: "s-done", locationId: "L1", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: -20, tbmChainage: tbm + 100, isMeasured: true, measuredAt: "2026-01-01T00:00:00.000Z", notes: null },
  { id: "s-due-srf", locationId: "L1", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 0, tbmChainage: tbm + 50, isMeasured: false, measuredAt: null, notes: null },
  { id: "s-due-dep", locationId: "L1", scheduleType: "DISTANCE", instrumentGroup: "DEEP", distanceOffset: 20, tbmChainage: tbm + 30, isMeasured: false, measuredAt: null, notes: null },
  // decoy — different location, must not leak into this view's counts/timeline
  { id: "s-other-loc", locationId: "L2", scheduleType: "DISTANCE", instrumentGroup: "DEEP", distanceOffset: 0, tbmChainage: tbm + 50, isMeasured: false, measuredAt: null, notes: null },
];

// same formula as the brief/component: TBM Distance = operationalChainage - tbmChainage
const expectedRounded = Math.round(location.actualChainage - tbm);
const expectedTbmDistanceLabel = expectedRounded === 0 ? "0 m" : `${expectedRounded > 0 ? "+" : ""}${expectedRounded} m`;

function baseProps(overrides = {}) {
  return {
    location, instruments, allInstruments: instruments, readings: [], thresholds: [],
    schedules, machineProgress, onMark: jest.fn(), onBack: jest.fn(), readOnly: false,
    ...overrides,
  };
}

test("renders header (title/STA/count), chips, and all sections without crashing", () => {
  const { container, root } = mount(baseProps());

  expect(container.textContent).toContain("Above Tunnel 8+300");
  expect(container.textContent).toContain("Ref STA 8+300");
  expect(container.textContent).toContain("Install STA 8+360");
  expect(container.textContent).toContain("2 เครื่อง");

  // chips
  expect(container.textContent).toContain("TBM Distance");
  expect(container.textContent).toContain(expectedTbmDistanceLabel);
  expect(container.textContent).toContain("Installed");
  expect(container.textContent).toContain("1/2"); // 1 of 2 instruments INSTALLED
  expect(container.textContent).toContain("Measured");
  expect(container.textContent).toContain("1/3"); // 1 of 3 L1 schedules measured (decoy excluded)
  expect(container.textContent).toContain("Action Req");
  expect(container.textContent).toContain("2"); // 2 due schedules (decoy excluded, would make it look like 3)

  // sections
  expect(container.textContent).toContain("วาระตรวจวัดตามระยะ"); // ScheduleTimeline
  expect(container.textContent).toContain("สถานะการติดตั้ง"); // InstallationStatus
  expect(container.textContent).toContain("INSTRUMENT PLAN"); // LocationRightPane BLUEPRINT (default tab)

  unmount(container, root);
});

test("no-location empty state shows the not-found message and back button without crashing", () => {
  const onBack = jest.fn();
  const { container, root } = mount(baseProps({ location: null, onBack }));

  expect(container.textContent).toContain("ไม่พบจุดตรวจวัด");
  click(findButtonByText(container, "กลับ"));
  expect(onBack).toHaveBeenCalledTimes(1);

  unmount(container, root);
});

test("clicking a due node opens SchedReportModal; Confirm fires onMark(sched, \"done\", isoDate)", () => {
  const onMark = jest.fn();
  const { container, root } = mount(baseProps({ onMark }));

  click(findButtonByText(container, "SRF"));
  expect(container.textContent).toContain("บันทึกผลตรวจวัด");

  click(findButtonByText(container, "ยืนยันตรวจวัดเสร็จสิ้น"));

  expect(onMark).toHaveBeenCalledTimes(1);
  const [sched, kind, iso] = onMark.mock.calls[0];
  expect(sched.id).toBe("s-due-srf");
  expect(kind).toBe("done");
  expect(new Date(iso).toString()).not.toBe("Invalid Date");

  unmount(container, root);
});

test("readOnly hides the Confirm/N-A action buttons in the schedule modal", () => {
  const onMark = jest.fn();
  const { container, root } = mount(baseProps({ onMark, readOnly: true }));

  click(findButtonByText(container, "DEP"));
  expect(container.textContent).toContain("สถานะ: ยังไม่ตรวจวัด");
  expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent.includes("ยืนยันตรวจวัดเสร็จสิ้น"))).toBe(false);

  unmount(container, root);
});

test("clicking an instrument row opens InstReportModal with that instrument's detail", () => {
  const { container, root } = mount(baseProps());

  click(findButtonByText(container, "P6379"));
  expect(container.textContent).toContain("รายงานการติดตั้ง");
  expect(container.textContent).toContain("P6379");

  unmount(container, root);
});
