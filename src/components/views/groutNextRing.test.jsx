import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import GroutRecordView from "./GroutRecordView";

// Grouting runs one ring at a time, a fixed distance behind the excavation. The form's job is to
// offer the ring the crew is about to grout — the one after the last one they grouted — and it used
// to offer the one after THAT, skipping a ring on every shift the crew did not correct it by hand.
// The production sheet has grouted P838, P839, P840, P841, P842 on consecutive shifts: +1, always.
const projectInfo = { date: "2026-08-06", shift: "Night", location: "L", tbmNo: "TBM1" };
const onMutate = () => Promise.resolve({});

const segments = ["P841", "P842", "P843", "P844", "P845", "P846"].map((ringNo, i) => ({
  id: `s${i}`, ringNo, typeRing: "C1", keyPos: "2", length: "1.40", status: "Completed", installType: "Permanent",
}));
const grouts = ["P841", "P842"].map((ringNo, i) => ({ id: `g${i}`, ringNo, groutPass: "1st Pass" }));

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
    value: name => {
      const field = container.querySelector(`[name="${name}"]`);
      return field ? field.value : null;
    },
    type: (name, value) => act(() => {
      const field = container.querySelector(`[name="${name}"]`);
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }),
    submit: async () => { await act(async () => { container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); },
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

const mount = (groutRecords, segmentRecords) => render(
  <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={groutRecords}
    secondaryGroutRecords={[]} segmentRecords={segmentRecords} setCurrentModule={() => {}}
    setActiveTab={() => {}} machine="TBM1" onMutate={onMutate} />
);

test("the next ring to grout is the one after the last grouted, not two after", () => {
  const view = mount(grouts, segments);

  expect(view.value("ringNo")).toBe("P843");
  view.unmount();
});

test("the excavation ring stays three ahead of the ring being grouted", () => {
  // unchanged by the fix above, and asserted beside it because the two offsets sit on adjacent
  // lines: P843 is grouted while the machine has already excavated P846
  const view = mount(grouts, segments);

  expect(view.value("excavRing")).toBe("P846");
  view.unmount();
});

test("saving advances to the next ring by one, like the prefill", async () => {
  // The other place a ring is proposed, and the only one a shift that grouts two rings back to back
  // ever sees — the prefill is guarded on an empty ring number and never runs again.
  const view = mount(grouts, segments);
  expect(view.value("ringNo")).toBe("P843");
  view.type("partA", "2.89"); // the submit refuses without a Part A volume

  await view.submit();

  expect(view.value("ringNo")).toBe("P844");
  view.unmount();
});

test("a last grouted ring the segment history does not hold still advances by one", () => {
  // the fallback path, for a grout record whose ring was never recorded as a segment
  const view = mount([{ id: "g0", ringNo: "P900", groutPass: "1st Pass" }], segments);

  expect(view.value("ringNo")).toBe("P901");
  view.unmount();
});
