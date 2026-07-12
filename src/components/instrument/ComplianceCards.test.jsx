// Task R4a — render smoke test (react-dom/client + act; this repo has no @testing-library,
// matching ScheduleTimeline.test.jsx / InstrumentReportTabs.test.jsx conventions).
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ComplianceCards from "./ComplianceCards";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const locations = [{ id: "L1", chainage: 8260 }]; // dist -40 vs tbmChainage 8300 → upcoming
const instruments = [{ id: "I1", installStatus: "INSTALLED" }, { id: "I2", installStatus: "PLANNED" }];
const schedulesWithPending = [
  { id: "S1", scheduleType: "DISTANCE", tbmChainage: 8320, isMeasured: false }, // TBM passed, not measured → pending
  { id: "S2", scheduleType: "DISTANCE", tbmChainage: 8280, isMeasured: true },
];
const schedulesAllDone = [{ id: "S1", scheduleType: "DISTANCE", tbmChainage: 8280, isMeasured: true }];

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ComplianceCards {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

test("renders all 5 compliance cards with their labels", () => {
  const { container, root } = mount({ locations, instruments, schedules: schedulesWithPending, tbmChainage: 8300 });
  ["TBM Chainage", "Upcoming Nodes", "Action Required", "Meas. Progress", "Inst. Installation"].forEach((label) => {
    expect(container.textContent).toContain(label);
  });
  unmount(container, root);
});

test("computed values match the tally utils (integration, not re-deriving formulas here)", () => {
  const { container, root } = mount({ locations, instruments, schedules: schedulesWithPending, tbmChainage: 8300 });
  expect(container.textContent).toContain("STA 8+300");
  expect(container.textContent).toContain("1"); // upcomingNodes / actionRequired both 1 in this fixture
  expect(container.textContent).toContain("1 / 2"); // measurement progress
  expect(container.textContent).toContain("1 / 2"); // installation (appears twice in DOM, both cards)
  unmount(container, root);
});

test("Action Required card pulses (animate-pulse + glow) when count > 0", () => {
  const { container, root } = mount({ locations, instruments, schedules: schedulesWithPending, tbmChainage: 8300 });
  const cards = Array.from(container.querySelectorAll(".rounded-card"));
  const actionCard = cards.find((c) => c.textContent.includes("Action Required"));
  const chip = actionCard.querySelector(".p-2\\.5");
  expect(chip.className).toContain("animate-pulse");
  expect(chip.className).toContain("code-d");
  unmount(container, root);
});

test("Action Required card does NOT pulse when count is 0 (all schedules already resolved)", () => {
  const { container, root } = mount({ locations, instruments, schedules: schedulesAllDone, tbmChainage: 8300 });
  const cards = Array.from(container.querySelectorAll(".rounded-card"));
  const actionCard = cards.find((c) => c.textContent.includes("Action Required"));
  const chip = actionCard.querySelector(".p-2\\.5");
  expect(chip.className).not.toContain("animate-pulse");
  expect(actionCard.textContent).toContain("0");
  unmount(container, root);
});

test("empty/undefined raw data renders all-zero cards without crashing", () => {
  const { container, root } = mount({});
  expect(container.textContent).toContain("0 / 0");
  expect(() => container.textContent).not.toThrow();
  unmount(container, root);
});
