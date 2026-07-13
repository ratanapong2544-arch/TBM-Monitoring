// Task R2b — render smoke test (react-dom/client + act, matching HeadCutter3D.test.jsx: this
// repo has no @testing-library). Guards the full-fidelity rewrite: mounts without crashing (jsdom
// has no ResizeObserver — recharts feature-detects and skips it, so this is safe) and the A/B
// sub-tab actually switches the rendered content.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import InclinometerReport from "./InclinometerReport";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function profileJson(aBase, bBase) {
  return JSON.stringify({
    points: [
      { depth: 0, a: aBase, b: bBase },
      { depth: 5, a: aBase + 1, b: bBase - 1 },
      { depth: 10, a: aBase + 2, b: bBase - 2 },
      { depth: 35, a: aBase - 1, b: bBase + 1 },
    ],
    _thresholds: { alert: 15, alarm: 17, action: 20 },
  });
}

const instruments = [{ id: "inc-1", code: "INC-T1-01", type: "INCLINOMETER" }];
const readings = [
  { instrumentId: "inc-1", date: "2026-01-01", tbmChainage: 8150, profileJson: profileJson(1, -1) },
  { instrumentId: "inc-1", date: "2026-01-15", tbmChainage: 8220, profileJson: profileJson(2, -2) },
  { instrumentId: "inc-1", date: "2026-02-01", tbmChainage: 8300, profileJson: profileJson(-3.27, 5.83) },
];

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<InclinometerReport {...props} />); });
  return { container, root };
}

test("renders EmptyState when there is no matching reading", () => {
  const { container, root } = mount({ instruments: [], readings: [], thresholds: [] });
  expect(container.textContent).toMatch(/ยังไม่มีข้อมูล/);
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("mounts without crashing and shows A/B sub-tabs, code, and Summary by depth", () => {
  const { container, root } = mount({ instruments, readings, thresholds: [] });
  expect(container.textContent).toContain("INC-T1-01");
  expect(container.textContent).toContain("A-Axis");
  expect(container.textContent).toContain("B-Axis");
  expect(container.textContent).toContain("Summary by depth — A-Axis");
  expect(container.textContent).toContain("Time History — A-Axis");
  expect(container.textContent).toContain("Depth Profile — A-Axis");
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("clicking the B-Axis sub-tab switches the rendered chart titles and summary", () => {
  const { container, root } = mount({ instruments, readings, thresholds: [] });
  const buttons = Array.from(container.querySelectorAll("button"));
  const bTab = buttons.find((b) => b.textContent.includes("B-Axis"));
  expect(bTab).toBeTruthy();
  act(() => { bTab.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(container.textContent).toContain("Time History — B-Axis");
  expect(container.textContent).toContain("Depth Profile — B-Axis");
  expect(container.textContent).toContain("Summary by depth — B-Axis");
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});
