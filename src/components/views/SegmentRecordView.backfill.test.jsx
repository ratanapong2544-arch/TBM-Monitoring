import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import SegmentRecordView from "./SegmentRecordView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A ring the crew forgot, recorded after later rings (TBM2 2026-09-14: P1 after P5). The form holds
// the open ring by its row id, so typing P1 over it was an edit of P5 and refused — and a ring typed
// over the prefilled next ring inherited that ring's chainage (P888, 2026-09-02). These assert what
// was SENT, like `coreWrites.integration.test.jsx`.
const projectInfo = { date: "2026-09-14", shift: "Day" };
const noop = () => {};

const tbm2 = [
  { id: "seg_p2", ringNo: "P2", installType: "Permanent", typeRing: "C1", keyPos: 12, length: 1.4, startCH: "", finishCH: "", status: "Completed" },
  { id: "seg_p3", ringNo: "P3", installType: "Permanent", typeRing: "C1", keyPos: 1, length: 1.4, startCH: "0+000.00", finishCH: "-0+001.40", status: "Completed" },
  { id: "seg_p4", ringNo: "P4", installType: "Permanent", typeRing: "C1", keyPos: 3, length: 1.4, startCH: "-0+001.40", finishCH: "-0+002.80", status: "Completed" },
  { id: "seg_p5", ringNo: "P5", installType: "Permanent", typeRing: "C1", keyPos: 14, length: 1.4, startCH: "-0+002.80", finishCH: "-0+004.20", status: "In Progress", excavStartTime: "09:38" },
];

