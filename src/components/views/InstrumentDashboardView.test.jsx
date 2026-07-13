// Task R4d — dashboard shell integration test (react-dom/client + act; this repo has no
// @testing-library, matching the R4a/R4b/R4c sibling *.test.jsx conventions). Covers what the shell
// itself is responsible for: header/cards/toolbar/grid assembly, the locationId pre-grouping actually
// reaching the right LocationCard (no cross-location leak), filter/search/sort really
// filtering/reordering the grid, the empty state, and readOnly threading through to the reused
// ScheduleTimeline modal. DashboardHeader/ComplianceCards/DashboardToolbar/LocationCard internals
// (formulas, node grouping, modal field behavior, etc.) already have their own test files — not
// re-tested here.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import InstrumentDashboardView from "./InstrumentDashboardView";
import { currentChainage } from "../../utils/chainageAdapter";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<InstrumentDashboardView {...props} />);
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

// .includes (not exact ===) — matches DashboardToolbar.test.jsx's own clickButtonByText convention,
// needed because the sort toggle's label is an icon + a JSX-whitespace-prefixed text node.
function clickButtonByText(container, text) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(text));
  expect(btn).toBeTruthy();
  click(btn);
  return btn;
}

// Controlled <input>'s onChange only fires when React's value-tracker sees a real change — set via
// the native setter then dispatch a native "input" event (same jsdom trick as DashboardToolbar.test.jsx).
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// LocationCard's name <h3> is the only place these exact strings appear — filtering by the known
// fixture names means a reused section's own <h3> (e.g. ScheduleTimeline's "วาระตรวจวัดตามระยะ") can
// never be mistaken for a card banner heading, so DOM order of these = grid order.
const LOC_NAMES = ["IS02", "IS04", "AT-01"];
function visibleLocationNamesInOrder(container) {
  return Array.from(container.querySelectorAll("h3"))
    .map((h) => h.textContent)
    .filter((t) => LOC_NAMES.includes(t));
}

const machineProgress = { TBM1: { dist: 530 } };
const tbm = currentChainage(machineProgress, "TBM1"); // real derivation via the same util the view uses

const locations = [
  { id: "L1", name: "IS02", type: "BRIDGE", chainage: tbm + 0.5, actualChainage: null }, // nearest (|dist| ~0.5)
  { id: "L2", name: "IS04", type: "SHAFT", chainage: tbm - 400, actualChainage: null }, // farthest (|dist| 400)
  { id: "L3", name: "AT-01", type: "ABOVE_TUNNEL", chainage: tbm + 50, actualChainage: null }, // middle (|dist| 50)
];

const schedules = [
  { id: "s1", locationId: "L1", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 0, tbmChainage: tbm + 20, isMeasured: false, measuredAt: null, notes: null },
  { id: "s2", locationId: "L2", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 0, tbmChainage: tbm - 400, isMeasured: true, measuredAt: "2026-01-01T00:00:00.000Z", notes: null },
];

const instruments = [
  { id: "i1", locationId: "L1", type: "INCLINOMETER", code: "IN-01", installStatus: "INSTALLED" },
  { id: "i2", locationId: "L2", type: "PIEZOMETER", code: "PZ-01", installStatus: "PLANNED" },
];

function baseProps(overrides = {}) {
  return {
    locations, instruments, schedules, machineProgress,
    onOpenLocation: jest.fn(), onMark: jest.fn(), readOnly: false,
    ...overrides,
  };
}

test("renders header, 5 compliance cards, toolbar, and a LocationCard grid for every location", () => {
  const { container, root } = mount(baseProps());

  expect(container.textContent).toContain("Instrument Monitoring"); // DashboardHeader
  ["TBM Chainage", "Upcoming Nodes", "Action Required", "Meas. Progress", "Inst. Installation"].forEach((label) => {
    expect(container.textContent).toContain(label); // ComplianceCards
  });
  expect(container.textContent).toContain("Measurement Control Panel");
  expect(container.textContent).toContain("Tracking all 3 locations and 2 compliance points");
  ["All Locations", "Shaft", "Bridge", "Above Tunnel", "Settlement"].forEach((label) => {
    expect(container.textContent).toContain(label); // DashboardToolbar
  });
  expect(visibleLocationNamesInOrder(container)).toHaveLength(3);

  unmount(container, root);
});

test("schedules/instruments are pre-grouped per location with no cross-location leak", () => {
  const { container, root } = mount(baseProps());
  // L1: 1 unmeasured DISTANCE schedule + 1 instrument -> progress "0/1", Inst. (1)
  // L2: 1 measured DISTANCE schedule + 1 instrument -> progress "1/1", Inst. (1)
  // L3: 0 schedules, 0 instruments -> no mini-list, progress "0/0"
  expect(container.textContent).toContain("0/1");
  expect(container.textContent).toContain("1/1");
  unmount(container, root);
});

test("filter pill narrows the grid to matching location.type only", () => {
  const { container, root } = mount(baseProps());
  clickButtonByText(container, "Bridge");
  expect(visibleLocationNamesInOrder(container)).toEqual(["IS02"]);
  expect(container.textContent).toContain("1 location"); // toolbar counts wired to filtered length
  unmount(container, root);
});

