// Task R2b — render smoke test (react-dom/client + act, matching HeadCutter3D.test.jsx: this
// repo has no @testing-library). Guards the full-fidelity rewrite: mounts without crashing (jsdom
// has no ResizeObserver — recharts feature-detects and skips it, so this is safe), dual-axis +
// station-overlay data builds without throwing, and the per-ring Summary renders.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ExtensometerReport from "./ExtensometerReport";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function profileJson(datum, ring5, ring4) {
  return JSON.stringify({
    points: [
      { depth: 27, label: "Datum", a: datum },
      { depth: 24, label: "Ring #5", a: ring5 },
      { depth: 20, label: "Ring #4", a: ring4 },
    ],
    _thresholds: { alert: 15, alarm: 17, action: 20 },
  });
}

const instruments = [{ id: "ext-1", code: "EX-T1-01", type: "EXTENSOMETER" }];
const readings = [
  { instrumentId: "ext-1", date: "2026-01-01", tbmChainage: 8150, profileJson: profileJson(0, 0, 0) },
  { instrumentId: "ext-1", date: "2026-01-15", tbmChainage: 8250, profileJson: profileJson(1, -3.5, 0.5) },
  { instrumentId: "ext-1", date: "2026-02-01", tbmChainage: 8320, profileJson: profileJson(1.5, -2, 1) },
];

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<ExtensometerReport {...props} />); });
  return { container, root };
}

test("renders EmptyState when there is no matching reading", () => {
  const { container, root } = mount({ instruments: [], readings: [], thresholds: [] });
  expect(container.textContent).toMatch(/ยังไม่มีข้อมูล/);
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("mounts without crashing and shows ring grouping, station overlay data, and Summary by ring", () => {
  const { container, root } = mount({ instruments, readings, thresholds: [] });
  expect(container.textContent).toContain("EX-T1-01");
  expect(container.textContent).toContain("Magnetic Extensometer");
  expect(container.textContent).toContain("Time History — by ring");
  expect(container.textContent).toContain("Ring #5");
  expect(container.textContent).toContain("Summary by ring");
  // all-time peak (Ring #5 @ -3.5 on 2026-01-15) drives the maxLine banner, not the latest reading
  expect(container.textContent).toContain("Ring #5");
  expect(container.textContent).toMatch(/-3\.5|−3\.5/);
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});
