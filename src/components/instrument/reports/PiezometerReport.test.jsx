// Task R2c — render smoke test (react-dom/client + act, matching InclinometerReport.test.jsx: this
// repo has no @testing-library). Guards the full-fidelity rewrite: mounts without crashing (jsdom
// has no ResizeObserver — recharts feature-detects and skips it, so this is safe), the 3-sensor
// secondary sub-tabs actually switch the rendered chart/summary, and SummaryStats renders.
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import PiezometerReport from "./PiezometerReport";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function bundleJson(p10, p20, p30) {
  return JSON.stringify({
    type: "PIEZOMETER_BUNDLE",
    piezometers: [
      {
        code: "PI-T1-01-01", label: "10 m", depth: 10, pressure: p10, waterHeight: p10 / 10, waterLevel: p10 / 200,
        thresholds: {
          pressure: { upperAlert: 100, upperAlarm: 110, upperAction: 115, lowerAlert: 90, lowerAlarm: 80, lowerAction: 75 },
          waterLevel: { upperAlert: 1, upperAlarm: 1.5, upperAction: 2.5, lowerAlert: -0.5, lowerAlarm: -1, lowerAction: -1.5 },
        },
      },
      {
        code: "PI-T1-01-02", label: "20 m", depth: 20, pressure: p20, waterHeight: p20 / 10, waterLevel: -5 + p20 / 200,
        thresholds: {
          pressure: { upperAlert: 145, upperAlarm: 155, upperAction: 160, lowerAlert: 130, lowerAlarm: 120, lowerAction: 118 },
          waterLevel: { upperAlert: -4.5, upperAlarm: -3.5, upperAction: -3, lowerAlert: -5.5, lowerAlarm: -7, lowerAction: -8 },
        },
      },
      {
        code: "PI-T1-01-03", label: "30 m", depth: 30, pressure: p30, waterHeight: p30 / 10, waterLevel: -20 + p30 / 200,
        thresholds: {
          pressure: { upperAlert: 98, upperAlarm: 108, upperAction: 113, lowerAlert: 88, lowerAlarm: 78, lowerAction: 68 },
          waterLevel: { upperAlert: -19, upperAlarm: -17.5, upperAction: -17, lowerAlert: -21, lowerAlarm: -21.5, lowerAction: -22 },
        },
      },
    ],
  });
}

const instruments = [{ id: "pi-1", code: "P385", type: "PIEZOMETER" }];
const readings = [
  { instrumentId: "pi-1", date: "2026-01-01", tbmChainage: 8150, sourcePdf: "preset-8+300", profileJson: bundleJson(94, 138, 92) },
  { instrumentId: "pi-1", date: "2026-01-15", tbmChainage: 8250, sourcePdf: "preset-8+300", profileJson: bundleJson(94.8, 137.6, 89.9) },
  { instrumentId: "pi-1", date: "2026-02-01", tbmChainage: 8300, sourcePdf: "preset-8+300", profileJson: bundleJson(96.1, 136.2, 80) },
];

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<PiezometerReport {...props} />); });
  return { container, root };
}

test("renders EmptyState when there is no matching reading", () => {
  const { container, root } = mount({ instruments: [], readings: [] });
  expect(container.textContent).toMatch(/ยังไม่มีข้อมูล/);
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("mounts without crashing and shows the 3-sensor sub-tabs, code, and Summary", () => {
  const { container, root } = mount({ instruments, readings });
  expect(container.textContent).toContain("P385");
  expect(container.textContent).toContain("Vibrating Wire Piezometer (3 sensors)");
  expect(container.textContent).toContain("10 m");
  expect(container.textContent).toContain("20 m");
  expect(container.textContent).toContain("30 m");
  expect(container.textContent).toContain("Measured Water Pressure — 10 m");
  expect(container.textContent).toContain("Water Level (m MSL) — 10 m");
  expect(container.textContent).toContain("Summary — PI-T1-01-01 (10 m)");
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

test("clicking the 20 m sub-tab switches the rendered chart titles and summary", () => {
  const { container, root } = mount({ instruments, readings });
  const buttons = Array.from(container.querySelectorAll("button"));
  const tab20 = buttons.find((b) => b.textContent.includes("20 m"));
  expect(tab20).toBeTruthy();
  act(() => { tab20.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(container.textContent).toContain("Measured Water Pressure — 20 m");
  expect(container.textContent).toContain("Water Level (m MSL) — 20 m");
  expect(container.textContent).toContain("Summary — PI-T1-01-02 (20 m)");
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});