function render(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const element = extra => (
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={noop} segmentRecords={tbm2} setCurrentModule={noop}
      setActiveTab={noop} machine="TBM2" syncMeta={{}} {...props} {...extra} />
  );
  act(() => { root.render(element()); });
  return {
    container,
    rerender: extra => act(() => { root.render(element(extra)); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

function type(container, name, value) {
  act(() => {
    const field = container.querySelector(`[name="${name}"]`);
    if (!field) throw new Error(`no field named ${name}`);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
const click = async (element) => {
  if (!element) throw new Error("no such control");
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const submit = async (container) => {
  await act(async () => {
    container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};
const sent = (onMutate, n) => onMutate.mock.calls[n][0];

let onMutate;
let alertSpy;
beforeEach(() => {
  onMutate = jest.fn(async () => ({ optimisticRecord: {} }));
  alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

async function recordForgottenRing(container, { installEndTime } = {}) {
  await click(button(container, /กรอกย้อนหลัง/));
  type(container, "ringNo", "P1");
  type(container, "date", "2026-08-31");
  if (installEndTime) type(container, "installEndTime", installEndTime);
  await submit(container);
}

test("a forgotten ring is recorded while the current ring is still open, and the open ring is left alone", async () => {
  const view = render({ onMutate });
  await recordForgottenRing(view.container, { installEndTime: "12:00" });

  expect(alertSpy).not.toHaveBeenCalled();
  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(sent(onMutate, 0)).toEqual(expect.objectContaining({
    entityType: "segment", operation: "create", machine: "TBM2", domainKey: "segment:TBM2:P1:Permanent", baseVersion: 0,
  }));
  expect(sent(onMutate, 0).recordId).not.toBe("seg_p5");
  view.unmount();
});

test("a forgotten ring starts blank: no chainage or times carried over, and its own date", async () => {
  const view = render({ onMutate });
  await recordForgottenRing(view.container);

  expect(sent(onMutate, 0).payload).toEqual(expect.objectContaining({
    ringNo: "P1", date: "2026-08-31", startCH: "", finishCH: "", excavStartTime: "", installStartTime: "",
  }));
  view.unmount();
});

test("a forgotten ring's excavation and installation shifts follow its own shift", async () => {
  // they were seeded from today's Working Shift, which says nothing about a ring from another day —
  // and the shift report attributes a ring to a shift by them
  const view = render({ onMutate });
  await click(button(view.container, /กรอกย้อนหลัง/));
  act(() => {
    const field = view.container.querySelector('select[name="shift"]');
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(field, "Night");
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
  type(view.container, "ringNo", "P1");
  type(view.container, "date", "2026-08-31");
  await submit(view.container);

  expect(sent(onMutate, 0).payload).toEqual(expect.objectContaining({ shift: "Night", excavShift: "Night", installShift: "Night" }));
  view.unmount();
});

test("a forgotten ring is not saved without its own date", async () => {
  const view = render({ onMutate });
  await click(button(view.container, /กรอกย้อนหลัง/));
  type(view.container, "ringNo", "P1");
  await submit(view.container);

  expect(onMutate).not.toHaveBeenCalled();
  view.unmount();
});

test("once the forgotten ring is completed, the next save is the open ring again, under the Working Date", async () => {
  const view = render({ onMutate });
  await recordForgottenRing(view.container, { installEndTime: "12:00" });
  await submit(view.container);

  expect(sent(onMutate, 1)).toEqual(expect.objectContaining({ operation: "update", recordId: "seg_p5", domainKey: "segment:TBM2:P5:Permanent" }));
  expect(sent(onMutate, 1).payload.date).toBe("2026-09-14");
  view.unmount();
});

test("a forgotten ring saved as partial stays in the form until it is completed", async () => {
  const view = render({ onMutate });
  await recordForgottenRing(view.container);
  const created = sent(onMutate, 0).recordId;
  await submit(view.container);

  expect(sent(onMutate, 1)).toEqual(expect.objectContaining({ operation: "update", recordId: created, domainKey: "segment:TBM2:P1:Permanent" }));
  expect(sent(onMutate, 1).payload.date).toBe("2026-08-31");

  type(view.container, "installEndTime", "12:00");
  await submit(view.container);
  await submit(view.container);
  expect(sent(onMutate, 3)).toEqual(expect.objectContaining({ operation: "update", recordId: "seg_p5" }));
  view.unmount();
});

test("cancelling a forgotten ring sends nothing and returns to the open ring", async () => {
  const view = render({ onMutate });
  await click(button(view.container, /กรอกย้อนหลัง/));
  type(view.container, "ringNo", "P1");
  await click(button(view.container, /ยกเลิก/));
  expect(onMutate).not.toHaveBeenCalled();

  await submit(view.container);
  expect(sent(onMutate, 0)).toEqual(expect.objectContaining({ operation: "update", recordId: "seg_p5" }));
  view.unmount();
});

test("records arriving while a forgotten ring is being typed do not refill the form", async () => {
  const view = render({ onMutate });
  await click(button(view.container, /กรอกย้อนหลัง/));
  view.rerender({ segmentRecords: [...tbm2] });
  type(view.container, "ringNo", "P1");
  type(view.container, "date", "2026-08-31");
  await submit(view.container);

  expect(sent(onMutate, 0)).toEqual(expect.objectContaining({ operation: "create", domainKey: "segment:TBM2:P1:Permanent" }));
  expect(sent(onMutate, 0).payload.startCH).toBe("");
  view.unmount();
});

test("switching machine drops the forgotten ring and its date", async () => {
  const view = render({ onMutate });
  await click(button(view.container, /กรอกย้อนหลัง/));
  type(view.container, "ringNo", "P1");
  type(view.container, "date", "2026-08-31");
  view.rerender({ machine: "TBM1", segmentRecords: [{ id: "seg_t1", ringNo: "P10", installType: "Permanent", length: 1.4, startCH: "8+000.00", finishCH: "7+998.60", status: "Completed" }] });
  await submit(view.container);

  expect(sent(onMutate, 0)).toEqual(expect.objectContaining({ machine: "TBM1", operation: "create", domainKey: "segment:TBM1:P11:Permanent" }));
  expect(sent(onMutate, 0).payload.date).toBe("2026-09-14");
  view.unmount();
});

test("typing another ring over the open ring points at กรอกย้อนหลัง and sends nothing", async () => {
  const view = render({ onMutate });
  type(view.container, "ringNo", "P1");
  await submit(view.container);

  expect(onMutate).not.toHaveBeenCalled();
  expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("กรอกย้อนหลัง"));
  view.unmount();
});
