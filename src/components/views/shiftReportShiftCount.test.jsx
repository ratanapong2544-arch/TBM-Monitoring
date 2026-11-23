import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ShiftReportView from "./ShiftReportView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../utils/api", () => ({ apiCall: jest.fn(async () => ({ status: "success" })) }));

// A ring with no installShift column (every TBM2 ring before GAS @25) was counted in BOTH shift
// reports of its day: once by the shift its install time falls in, and again by the record's own
// Working Shift. The Report page counts it once, by install time.
const ring = { id: "s1", ringNo: "P20", startCH: "", finishCH: "", length: "1.40", status: "Completed",
  installType: "Permanent", date: "2026-09-22", shift: "Day", installStartTime: "21:30" };

const countFor = (shift) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(
    <ShiftReportView projectInfo={{ date: "2026-09-22", shift, location: "x", tbmNo: "TBM2" }}
      segmentRecords={[ring]} shiftReports={[]} machine="TBM2" onMutate={() => Promise.resolve({})} />
  ));
  const value = container.querySelector('[name="numberRing"]').value;
  act(() => root.unmount());
  return value;
};

test("a ring without installShift is counted in the shift its install time falls in, and only there", () => {
  expect(countFor("Night")).toBe("1");
  expect(countFor("Day")).toBe("");
});
