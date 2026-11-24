import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import GroutDashboardView from "./GroutDashboardView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The Data Log averaged raw rows: a re-grouted ring counted twice and a blank ratio as 0%, so it
// read 106.8% where Home, Executive and Grout Volume read 107.0% off the same rings.
test("the Data Log average ratio is per ring and ignores blank ratios", () => {
  const rows = [
    { id: "a", ringNo: "P1", ratio: 100, total: 3.1, date: "2026-01-01" },
    { id: "b", ringNo: "P1", ratio: 120, total: 3.72, groutPass: "Re-Grout", date: "2026-01-02" },
    { id: "c", ringNo: "P2", ratio: 110, total: 3.41, date: "2026-01-02" },
    { id: "d", ringNo: "P3", ratio: "", total: "", date: "2026-01-03" },
  ];
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<GroutDashboardView groutRecords={rows} segmentRecords={[]} machine="TBM1" readOnly />));
  const text = container.textContent;
  act(() => root.unmount());
  expect(text).toContain("115.0%");
});
