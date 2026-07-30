import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import SegmentRecordView from "./SegmentRecordView";
import GroutRecordView from "./GroutRecordView";

// A record form left open across a machine switch kept the previous machine's ring number and
// chainage. Both prefill effects are guarded on an empty ringNo, so they never corrected it, and a
// submit wrote one machine's ring sequence and CH into the other machine's sheet — the ring numbers
// must stay sequential per machine and the chainage is a real surveyed value.
const projectInfo = { date: "2026-07-30", shift: "Day", location: "L", tbmNo: "TBM1" };

function render(element) {
  let container;
  let root;
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(element);
  });
  return {
    container,
    value: name => {
      const field = container.querySelector(`[name="${name}"]`);
      return field ? field.value : null;
    },
    rerender: next => act(() => { root.render(next); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

const tbm1Segments = [
  { id: "s1", ringNo: "P643", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent" },
];

test("a segment form drops the previous machine's ring and chainage on a machine switch", () => {
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={tbm1Segments}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  // prefilled from TBM1's last ring
  expect(view.value("ringNo")).toBe("P644");
  expect(view.value("startCH")).toBe("8+008.80");

  // switching machine also empties the rows (App gates them), so nothing may re-prefill
  view.rerender(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={[]}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );

  expect(view.value("ringNo")).toBe("");
  expect(view.value("startCH")).toBe("");
  expect(view.value("finishCH")).toBe("");
  view.unmount();
});

test("a segment form keeps its prefill across an unrelated re-render", () => {
  const element = machineProps => (
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={tbm1Segments}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} {...machineProps} />
  );
  const view = render(element({ machine: "TBM1" }));
  expect(view.value("ringNo")).toBe("P644");

  view.rerender(element({ machine: "TBM1" }));

  expect(view.value("ringNo")).toBe("P644");
  view.unmount();
});

test("a grout form drops the previous machine's ring on a machine switch", () => {
  const grouts = [{ id: "g1", ringNo: "P640", partA: "1", partB: "1", pressure: "2.5" }];
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={grouts}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={tbm1Segments} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  const before = view.value("ringNo");
  expect(before).toBeTruthy();

  view.rerender(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={[]}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={[]} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );

  expect(view.value("ringNo")).toBe("");
  view.unmount();
});
