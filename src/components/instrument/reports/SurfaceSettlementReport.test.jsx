// Task R2c — render smoke test (react-dom/client + act, matching InclinometerReport.test.jsx: this
// repo has no @testing-library). Guards the full-fidelity rewrite: mounts without crashing (jsdom
// has no ResizeObserver — recharts feature-detects and skips it, so this is safe), the 2-group
// secondary sub-tabs actually switch the rendered chart/table/summary, and the dual-axis Time
// History + Settlement Profile + SummaryStats all render.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import SurfaceSettlementReport from "./SurfaceSettlementReport";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function thresholdsJson() {
  return JSON.stringify({ type: "SETTLEMENT_POINT", _thresholds: { alert: 15, alarm: 17, action: 20 } });
}

// Mirrors the real seed: 8 points left-to-right by blueprintX, codes P363-L3..P363-R4.
const CODES = ["P363-L3", "P363-L2", "P363-L1", "P363", "P363-R1", "P363-R2", "P363-R3", "P363-R4"];
const instruments = CODES.map((code, i) => ({ id: `ss-${i + 1}`, code, type: "SETTLEMENT_POINT", blueprintX: 40 + i * 5 }));

const DATES = ["2026-01-01", "2026-01-15", "2026-02-01"];
const VALUES = {
  "ss-1": [0, -1, -3], "ss-2": [0, -2, -4], "ss-3": [0, -1, -3], "ss-4": [0, -1, -2],
  "ss-5": [0, 0, 1], "ss-6": [0, -1, 0], "ss-7": [0, -2, -1], "ss-8": [0, 1, -8],
};
const readings = instruments.flatMap((inst) => DATES.map((date, di) => ({
  instrumentId: inst.id, date, tbmChainage: 8150 + di * 75, valuePrimary: VALUES[inst.id][di], profileJson: thresholdsJson(),
})));

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<SurfaceSettlementReport {...props} />); });
  return { container, root };
}

test("renders EmptyState when there is no matching reading", () => {
  const { container, root } = mount({ instruments: [], readings: [], thresholds: [] });
  expect(container.textContent).toMatch(/ยังไม่มีข้อมูล/);
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("mounts without crashing and shows the 01-04/05-08 group tabs, code, and Summary", () => {
  const { container, root } = mount({ instruments, readings, thresholds: [] });
  expect(container.textContent).toContain("SS-T1");
  expect(container.textContent).toContain("Surface Settlement Points (2 groups, 8 points)");
  expect(container.textContent).toContain("01-04");
  expect(container.textContent).toContain("05-08");
  expect(container.textContent).toContain("Time History — 01-04");
  expect(container.textContent).toContain("Settlement Profile — 01-04");
  expect(container.textContent).toContain("Summary — 01-04");
  expect(container.textContent).toContain("P363-L3");
  // all-time peak across ALL 8 points/dates (P363-R4, -8 on 2026-02-01), not just the active group
  expect(container.textContent).toContain("P363-R4");
  expect(container.textContent).toMatch(/-8\.0|−8\.0/);
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("clicking the 05-08 group tab switches the rendered chart titles and table columns", () => {
  const { container, root } = mount({ instruments, readings, thresholds: [] });
  const buttons = Array.from(container.querySelectorAll("button"));
  const tab2 = buttons.find((b) => b.textContent.includes("05-08"));
  expect(tab2).toBeTruthy();
  act(() => { tab2.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(container.textContent).toContain("Time History — 05-08");
  expect(container.textContent).toContain("Settlement Profile — 05-08");
  expect(container.textContent).toContain("Summary — 05-08");
  expect(container.textContent).toContain("P363-R4");
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});
