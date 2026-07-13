// Task R4c — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching ScheduleTimeline.test.jsx / ComplianceCards.test.jsx conventions).
// Covers: banner (REF/STA chip + label flip, name/type badge, status badge, TBM-dist chip + pulse,
// Install STA chip), progress fraction (N/A-as-measured), hasPassedAndPending ring, the instruments
// mini-list (TYPE_ICON reuse, no emoji), View Details callback, and that the REUSED R3a sections
// (ScheduleTimeline/LongTermMonitoring) actually render inside the card with onMark wired through.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import LocationCard from "./LocationCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const location = { id: "L1", name: "IS02", type: "BRIDGE", chainage: 8300, actualChainage: null };
const locationWithInstallChainage = { id: "L2", name: "SHAFT IS04", type: "SHAFT", chainage: 8300, actualChainage: 8360 };

const schedulesMixed = [
  {
    id: "d1",
    locationId: "L1",
    scheduleType: "DISTANCE",
    instrumentGroup: "SURFACE",
    distanceOffset: -20,
    tbmChainage: 8320,
    isMeasured: true,
    measuredAt: "2026-01-01T00:00:00.000Z",
    notes: null,
  },
  {
    id: "d2",
    locationId: "L1",
    scheduleType: "DISTANCE",
    instrumentGroup: "DEEP",
    distanceOffset: 0,
    tbmChainage: 8300,
    isMeasured: false,
    measuredAt: null,
    notes: null,
  },
  {
    id: "lt1",
    locationId: "L1",
    scheduleType: "LONG_TERM",
    longTermLabel: "INIT",
    longTermDays: 30,
    triggerOffset: -20,
    targetDate: "2026-02-01T00:00:00.000Z",
    isMeasured: false,
    measuredAt: null,
    notes: null,
  },
];

const schedulesAllMeasured = [
  {
    id: "d1",
    locationId: "L1",
    scheduleType: "DISTANCE",
    instrumentGroup: "SURFACE",
    distanceOffset: 0,
    tbmChainage: 8300,
    isMeasured: true,
    measuredAt: "2026-01-01T00:00:00.000Z",
    notes: null,
  },
];

const instruments = [
  { id: "i1", locationId: "L1", type: "INCLINOMETER", code: "IN-01" },
  { id: "i2", locationId: "L1", type: "INCLINOMETER", code: "IN-02" },
  { id: "i3", locationId: "L1", type: "PIEZOMETER", code: "PZ-01" },
];

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<LocationCard {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

test("renders banner: name, type badge, STA label + chainage (no actualChainage divergence)", () => {
  const { container, root } = mount({ location, schedules: schedulesMixed, instruments, tbmChainage: 8500 });
  expect(container.textContent).toContain("IS02");
  expect(container.textContent).toContain("Bridge");
  expect(container.textContent).toContain("STA");
  expect(container.textContent).toContain("8+300");
  unmount(container, root);
});

test("REF label + Install STA chip appear when actualChainage differs from chainage", () => {
  const { container, root } = mount({
    location: locationWithInstallChainage,
    schedules: [],
    instruments: [],
    tbmChainage: 8500,
  });
  expect(container.textContent).toContain("REF");
  expect(container.textContent).toContain("Install STA");
  expect(container.textContent).toContain("8+360");
  unmount(container, root);
});

test("status badge: NOT_ACTIVE when far from TBM, COMPLETED when every DISTANCE schedule is measured", () => {
  const { container: c1, root: r1 } = mount({ location, schedules: schedulesMixed, instruments, tbmChainage: 20000 });
  expect(c1.textContent).toContain("Not Active");
  unmount(c1, r1);

  const { container: c2, root: r2 } = mount({ location, schedules: schedulesAllMeasured, instruments, tbmChainage: 20000 });
  expect(c2.textContent).toContain("Completed");
  unmount(c2, r2);
});

test("progress fraction counts N/A as measured (R4a decision, R4-source-map.md §1.2)", () => {
  const schedulesWithNA = [
    {
      id: "d1",
      locationId: "L1",
      scheduleType: "DISTANCE",
      distanceOffset: 0,
      tbmChainage: 8300,
      isMeasured: true,
      measuredAt: null,
      notes: "N/A",
    },
    {
      id: "d2",
      locationId: "L1",
      scheduleType: "DISTANCE",
      distanceOffset: 20,
      tbmChainage: 8280,
      isMeasured: false,
      measuredAt: null,
      notes: null,
    },
  ];
  const { container, root } = mount({ location, schedules: schedulesWithNA, instruments: [], tbmChainage: 20000 });
  expect(container.textContent).toContain("1/2");
  unmount(container, root);
});

test("isApproaching pulse: TBM within (-50,0] of the location shows a pulsing TBM-dist chip", () => {
  // operationalChainage=8300 (no actualChainage), tbmChainage=8330 → distance = 8300-8330 = -30 ∈ (-50,0]
  const { container, root } = mount({ location, schedules: [], instruments: [], tbmChainage: 8330 });
  expect(container.textContent).toContain("TBM Dist: -30 m");
  expect(container.querySelector(".animate-ping")).toBeTruthy();
  unmount(container, root);
});

test("no pulse when TBM distance is outside the (-50,0] approaching window", () => {
  const { container, root } = mount({ location, schedules: [], instruments: [], tbmChainage: 20000 });
  expect(container.querySelector(".animate-ping")).toBeNull();
  unmount(container, root);
});

test("hasPassedAndPending (unmeasured DISTANCE whose trigger the TBM has already passed) rings the card code-d", () => {
  const overdue = [
    {
      id: "d1",
      locationId: "L1",
      scheduleType: "DISTANCE",
      distanceOffset: 0,
      tbmChainage: 8320,
      isMeasured: false,
      measuredAt: null,
      notes: null,
    },
  ];
  const { container, root } = mount({ location, schedules: overdue, instruments: [], tbmChainage: 8300 });
  expect(container.firstElementChild.className).toContain("code-d");
  unmount(container, root);
});

test("no rose ring when nothing is passed-and-pending", () => {
  const { container, root } = mount({ location, schedules: schedulesAllMeasured, instruments: [], tbmChainage: 8300 });
  expect(container.firstElementChild.className).not.toContain("code-d");
  unmount(container, root);
});

test("instruments mini-list groups by type with counts, reusing TYPE_ICON (no emoji)", () => {
  const { container, root } = mount({ location, schedules: [], instruments, tbmChainage: 8500 });
  expect(container.textContent).toContain("Inst. (3)");
  expect(container.textContent).toContain("INCLINOMETER");
  expect(container.textContent).toContain("PIEZOMETER");
  expect(container.textContent).not.toMatch(/[⭕⬜🔺➕🔹]/);
  unmount(container, root);
});

test("mini-list is absent when the location has no instruments", () => {
  const { container, root } = mount({ location, schedules: [], instruments: [], tbmChainage: 8500 });
  expect(container.textContent).not.toContain("Inst. (");
  unmount(container, root);
});

test("reused ScheduleTimeline + LongTermMonitoring sections render inside the card (their own headers appear)", () => {
  const { container, root } = mount({ location, schedules: schedulesMixed, instruments, tbmChainage: 8300 });
  expect(container.textContent).toContain("วาระตรวจวัดตามระยะ"); // ScheduleTimeline's own section header
  expect(container.textContent).toContain("ตรวจวัดระยะยาว"); // LongTermMonitoring's own section header
  unmount(container, root);
});

test("View Details calls onOpenLocation with location.id", () => {
  const onOpenLocation = jest.fn();
  const { container, root } = mount({ location, schedules: [], instruments: [], tbmChainage: 8500, onOpenLocation });
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("View Details"));
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onOpenLocation).toHaveBeenCalledWith("L1");
  unmount(container, root);
});

