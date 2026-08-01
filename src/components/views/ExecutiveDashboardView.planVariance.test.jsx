import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The 3D alignment map is lazily imported by this page and needs a WebGL-capable environment that
// jsdom does not have. It is not what this test is about.
jest.mock("./AlignmentMapView", () => () => null);

import ExecutiveDashboardView from "./ExecutiveDashboardView";

test("the plan-variance figure is read from the distance plan this machine was given", () => {
  // Owner-facing, and it was wired to a prop nothing asserted: passing `null` was invisible, so a
  // machine could have been shown another machine's variance, or none, without a test noticing.
  const props = {
    segmentRecords: [{ id: "s1", ringNo: "P1", machine: "TBM1", installType: "Permanent", date: "2026-08-01" }],
    groutRecords: [], dailyReports: [], machine: "TBM1", onNavigate: () => {},
    distPlanConfig: { ranges: [{ startMonth: "2020-01", endMonth: "2030-12", mode: "distance", distancePerMonth: 120 }] },
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<ExecutiveDashboardView {...props} />); });

  // months of plan against one ring bored: the card says how far behind
  expect(container.textContent).toContain("ช้ากว่าแผน");

  act(() => { root.render(<ExecutiveDashboardView {...props} distPlanConfig={null} />); });
  expect(container.textContent).not.toContain("ช้ากว่าแผน");

  act(() => { root.unmount(); });
  container.remove();
});
