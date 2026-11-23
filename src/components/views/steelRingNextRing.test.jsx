import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import SegmentRecordView from "./SegmentRecordView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A steel ring (SX, 0.90 m) is a one-off: in the records every SX is followed by a C1. After the
// steel ring was saved the form carried SX/0.90 on to the next ring, so its chainage and soil
// volume were computed for a 0.90 m ring unless the crew noticed.
const rings = [
  { id: "seg_p2", ringNo: "P2", installType: "Permanent", typeRing: "C1", keyPos: 12, length: 1.4, startCH: "0+010.00", finishCH: "0+008.60", status: "Completed" },
  { id: "seg_p3", ringNo: "P3", installType: "Permanent", typeRing: "C1", keyPos: 1, length: 1.4, startCH: "0+008.60", finishCH: "0+007.20", status: "In Progress", excavStartTime: "09:38" },
];

const change = (container, name, value) => act(() => {
  const field = container.querySelector(`[name="${name}"]`);
  const proto = field.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
  field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});

test("the ring after a steel ring starts as C1, 1.40 m", async () => {
  const onMutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <SegmentRecordView projectInfo={{ date: "2026-09-09", shift: "Day" }} handleProjectInfoChange={() => {}} segmentRecords={rings}
      setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" syncMeta={{}} onMutate={onMutate} />
  ));
  change(container, "typeRing", "SX");
  change(container, "installEndTime", "12:00");
  await act(async () => { container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate.mock.calls[0][0].payload).toMatchObject({ ringNo: "P3", typeRing: "SX", length: "0.90" });
  const v = (n) => container.querySelector(`[name="${n}"]`).value;
  expect(v("ringNo")).toBe("P4");
  expect(v("typeRing")).toBe("C1");
  expect(v("length")).toBe("1.40");
  act(() => root.unmount());
});