test("onMark reaches the reused ScheduleTimeline's SchedReportModal for free (no lifted modal state needed)", () => {
  const onMark = jest.fn();
  const schedules = [
    {
      id: "d1",
      locationId: "L1",
      scheduleType: "DISTANCE",
      instrumentGroup: "SURFACE",
      distanceOffset: 0,
      tbmChainage: 8320,
      isMeasured: false,
      measuredAt: null,
      notes: null,
    },
  ];
  const { container, root } = mount({ location, schedules, instruments: [], tbmChainage: 8300, onMark });

  const actionBtn = Array.from(container.querySelectorAll("button")).find((b) => (b.title || "").includes("SURFACE"));
  act(() => {
    actionBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const confirmBtn = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent.includes("ยืนยันตรวจวัดเสร็จสิ้น")
  );
  expect(confirmBtn).toBeTruthy();
  act(() => {
    confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(onMark).toHaveBeenCalledTimes(1);
  expect(onMark.mock.calls[0][0].id).toBe("d1");
  expect(onMark.mock.calls[0][1]).toBe("done");
  unmount(container, root);
});

test("readOnly is forwarded to the reused sections (no write affordance rendered)", () => {
  const schedules = [
    {
      id: "d1",
      locationId: "L1",
      scheduleType: "DISTANCE",
      instrumentGroup: "SURFACE",
      distanceOffset: 0,
      tbmChainage: 8320,
      isMeasured: true,
      measuredAt: "2026-01-01T00:00:00.000Z",
      notes: null,
    },
  ];
  const { container, root } = mount({ location, schedules, instruments: [], tbmChainage: 8300, readOnly: true });
  const actionBtn = Array.from(container.querySelectorAll("button")).find((b) => (b.title || "").includes("SURFACE"));
  act(() => {
    actionBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).not.toContain("อัปเดตวันที่");
  expect(container.textContent).not.toContain("ยกเลิกการบันทึก");
  unmount(container, root);
});

test("renders nothing when location is missing (defensive null-guard)", () => {
  const { container, root } = mount({ location: null, schedules: [], instruments: [] });
  expect(container.textContent).toBe("");
  unmount(container, root);
});

test("does not crash when tbmChainage has not loaded yet (null) — no false-positive ACTIVE/pulse", () => {
  const { container, root } = mount({ location, schedules: schedulesMixed, instruments, tbmChainage: null });
  expect(container.textContent).toContain("Not Active");
  expect(container.textContent).toContain("TBM Dist: -");
  expect(container.querySelector(".animate-ping")).toBeNull();
  unmount(container, root);
});
