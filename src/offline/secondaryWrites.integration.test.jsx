import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import PrepGanttView from "../components/views/PrepGanttView";
import { apiCall } from "../utils/api";

// Task 9 moves the remaining business writes onto the same queue Task 8 built for the core five.
// These assert the ENVELOPE — one mutation per affected record, with the domain key the record's own
// fields derive — rather than a notice or a spinner, for the reason Step 4 gives: a test that watches
// the screen cannot tell a queued write from one that was never sent.
jest.mock("../utils/api", () => ({ apiCall: jest.fn(async () => ({ status: "success" })) }));

const TASKS_KEY = "tbmPrepTasks_TBM1";

let onMutate;
beforeEach(() => {
  window.localStorage.clear();
  apiCall.mockImplementation(async () => ({ status: "success" }));
  onMutate = jest.fn(async () => ({}));
});

function render(element) {
  let container;
  let root;
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(element);
  });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

const click = async (element) => {
  if (!element) throw new Error("no such control");
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
const type = (container, selector, value) => act(() => {
  const field = container.querySelector(selector);
  const proto = field.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
});

const task = (id, name, extra = {}) => ({
  id, name, start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [], milestone: false, parentId: null, ...extra,
});
const seedTasks = rows => window.localStorage.setItem(TASKS_KEY, JSON.stringify(rows));

test("editing a prep task queues one update for that task", async () => {
  seedTasks([task("prep_1", "ตั้งเครน"), task("prep_2", "ติดตั้งราง")]);
  const view = render(<PrepGanttView machine="TBM1" onMutate={onMutate} syncMeta={{ "prepTask:TBM1:prep_1": { version: 4 } }} />);

  await click([...view.container.querySelectorAll("div")].find(node => node.textContent === "ตั้งเครน"));
  type(view.container, 'input[placeholder^="เช่น"]', "ตั้งเครนหลัก"); // the task-name field
  await click(button(view.container, /^บันทึก$/));

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "prepTask",
    operation: "update",
    machine: "TBM1",
    recordId: "prep_1",
    domainKey: "prepTask:TBM1:prep_1",
    baseVersion: 4,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("adding a prep task queues a create that claims no version", async () => {
  // a create must not carry the key's known version — `createBaseVersion`'s rule, and the reason a
  // second crew recording the same thing gets a conflict rather than a silent merge
  seedTasks([]);
  const view = render(<PrepGanttView machine="TBM1" onMutate={onMutate} syncMeta={{}} />);

  await click(button(view.container, /เพิ่มงาน/));
  type(view.container, 'input[placeholder^="เช่น"]', "เทฐานราก");
  type(view.container, 'input[type="date"]', "2026-08-10");
  await click(button(view.container, /^เพิ่ม$/));

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "prepTask", operation: "create", machine: "TBM1", baseVersion: 0,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("deleting a prep task queues one delete for that task", async () => {
  seedTasks([task("prep_1", "ตั้งเครน")]);
  const view = render(<PrepGanttView machine="TBM1" onMutate={onMutate} syncMeta={{ "prepTask:TBM1:prep_1": { version: 2 } }} />);

  await click([...view.container.querySelectorAll("div")].find(node => node.textContent === "ตั้งเครน"));
  await click(button(view.container, /^ลบ$/));

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "prepTask", operation: "delete", recordId: "prep_1", domainKey: "prepTask:TBM1:prep_1", baseVersion: 2,
  }));
  view.unmount();
});

test("Set Baseline queues one mutation per task, not one batch", async () => {
  // Step 1 calls this out by name: N independent request ids, so a refusal on one task does not
  // strand the rest — the queue orders per record, and a batch would make them one record.
  seedTasks([task("prep_1", "ตั้งเครน"), task("prep_2", "ติดตั้งราง"), task("prep_3", "เทฐานราก")]);
  const confirmed = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    const view = render(<PrepGanttView machine="TBM1" onMutate={onMutate} syncMeta={{}} />);

    await click(button(view.container, /Set Baseline/));

    expect(onMutate).toHaveBeenCalledTimes(3);
    const keys = onMutate.mock.calls.map(([envelope]) => envelope.domainKey);
    expect(keys).toEqual(["prepTask:TBM1:prep_1", "prepTask:TBM1:prep_2", "prepTask:TBM1:prep_3"]);
    expect(onMutate.mock.calls.every(([envelope]) => envelope.entityType === "prepTask" && envelope.operation === "update")).toBe(true);
    expect(apiCall).not.toHaveBeenCalled();
    view.unmount();
  } finally {
    confirmed.mockRestore();
  }
});

test("a prep task of the other machine is never written under this one's key", async () => {
  // `prepTask` is machine-keyed AND returned project-wide, so one list holds both machines' rows —
  // open item 3l. The key has to come from the machine the view is showing.
  seedTasks([task("prep_1", "ตั้งเครน")]);
  window.localStorage.setItem("tbmPrepTasks_TBM2", JSON.stringify([task("prep_9", "งานของ TBM2")]));
  const view = render(<PrepGanttView machine="TBM2" onMutate={onMutate} syncMeta={{}} />);

  await click([...view.container.querySelectorAll("div")].find(node => node.textContent === "งานของ TBM2"));
  await click(button(view.container, /^ลบ$/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    machine: "TBM2", recordId: "prep_9", domainKey: "prepTask:TBM2:prep_9",
  }));
  view.unmount();
});
