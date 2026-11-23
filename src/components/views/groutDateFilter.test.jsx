import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import GroutDashboardView from "./GroutDashboardView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The sheet returns a grout date as the instant of Bangkok midnight, i.e. 17:00 UTC the day
// before. Matching that string's prefix put every record one day early in the daily filter.
const grout = { id: "g1", ringNo: "P975", date: "2026-09-23T17:00:00.000Z", shift: "Day", partA: 2, partB: 0.3, total: 2.3, groutPass: "1st Pass" };

test("the daily grout filter shows a record on its own Bangkok date", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-09-24T05:00:00.000Z"));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<GroutDashboardView groutRecords={[grout]} segmentRecords={[]} machine="TBM1" readOnly />));
  const daily = [...container.querySelectorAll("button")].find((b) => b.textContent.trim().toLowerCase().startsWith("daily") || b.textContent.includes("รายวัน"));
  act(() => daily.click());
  const rows = container.querySelectorAll("tbody tr").length;
  act(() => root.unmount());
  jest.useRealTimers();
  expect(rows).toBe(1);
});
