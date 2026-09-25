// % complete and the pace target divide by the route of the machine on screen, not TBM1's.
// TBM2 2026-09-25: the Stats Report showed 26.10 m as 0.29 % "จากระยะรวม 8,874.683 ม." (TBM1,
// รัชดา→บางบัว) and Segment Trend aimed TBM2 at 6,460 rings — TBM2 runs รัชดา→ปากคลองซุง, 4,726 m.
// No @testing-library here → react-dom/client + act, like the other *.test.jsx files.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ReportView from "./ReportView";
import SegmentAnalysisView from "./SegmentAnalysisView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// TBM2 as the sheet holds it after the P3 fix: 18 C1 rings of 1.40 m + the steel Omega ring P3 at
// 0.90 m = 26.10 m, the figure the site team gave for P19.
const RINGS = Array.from({ length: 19 }, (_, i) => ({
  id: `seg_p${i + 1}`, ringNo: `P${i + 1}`, typeRing: "C1", keyPos: 1,
  length: i + 1 === 3 ? 0.9 : 1.4, date: "2026-09-01", shift: "Day",
  status: "Completed", installType: "Permanent",
}));

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

// the card a label sits in — the label's own box is inside it
const cardOf = (container, label) =>
  [...container.querySelectorAll("div")].find((d) => d.textContent === label).parentElement.textContent;

const report = (machine) => (
  <ReportView segmentRecords={RINGS} groutRecords={[]} shiftReports={[]} machine={machine}
    projectInfo={{ tbmNo: machine, location: "L" }} />
);

test("Stats Report: TBM2 % complete is over TBM2's own route", () => {
  const view = render(report("TBM2"));
  const card = cardOf(view.container, "% ผลงานแล้วเสร็จ");
  expect(card).toContain("0.55");                  // 26.10 / 4,726
  expect(card).toContain("จากระยะรวม 4,726 ม.");
  view.unmount();
});

test("Stats Report: TBM1 keeps its route", () => {
  const view = render(report("TBM1"));
  const card = cardOf(view.container, "% ผลงานแล้วเสร็จ");
  expect(card).toContain("0.29");                  // 26.10 / 8,874.683
  expect(card).toContain("จากระยะรวม 8,874.683 ม.");
  view.unmount();
});

const trend = (machine) => (
  <SegmentAnalysisView segmentRecords={RINGS} projectInfo={{ tbmNo: machine }} machine={machine} onMutate={jest.fn()} syncMeta={{}} />
);

test("Segment Trend: TBM2's ring target comes from TBM2's route", () => {
  const view = render(trend("TBM2"));
  expect(view.container.textContent).toContain("19 / 3,440 ริง");   // round(4,726 / (26.10 / 19))
  view.unmount();
});

test("Segment Trend: TBM1's ring target is unchanged", () => {
  const view = render(trend("TBM1"));
  expect(view.container.textContent).toContain("19 / 6,460 ริง");   // round(8,874.683 / (26.10 / 19))
  view.unmount();
});
