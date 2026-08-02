import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import ConflictResolver from "./ConflictResolver";

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}
const click = async el => { if (!el) throw new Error("no such control"); await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
const type = (container, selector, value) => act(() => {
  const field = container.querySelector(selector);
  const proto = field.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
});

const conflict = {
  conflictId: "request-P41", requestId: "request-P41", entityType: "segment", machine: "TBM1",
  recordId: "seg-P41", domainKey: "segment:TBM1:P41:Permanent", currentVersion: 9,
  serverRecord: { ringNo: "P41", grade: "B" }, localRecord: { ringNo: "P41", grade: "A" },
};

function mount(props = {}) {
  const onResolve = props.onResolve || jest.fn(async () => ({ status: "resolved" }));
  const onDiscard = props.onDiscard || jest.fn(async () => {});
  const view = render(<ConflictResolver conflict={conflict} onResolve={onResolve} onDiscard={onDiscard} onClose={() => {}} {...props} />);
  return { ...view, onResolve, onDiscard };
}

test("keeping the server's row resolves with that exact strategy", async () => {
  const view = mount();

  await click(button(view.container, /เก็บของเซิร์ฟเวอร์/));

  expect(view.onResolve).toHaveBeenCalledWith(conflict, { strategy: "server" });
  view.unmount();
});

test("keeping this device's row resolves with that exact strategy", async () => {
  const view = mount();

  await click(button(view.container, /เก็บของเครื่องนี้/));

  expect(view.onResolve).toHaveBeenCalledWith(conflict, { strategy: "local" });
  view.unmount();
});

test("a manual resolution cannot be submitted without a payload", async () => {
  // The repository refuses one too, but the crew should not be able to reach that refusal by
  // pressing a button that looks ready.
  const view = mount();

  await click(button(view.container, /พิมพ์ค่าที่ถูกต้องเอง/));
  const submit = button(view.container, /บันทึกค่าที่แก้/);
  expect(submit.disabled).toBe(true);
  await click(submit);
  expect(view.onResolve).not.toHaveBeenCalled();

  type(view.container, "textarea", '{"ringNo":"P41","grade":"C"}');
  await click(button(view.container, /บันทึกค่าที่แก้/));

  expect(view.onResolve).toHaveBeenCalledWith(conflict, { strategy: "manual", payload: { ringNo: "P41", grade: "C" } });
  view.unmount();
});

test("a manual payload that is not readable is refused with a reason, not sent", async () => {
  const view = mount();

  await click(button(view.container, /พิมพ์ค่าที่ถูกต้องเอง/));
  type(view.container, "textarea", "{not json");
  await click(button(view.container, /บันทึกค่าที่แก้/));

  expect(view.onResolve).not.toHaveBeenCalled();
  expect(view.container.textContent).toContain("อ่านค่าไม่ได้");
  view.unmount();
});

test("discarding takes two deliberate actions", async () => {
  // The only way a recorded write leaves this device without reaching the sheet. One tap must not
  // be able to do it on a phone in a wet glove.
  const view = mount();

  await click(button(view.container, /ทิ้งงานนี้/));
  expect(view.onDiscard).not.toHaveBeenCalled();
  expect(view.container.textContent).toContain("จะไม่ถูกส่งขึ้นเซิร์ฟเวอร์อีก");

  await click(button(view.container, /ยืนยันทิ้ง/));

  expect(view.onDiscard).toHaveBeenCalledWith(conflict);
  view.unmount();
});

test("the two sides are shown field by field, with the ones that differ marked", async () => {
  const view = mount();

  const text = view.container.textContent;
  expect(text).toContain("grade");
  expect(text).toContain("A");
  expect(text).toContain("B");
  expect(view.container.querySelectorAll('[data-differs="true"]').length).toBe(1); // ringNo matches, grade does not
  view.unmount();
});
