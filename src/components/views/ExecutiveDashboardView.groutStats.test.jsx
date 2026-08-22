import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The 3D alignment map is lazily imported by this page and needs WebGL, which jsdom has not got.
jest.mock("./AlignmentMapView", () => () => null);

import ExecutiveDashboardView from "./ExecutiveDashboardView";
import GroutAnalysisView from "./GroutAnalysisView";

// Three rings, one of them grouted twice, and one whose ratio was never recorded. Averaging the raw
// rows gives 75.0 (300/4); the rule the rest of the app uses — one record per ring, and a blank
// ratio is absent rather than 0% — gives 110.0.
const GROUTS = [
  { id: "g1", ringNo: "P1", machine: "TBM1", date: "2026-08-01", ratio: 100, total: 3.1 },
  { id: "g2", ringNo: "P2", machine: "TBM1", date: "2026-08-02", ratio: "", total: 3.0 },
  { id: "g3", ringNo: "P3", machine: "TBM1", date: "2026-08-03", ratio: 80, total: 2.5 },
  { id: "g4", ringNo: "P3", machine: "TBM1", date: "2026-08-04", ratio: 120, total: 3.7 },
];

// The Executive page shows its empty state until a ring exists, so the KPI row needs one.
const SEGMENTS = [
  { id: "s1", ringNo: "P1", machine: "TBM1", installType: "Permanent", status: "Completed", date: "2026-08-01", length: "1.40", finishCH: "7+664.01" },
];

const mount = (el) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(el); });
  return { container, root };
};

const exec = () => mount(
  <ExecutiveDashboardView segmentRecords={SEGMENTS} groutRecords={GROUTS} dailyReports={[]} machine="TBM1" onNavigate={() => {}} />
);

test("Grout Avg Ratio counts each ring once and ignores rings whose ratio was never recorded", () => {
  // This card read 106.4% on production while the Grout page read 106.8% off the same rings: the
  // re-grouted ring counted twice and three blank ratios counted as zeros.
  const { container, root } = exec();
  expect(container.textContent).toContain("110.0%");   // (100 + 120) / 2 — not (100 + 0 + 80 + 120) / 4
  expect(container.textContent).not.toContain("75.0%");
  act(() => { root.unmount(); });
  container.remove();
});

test("Grout Avg Volume is per ring, and agrees with the ring count printed beside it", () => {
  const { container, root } = exec();
  // three rings: 3.1 + 3.0 + 3.7 (P3's later record) = 9.8 → 3.27, over "(3 rings)" — not four rows
  expect(container.textContent).toContain("3.27 m³");
  expect(container.textContent).toContain("(3 rings)");
  act(() => { root.unmount(); });
  container.remove();
});

test("the Executive card and the Grout page report the same average off the same rings", () => {
  // Both carry the same subtext ("ทุก ring"). Someone comparing the two pages is comparing one
  // number, so the two formulas have to be one formula.
  const e = exec();
  const g = mount(<GroutAnalysisView groutRecords={GROUTS} secondaryGroutRecords={[]} />);
  const pick = (text) => (text.match(/\d+\.\d(?=%)/g) || []).filter((v) => v === "110.0");
  expect(pick(e.container.textContent).length).toBeGreaterThan(0);
  expect(pick(g.container.textContent).length).toBeGreaterThan(0);
  act(() => { e.root.unmount(); g.root.unmount(); });
  e.container.remove(); g.container.remove();
});