test("search narrows the grid by location name", () => {
  const { container, root } = mount(baseProps());
  const input = container.querySelector('input[type="text"]');
  typeInto(input, "IS04");
  expect(visibleLocationNamesInOrder(container)).toEqual(["IS04"]);
  unmount(container, root);
});

test("default NEAREST sort orders cards by distance-to-TBM; CHAINAGE sort switches to raw chainage desc", () => {
  const { container, root } = mount(baseProps());
  expect(visibleLocationNamesInOrder(container)).toEqual(["IS02", "AT-01", "IS04"]); // |0.5| < |50| < |400|

  clickButtonByText(container, "เรียงตามระยะทาง");
  expect(visibleLocationNamesInOrder(container)).toEqual(["AT-01", "IS02", "IS04"]); // chainage desc

  unmount(container, root);
});

test("empty state renders when the filter+search combination matches nothing", () => {
  const { container, root } = mount(baseProps());
  clickButtonByText(container, "Bridge");
  const input = container.querySelector('input[type="text"]');
  typeInto(input, "no-such-location");
  expect(container.textContent).toContain("ไม่พบจุดตรวจวัด");
  expect(visibleLocationNamesInOrder(container)).toHaveLength(0);
  unmount(container, root);
});

test("readOnly hides the mark affordance in the reused ScheduleTimeline modal", () => {
  const { container, root } = mount(baseProps({ readOnly: true, onMark: null }));
  const nodeBtn = Array.from(container.querySelectorAll("button")).find((b) => (b.title || "").includes("SURFACE"));
  click(nodeBtn);
  expect(container.textContent).not.toContain("ยืนยันตรวจวัดเสร็จสิ้น");
  expect(container.textContent).not.toContain("ยกเลิกการบันทึก");
  unmount(container, root);
});

test("View Details on a LocationCard calls onOpenLocation with that location's id", () => {
  const onOpenLocation = jest.fn();
  const { container, root } = mount(baseProps({ onOpenLocation }));
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("View Details"));
  click(btn);
  expect(onOpenLocation).toHaveBeenCalledWith("L1"); // first card in default NEAREST order
  unmount(container, root);
});

// --- Task R7b — machine-aware dashboard (all fixture locations sit in the TBM1 chainage zone) ---

test("activeMachine defaults to TBM1 when omitted — no regression for existing callers", () => {
  const { container, root } = mount(baseProps());
  expect(visibleLocationNamesInOrder(container)).toHaveLength(3);
  expect(container.textContent).toContain("Tracking all 3 locations and 2 compliance points");
  unmount(container, root);
});

test("activeMachine=TBM2 (no TBM2-zone locations yet) shows the machine empty state, not the toolbar-filter empty state — compliance cards still render, all zeroed", () => {
  const { container, root } = mount(baseProps({ activeMachine: "TBM2" }));

  expect(container.textContent).toContain("ยังไม่มีเครื่องมือวัดสำหรับ TBM2");
  expect(container.textContent).toContain("แนว/จุดตรวจวัดของ TBM2 กำหนดภายหลัง");
  expect(container.textContent).not.toContain("ไม่พบจุดตรวจวัด"); // must be the machine empty state, not the filter one
  expect(container.textContent).toContain("Tracking all 0 locations and 0 compliance points");
  expect(visibleLocationNamesInOrder(container)).toHaveLength(0);

  // ComplianceCards still render (never hidden), all-zero — never a fabricated TBM2 position/count
  ["TBM Chainage", "Upcoming Nodes", "Action Required", "Meas. Progress", "Inst. Installation"].forEach((label) => {
    expect(container.textContent).toContain(label);
  });
  expect(container.textContent).toContain("0 / 0");

  unmount(container, root);
});

test("machine filter scopes locations/schedules/instruments by chainage zone (locationMachine) — a TBM2-zone location is excluded from TBM1 and included in TBM2", () => {
  const tbm2Loc = { id: "L4", name: "OS-01", type: "SHAFT", chainage: 13000, actualChainage: null }; // > CH_EXCAV_START → TBM2 zone
  const tbm2Schedule = { id: "s3", locationId: "L4", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 0, tbmChainage: 13000, isMeasured: false, measuredAt: null, notes: null };
  const tbm2Instrument = { id: "i3", locationId: "L4", type: "PIEZOMETER", code: "PZ-02", installStatus: "INSTALLED" };

  const tbm1 = mount(baseProps({
    locations: [...locations, tbm2Loc],
    schedules: [...schedules, tbm2Schedule],
    instruments: [...instruments, tbm2Instrument],
    activeMachine: "TBM1",
  }));
  expect(visibleLocationNamesInOrder(tbm1.container)).toHaveLength(3); // OS-01 excluded
  expect(tbm1.container.textContent).not.toContain("OS-01");
  expect(tbm1.container.textContent).toContain("Tracking all 3 locations and 2 compliance points"); // TBM2 schedule excluded from tally
  unmount(tbm1.container, tbm1.root);

  const tbm2 = mount(baseProps({
    locations: [...locations, tbm2Loc],
    schedules: [...schedules, tbm2Schedule],
    instruments: [...instruments, tbm2Instrument],
    activeMachine: "TBM2",
  }));
  expect(tbm2.container.textContent).toContain("OS-01");
  expect(tbm2.container.textContent).toContain("Tracking all 1 locations and 1 compliance points");
  unmount(tbm2.container, tbm2.root);
});
