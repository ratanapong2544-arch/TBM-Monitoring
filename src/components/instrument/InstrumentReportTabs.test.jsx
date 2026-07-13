// Task R2c — render smoke test (react-dom/client + act, matching InclinometerReport.test.jsx: this
// repo has no @testing-library). Guards the ReportHeader + primary icon TabBar rewrite: only tabs
// for instrument types present at the location render, the header derives its fields from real
// data with graceful "—"/"-" fallback (never fabricated), the optional `machineProgress` prop is
// safe to omit (current caller behavior preserved) and drives TBM STA/Ring when supplied, and
// clicking a different primary tab switches the rendered report.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import InstrumentReportTabs from "./InstrumentReportTabs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function incProfileJson() {
  return JSON.stringify({ points: [{ depth: 0, a: 0, b: 0 }, { depth: 35, a: 1, b: -1 }], _thresholds: { alert: 15, alarm: 17, action: 20 } });
}
function piBundleJson() {
  return JSON.stringify({
    type: "PIEZOMETER_BUNDLE",
    piezometers: [{ code: "PI-T1-01-01", label: "10 m", depth: 10, pressure: 94, waterHeight: 9.6, waterLevel: 0.43, thresholds: null }],
  });
}

const location = { id: "loc-1", name: "Above Tunnel 8+300", chainage: 8300, actualChainage: 8360 };
const instruments = [
  { id: "inc-1", code: "P390", type: "INCLINOMETER" },
  { id: "pi-1", code: "P385", type: "PIEZOMETER" },
];
const readings = [
  { instrumentId: "inc-1", date: "2026-01-01", tbmChainage: 8150, sourcePdf: "preset-8+300", profileJson: incProfileJson() },
  { instrumentId: "pi-1", date: "2026-02-01", tbmChainage: 8300, sourcePdf: "preset-8+300", profileJson: piBundleJson() },
];

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<InstrumentReportTabs {...props} />); });
  return { container, root };
}

test("renders null when no instrument type is present", () => {
  const { container, root } = mount({ location, instruments: [], readings: [], thresholds: [] });
  expect(container.textContent).toBe("");
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("shows only tabs for types present, ReportHeader fields, and defaults to the first type's report", () => {
  const { container, root } = mount({ location, instruments, readings, thresholds: [] });
  expect(container.textContent).toContain("Measurement Report");
  expect(container.textContent).toContain("Above Tunnel 8+300");
  expect(container.textContent).toContain("preset-8+300"); // Source ← readings[].sourcePdf
  expect(container.textContent).toContain("8+300"); // Cover STA ← stationLabel(location.chainage)
  expect(container.textContent).toContain("8+360"); // Instrument STA ← location.actualChainage
  expect(container.textContent).toContain("Inclinometer");
  expect(container.textContent).toContain("Piezometer");
  expect(container.textContent).not.toContain("Extensometer");
  expect(container.textContent).not.toContain("Surface Settlement");
  expect(container.textContent).toContain("Borehole Inclinometer"); // default tab = first present type (INC)
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("TBM STA falls back gracefully without machineProgress, and shows STA + Ring when supplied", () => {
  const { container: c1, root: r1 } = mount({ location, instruments, readings, thresholds: [] });
  expect(c1.textContent).toContain("TBM STA -");
  expect(c1.textContent).not.toContain("Ring #");
  act(() => { r1.unmount(); });
  document.body.removeChild(c1);

  const machineProgress = { TBM1: { dist: 200, rings: 100 } };
  const { container: c2, root: r2 } = mount({ location, instruments, readings, thresholds: [], machineProgress });
  expect(c2.textContent).toContain("TBM STA 8+630");
  expect(c2.textContent).toContain("Ring #100");
  act(() => { r2.unmount(); });
  document.body.removeChild(c2);
});

test("R7b: honors threaded activeMachine — TBM2 is gated (no valid launch CH) so TBM STA shows '-', never a TBM1-derived or computed-TBM2 number", () => {
  // Both machines present. If still hardcoded to TBM1 it would show TBM1's dist=200 → 'TBM STA 8+630'.
  // If it computed TBM2 ungated it would show dist=0 → 'STA 8+830'. Gated → 'TBM STA -'.
  const machineProgress = { TBM1: { dist: 200, rings: 100 }, TBM2: { dist: 0 } };
  const { container, root } = mount({ location, instruments, readings, thresholds: [], machineProgress, activeMachine: "TBM2" });
  expect(container.textContent).toContain("TBM STA -");
  expect(container.textContent).not.toContain("8+630"); // not TBM1's position
  expect(container.textContent).not.toContain("8+830"); // not a computed TBM2 position
  expect(container.textContent).not.toContain("Ring #100"); // ring reads the active machine (TBM2), not TBM1
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("clicking the Piezometer tab switches the rendered report", () => {
  const { container, root } = mount({ location, instruments, readings, thresholds: [] });
  const buttons = Array.from(container.querySelectorAll("button"));
  const piTab = buttons.find((b) => b.textContent.includes("Piezometer"));
  expect(piTab).toBeTruthy();
  act(() => { piTab.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(container.textContent).toContain("Vibrating Wire Piezometer");
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});
