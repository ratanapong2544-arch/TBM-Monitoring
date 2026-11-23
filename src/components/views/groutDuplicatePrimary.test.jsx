import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import GroutRecordView from "./GroutRecordView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A second primary grout on a ring is refused by the server (one primary per ring), yet the form
// said it could still be saved — so the crew retried a save that could never land.
test("a second primary grout on the same ring cannot be submitted, and the form says where to go instead", async () => {
  const onMutate = jest.fn(async () => ({}));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <GroutRecordView projectInfo={{ date: "2026-09-24", shift: "Day" }} handleProjectInfoChange={() => {}}
      groutRecords={[{ id: "g1", ringNo: "P840", groutPass: "1st Pass", partA: 2, partB: 0.3 }]} secondaryGroutRecords={[]}
      segmentRecords={[]} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" onMutate={onMutate} syncMeta={{}} />
  ));
  const type = (name, value) => act(() => {
    const f = container.querySelector(`[name="${name}"]`);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(f, value);
    f.dispatchEvent(new Event("input", { bubbles: true }));
  });
  type("ringNo", "P840");
  type("partA", "2.5");
  await act(async () => { container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

  expect(onMutate).not.toHaveBeenCalled();
  expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
  expect(container.textContent).toContain("Data Log");
  expect(container.textContent).not.toContain("ยังบันทึก primary ซ้ำได้");
  act(() => root.unmount());
});
