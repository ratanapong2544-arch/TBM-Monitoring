import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import SyncCenter from "./SyncCenter";

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return {
    container,
    rerender: next => act(() => { root.render(next); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}
const click = async el => { if (!el) throw new Error("no such control"); await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));

const row = (recordId, extra = {}) => ({
  requestId: `request-${recordId}`, entityType: "segment", machine: "TBM1",
  recordId, domainKey: `segment:TBM1:${recordId}:Permanent`, status: "pending",
  operation: "update", createdAtLocal: "2026-08-02T01:00:00.000Z", attemptCount: 0, lastError: null, ...extra,
});
const emptyView = { pending: [], blocked: [], errors: [], conflicts: [], recent: [] };

function mount(props = {}) {
  const load = props.load || jest.fn(async () => emptyView);
  const view = render(<SyncCenter open onClose={() => {}} summary={{ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }} load={load} onSyncNow={() => {}} onResolve={() => {}} {...props} />);
  return { ...view, load };
}

test("it opens on what is on its way, and every row names its record", async () => {
  const load = jest.fn(async () => ({ ...emptyView, pending: [row("P41"), row("P42")] }));
  const view = mount({ load });
  await act(async () => {});

  expect(view.container.textContent).toContain("P41");
  expect(view.container.textContent).toContain("P42");
  expect(view.container.textContent).toContain("segment"); // entity type, never hidden
  expect(view.container.textContent).toContain("TBM1");
  view.unmount();
});

test("ซิงก์ตอนนี้ asks the runner to drain, and reloads the list", async () => {
  const onSyncNow = jest.fn(async () => {});
  const load = jest.fn(async () => emptyView);
  const view = mount({ onSyncNow, load });
  await act(async () => {});
  const before = load.mock.calls.length;

  await click(button(view.container, /ซิงก์ตอนนี้/));

  expect(onSyncNow).toHaveBeenCalledTimes(1);
  expect(load.mock.calls.length).toBeGreaterThan(before);
  view.unmount();
});

test("a stuck record is on the errors tab with what the server said, and never on the pending one", async () => {
  const load = jest.fn(async () => ({
    ...emptyView,
    errors: [row("P43", { status: "validation_error", lastError: { code: "VALIDATION", message: "ring ซ้ำ" } })],
    blocked: [row("P44")],
  }));
  const view = mount({ load });
  await act(async () => {});

  expect(view.container.textContent).not.toContain("P43"); // the pending tab is what is on its way
  await click(button(view.container, /ติดค้าง/));

  expect(view.container.textContent).toContain("P43");
  expect(view.container.textContent).toContain("ring ซ้ำ");
  expect(view.container.textContent).toContain("P44"); // stranded behind it, and said to be
  view.unmount();
});

test("บันทึกในเครื่องแล้ว and ซิงก์สำเร็จ are different things and are said differently", async () => {
  // The distinction the whole branch turns on: a queued write is safe on this device, not on the
  // sheet. A crew told "สำเร็จ" for the first will not check the second.
  const load = jest.fn(async () => ({
    ...emptyView,
    pending: [row("P45")],
    recent: [row("P46", { status: "synced", confirmedAtLocal: "2026-08-02T02:00:00.000Z", version: 4 })],
  }));
  const view = mount({ load });
  await act(async () => {});

  expect(view.container.textContent).toContain("บันทึกในเครื่องแล้ว");
  await click(button(view.container, /ส่งแล้ว/));
  expect(view.container.textContent).toContain("ซิงก์สำเร็จ");
  view.unmount();
});

test("the conflicts tab shows both sides of the record", async () => {
  const load = jest.fn(async () => ({
    ...emptyView,
    conflicts: [{
      conflictId: "request-P47", requestId: "request-P47", entityType: "segment", machine: "TBM1",
      recordId: "P47", domainKey: "segment:TBM1:P47:Permanent", currentVersion: 9,
      serverRecord: { ringNo: "P47", grade: "B" }, localRecord: { ringNo: "P47", grade: "A" },
    }],
  }));
  const view = mount({ load });
  await act(async () => {});

  await click(button(view.container, /ขัดแย้ง/));

  expect(view.container.textContent).toContain("P47");
  expect(view.container.textContent).toContain("A"); // this device's value
  expect(view.container.textContent).toContain("B"); // the server's
  view.unmount();
});
