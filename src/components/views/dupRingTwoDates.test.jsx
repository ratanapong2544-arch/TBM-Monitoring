import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import SegmentDashboardView from "./SegmentDashboardView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// TBM1 P172 has Completed rows dated 26 and 27 Feb. The Data Log filtered by date and THEN deduped,
// so P172 counted on both days, while the Stats Report (dedupe first) counted it once, on the 27th.
const ring = (date) => ({ id: `s_${date}`, ringNo: "P172", date: `${date}T00:00:00+07:00`, shift: "Day", status: "Completed", installType: "Permanent", length: 1.4, typeRing: "C1" });

test("a ring recorded on two dates is listed on one day only", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-02-26T03:00:00.000Z"));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<SegmentDashboardView segmentRecords={[ring("2026-02-27"), ring("2026-02-26"), ring("2026-02-27")]} machine="TBM1" syncMeta={{}} />));
  const daily = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Daily");
  act(() => daily.click());
  const rows = [...container.querySelectorAll("tbody tr")].filter((r) => r.textContent.includes("P172")).length;
  act(() => root.unmount());
  jest.useRealTimers();
  expect(rows).toBe(0);
});
