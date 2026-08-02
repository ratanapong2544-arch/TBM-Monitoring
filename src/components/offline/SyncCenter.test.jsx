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
  await click(button(view.container, /ประวัติ/));
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

test("a refused write can be retried or thrown away from the errors tab", async () => {
  // The tab was a list with no controls: a refused write could not be retried, edited or discarded
  // from anywhere in the app, so it stayed a permanent number in the status strip.
  const onRetry = jest.fn(async () => {});
  const onDiscard = jest.fn(async () => {});
  const load = jest.fn(async () => ({
    ...emptyView,
    errors: [row("P43", { status: "validation_error", lastError: { code: "VALIDATION", message: "ring ซ้ำ" } })],
  }));
  const view = mount({ load, onRetry, onDiscard });
  await act(async () => {});
  await click(button(view.container, /ติดค้าง/));

  await click(button(view.container, /ลองส่งใหม่/));
  expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ recordId: "P43" }));

  // discarding is the destructive one and takes a second action here too
  await click(button(view.container, /ทิ้งรายการนี้/));
  expect(onDiscard).not.toHaveBeenCalled();
  await click(button(view.container, /ยืนยันทิ้ง/));
  expect(onDiscard).toHaveBeenCalledWith(expect.objectContaining({ recordId: "P43" }));
  view.unmount();
});

test("a pending row says when it will be tried again, and syncing is not the same word as waiting", async () => {
  const load = jest.fn(async () => ({
    ...emptyView,
    pending: [
      row("P50", { nextAttemptAt: "2026-08-02T03:30:00.000Z", attemptCount: 2 }),
      row("P51", { status: "syncing" }),
    ],
  }));
  const view = mount({ load });
  await act(async () => {});

  expect(view.container.textContent).toContain("ลองใหม่");
  expect(view.container.textContent).toContain("กำลังส่งอยู่");
  view.unmount();
});

test("timestamps read the same as every other date in the app", async () => {
  // `th-TH` resolves to the Buddhist calendar, so `dateStyle: "short"` printed 2569 truncated to
  // "69" — a date that reads as 1969 and disagrees with every other stamp on screen.
  const load = jest.fn(async () => ({
    ...emptyView,
    recent: [row("P52", { status: "synced", confirmedAtLocal: "2026-07-30T02:15:00.000Z", version: 3 })],
  }));
  const view = mount({ load });
  await act(async () => {});
  await click(button(view.container, /ประวัติ/));

  expect(view.container.textContent).toContain("2026-07-30");
  expect(view.container.textContent).not.toContain("/69");
  view.unmount();
});

test("a replaced write is shown as replaced, never as sent", async () => {
  const load = jest.fn(async () => ({
    ...emptyView,
    superseded: [row("P53", { status: "resolved", strategy: "local" })],
  }));
  const view = mount({ load });
  await act(async () => {});
  await click(button(view.container, /ประวัติ/));

  expect(view.container.textContent).toContain("แทนที่ด้วยรายการใหม่");
  expect(view.container.textContent).not.toContain("ซิงก์สำเร็จ");
  view.unmount();
});

test("the header says whether the device is offline, and when it last synced", async () => {
  const view = mount({ summary: { online: false, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: "2026-07-30T02:15:00.000Z" } });
  await act(async () => {});

  expect(view.container.textContent).toContain("ออฟไลน์");
  expect(view.container.textContent).toContain("2026-07-30");
  view.unmount();
});

test("every row keeps its request id, which is what a report to the admin is made of", async () => {
  const load = jest.fn(async () => ({ ...emptyView, pending: [row("P60")] }));
  const view = mount({ load });
  await act(async () => {});

  expect(view.container.textContent).toContain("request-P60");
  view.unmount();
});

test("the conflicts tab shows the server's own values, the server's time and device, and when this device saved", async () => {
  // Design §9 asks for all three, and the earlier assertion for the server side was satisfied by the
  // "TBM1" in the identity line — it never read the server record at all.
  const load = jest.fn(async () => ({
    ...emptyView,
    conflicts: [{
      conflictId: "request-P70", requestId: "request-P70", entityType: "segment", machine: "TBM1",
      recordId: "P70", domainKey: "segment:TBM1:P70:Permanent", currentVersion: 9,
      serverRecord: { ringNo: "P70", grade: "จากเซิร์ฟเวอร์" }, localRecord: { ringNo: "P70", grade: "จากเครื่องนี้" },
      serverUpdatedAt: "2026-07-30T02:15:00.000Z", serverUpdatedByDevice: "device-2",
      savedAtLocal: "2026-07-30T01:00:00.000Z",
    }],
  }));
  const view = mount({ load });
  await act(async () => {});
  await click(button(view.container, /ขัดแย้ง/));

  const text = view.container.textContent;
  expect(text).toContain("จากเซิร์ฟเวอร์");
  expect(text).toContain("จากเครื่องนี้");
  expect(text).toContain("device-2");
  expect(text).toContain("2026-07-30 09:15"); // the server's time, in Bangkok
  expect(text).toContain("2026-07-30 08:00"); // when this device saved its own copy
  view.unmount();
});

test("a tab badge counts what that tab shows", async () => {
  const load = jest.fn(async () => ({
    ...emptyView,
    superseded: [row("P71", { status: "resolved" })],
    discarded: [row("P72", { status: "discarded" })],
  }));
  const view = mount({ load });
  await act(async () => {});

  expect(button(view.container, /ประวัติ/).textContent).toContain("2");
  view.unmount();
});

test("a discarded write is listed, and is never called sent", async () => {
  const load = jest.fn(async () => ({ ...emptyView, discarded: [row("P73", { status: "discarded", discardedAt: "2026-07-30T02:15:00.000Z" })] }));
  const view = mount({ load });
  await act(async () => {});
  await click(button(view.container, /ประวัติ/));

  expect(view.container.textContent).toContain("P73");
  expect(view.container.textContent).toContain("ทิ้งโดยผู้ใช้");
  expect(view.container.textContent).not.toContain("ซิงก์สำเร็จ");
  view.unmount();
});


test("the four tabs are the four the plan names", async () => {
  // ids, not labels: `stuck` read the same to a crew and different to anyone following the spec.
  const view = mount({});
  await act(async () => {});

  expect([...view.container.querySelectorAll('[data-tab]')].map(node => node.getAttribute("data-tab")))
    .toEqual(["pending", "errors", "conflicts", "recent"]);
  view.unmount();
});

test("a row still in flight is not called synced either", async () => {
  // The sibling of the pending/synced split, and the branch the earlier test never entered.
  const load = jest.fn(async () => ({ ...emptyView, pending: [row("P90", { status: "syncing" })] }));
  const view = mount({ load });
  await act(async () => {});

  expect(view.container.textContent).toContain("กำลังส่งอยู่");
  expect(view.container.textContent).not.toContain("ซิงก์สำเร็จ");
  view.unmount();
});
