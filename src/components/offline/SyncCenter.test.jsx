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
  const view = render(<SyncCenter open onClose={() => {}} summary={{ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }} load={load} onSyncNow={() => {}} onResolve={() => {}} onReview={() => {}} {...props} />);
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
      conflictId: "request-P47", requestId: "request-P47", actionable: true, entityType: "segment", machine: "TBM1",
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
      conflictId: "request-P70", requestId: "request-P70", actionable: true, entityType: "segment", machine: "TBM1",
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

test("a stranded row says why it cannot move, which is not the same as being refused", async () => {
  // The row's presence was pinned and its explanation was not. "รอ" with no reason reads as a
  // pending row the crew should wait on, when in fact nothing will happen until the head is fixed.
  const load = jest.fn(async () => ({ ...emptyView, blocked: [row("P95")] }));
  const view = mount({ load });
  await act(async () => {});
  await click(button(view.container, /ติดค้าง/));

  // ริง, not "record": blocking is per DOMAIN — `segment:<machine>:<ring>:<installType>`, no record
  // id in it — and the captured sheet has seven ids over sixteen rows, so two rows of one ring block
  // each other. Telling the crew to go fix "the same record" points them at a row whose id is
  // printed right beside it and is not the stuck one.
  expect(view.container.textContent).toContain("รออยู่หลังรายการที่ติดค้างของข้อมูลชุดเดียวกัน");
  // and NOT "ริง": this list holds issues, daily reports, prep tasks and instrument readings too
  expect(view.container.textContent).not.toMatch(/ติดค้างของริง/);
  expect(view.container.textContent).not.toContain("เซิร์ฟเวอร์ปฏิเสธ");
  view.unmount();
});

test("the history tab's empty state does not speak only of sends", async () => {
  const view = mount({});
  await act(async () => {});
  await click(button(view.container, /ประวัติ/));

  expect(view.container.textContent).toContain("ยังไม่มีประวัติ");
  view.unmount();
});

test("a legacy difference is shown for review and offers no write actions", async () => {
  // It has no mutation behind it: `resolveConflict` would throw "has no mutation to resolve" and
  // `discardMutation(undefined)` "Unknown mutation undefined". Offering either was a button that
  // could only fail.
  const load = jest.fn(async () => ({
    ...emptyView,
    conflicts: [{
      conflictId: "legacy:tbmIssues:issue:GLOBAL:issue-1", requestId: null, actionable: false,
      entityType: "issue", machine: "GLOBAL", recordId: "issue-1", domainKey: "issue:GLOBAL:issue-1",
      localRecord: { id: "issue-1", title: "ในเครื่อง" }, serverRecord: { id: "issue-1", title: "บนเซิร์ฟเวอร์" },
      reason: "legacy_local_difference", currentVersion: null,
    }],
  }));
  const view = mount({ load });
  await act(async () => {});
  await click(button(view.container, /ขัดแย้ง/));

  expect(view.container.textContent).toContain("issue-1");
  expect(view.container.textContent).toContain("เทียบสองฝั่งด้านบน");
  expect(button(view.container, /ตรวจแล้ว/)).toBeTruthy(); // the one action it does have
  expect(button(view.container, /เลือกว่าจะเก็บอันไหน/)).toBeUndefined();
  view.unmount();
});

test("a queue the panel could not read is said so, not reported as empty", async () => {
  // The button beside it is still showing a count read before the failure, so an empty list here is
  // the panel asserting something it could not check.
  const load = jest.fn(async () => { throw new Error("IndexedDB upgrade blocked by another tab"); });
  const view = mount({ load });
  await act(async () => {});

  expect(view.container.textContent).toContain("อ่านคิวในเครื่องไม่ได้");
  expect(view.container.textContent).toContain("IndexedDB upgrade blocked by another tab");
  view.unmount();
});

test("the review action is offered only where it applies", async () => {
  // A queued conflict has to be decided, not marked reviewed: pressing it there alerts
  // "เป็นรายการที่รอส่ง" and nothing happens.
  const load = jest.fn(async () => ({
    ...emptyView,
    conflicts: [{
      conflictId: "request-P99", requestId: "request-P99", actionable: true,
      entityType: "segment", machine: "TBM1", recordId: "P99", domainKey: "segment:TBM1:P99:Permanent",
      currentVersion: 3, serverRecord: { ringNo: "P99" }, localRecord: { ringNo: "P99" },
    }],
  }));
  const view = mount({ load });
  await act(async () => {});
  await click(button(view.container, /ขัดแย้ง/));

  expect(button(view.container, /เลือกว่าจะเก็บอันไหน/)).toBeTruthy();
  expect(button(view.container, /ตรวจแล้ว/)).toBeUndefined();
  view.unmount();
});

test("the discard confirmation says what discarding actually does to THIS row", async () => {
  // An UPDATE keeps its row so the ring survives; a CREATE's row goes, because the sheet never had
  // it. One sentence for both was wrong for one of them whichever way it was written.
  const load = jest.fn(async () => ({
    ...emptyView,
    errors: [
      row("P110", { status: "permanent_error", operation: "update", lastError: { message: "ถูกปฏิเสธ" } }),
      row("P111", { status: "permanent_error", operation: "create", lastError: { message: "ถูกปฏิเสธ" } }),
    ],
  }));
  const view = mount({ load, onDiscard: jest.fn(async () => {}) });
  await act(async () => {});
  await click(button(view.container, /ติดค้าง/));

  const discardButtons = [...view.container.querySelectorAll("button")].filter(b => /ทิ้งรายการนี้/.test(b.textContent));
  await click(discardButtons[0]);
  expect(view.container.textContent).toContain("ค่าที่บันทึกไว้จะยังอยู่บนหน้าจอ");
  await click(button(view.container, /ยกเลิก/));

  await click([...view.container.querySelectorAll("button")].filter(b => /ทิ้งรายการนี้/.test(b.textContent))[1]);
  expect(view.container.textContent).toContain("ยังไม่เคยมีอยู่บนชีต");
  view.unmount();
});

test("a discarded row leaves the list without waiting for anything else to re-render it", async () => {
  // The panel re-reads after every action it performs. Without that the discarded row stays listed
  // with live buttons while the status button's count has already dropped — and the second tap
  // reaches the store guard that refuses it as "ยังไม่ติดค้าง", which reads as the discard failing.
  let discarded = false;
  const load = jest.fn(async () => (discarded
    ? emptyView
    : { ...emptyView, errors: [row("P77", { status: "validation_error", lastError: { code: "VALIDATION", message: "ring ไม่ถูกต้อง" } })] }));
  const onDiscard = jest.fn(async () => { discarded = true; });
  const view = mount({ load, onDiscard });
  await act(async () => {});
  await click(button(view.container, /ติดค้าง/));
  expect(view.container.textContent).toContain("P77");

  await click(button(view.container, /ทิ้งรายการนี้/));
  await click(button(view.container, /ยืนยันทิ้ง/));
  await act(async () => {});

  expect(onDiscard).toHaveBeenCalledTimes(1);
  expect(view.container.textContent).not.toContain("P77");
  view.unmount();
});

test("the discard dialog tells the crew how many writes go with this one", async () => {
  // The count reaching the DOM is the point: the store computed it and the dialog dropped the
  // argument, with the whole suite green — the test that pinned it called the text function
  // directly rather than rendering the dialog a crew actually reads.
  const load = jest.fn(async () => ({ ...emptyView, errors: [row("P60", { operation: "create", cascadeCount: 2, status: "validation_error", lastError: { code: "VALIDATION", message: "ring ไม่ถูกต้อง" } })] }));
  const view = mount({ load, onDiscard: jest.fn(async () => {}) });
  await act(async () => {});
  await click(button(view.container, /ติดค้าง/));

  await click(button(view.container, /ทิ้งรายการนี้/));

  expect(view.container.textContent).toContain("2");
  expect(view.container.textContent).toMatch(/อีก 2 รายการ/);
  view.unmount();
});

test("a stranded row is not labelled refused just because it carries a last error", async () => {
  // `syncRunner` writes `lastError` onto rows it puts BACK to pending, so guessing from that field
  // labels a stranded row "เซิร์ฟเวอร์ปฏิเสธ" and offers it retry and edit — which the store then
  // refuses as "ยังไม่ติดค้าง". Which LIST the row came from is the answer, and the store already
  // made that split.
  const load = jest.fn(async () => ({
    ...emptyView,
    blocked: [row("P80", { lastError: { code: "NETWORK", message: "เชื่อมต่อไม่ได้" } })],
  }));
  const view = mount({ load, onRetry: jest.fn(), onDiscard: jest.fn() });
  await act(async () => {});
  await click(button(view.container, /ติดค้าง/));

  expect(view.container.textContent).toContain("รออยู่หลังรายการที่ติดค้างของข้อมูลชุดเดียวกัน");
  expect(view.container.textContent).not.toContain("เซิร์ฟเวอร์ปฏิเสธ");
  expect(button(view.container, /ส่งใหม่/)).toBeUndefined();
  view.unmount();
});

test("the tab badge counts stranded rows too, not only refused ones", async () => {
  // A badge reading none over a list of rows is a badge the crew stops reading — the same rule the
  // history tab's badge is held to.
  const load = jest.fn(async () => ({ ...emptyView, blocked: [row("P81"), row("P82")] }));
  const view = mount({ load });
  await act(async () => {});

  expect(view.container.textContent).toContain("ติดค้าง (2)");
  view.unmount();
});

test("a refused row with no error attached does not take the panel down with it", async () => {
  // `syncRunner` always writes one, but `updateMutation` is a public method carrying no such
  // promise — and this is the screen a crew opens to find out whether their work reached the sheet.
  const load = jest.fn(async () => ({ ...emptyView, errors: [row("P83", { status: "permanent_error", lastError: null })] }));
  const view = mount({ load, onRetry: jest.fn(), onDiscard: jest.fn() });
  await act(async () => {});
  await click(button(view.container, /ติดค้าง/));

  expect(view.container.textContent).toContain("P83");
  expect(view.container.textContent).toContain("เซิร์ฟเวอร์ปฏิเสธ");
  view.unmount();
});

test("a conflict whose write is gone can still be cleared", async () => {
  // It has no mutation, so the three write actions do not apply — but it must not sit in "ต้องแก้"
  // for the life of the install either. `reviewLegacyDifference` accepts it now (it asks for the
  // MUTATION, not the id), so the row gets the one action it has.
  const load = jest.fn(async () => ({
    ...emptyView,
    conflicts: [{
      conflictId: "orphan-1", requestId: "request-gone", entityType: "segment", machine: "TBM1",
      recordId: "seg-P57", domainKey: "segment:TBM1:P57:Permanent", actionable: false,
      localRecord: { ringNo: "P57" }, serverRecord: { ringNo: "P57" },
    }],
  }));
  const onReview = jest.fn();
  const view = { ...mount({ load, onReview }), onReview };
  await act(async () => {});
  await click(button(view.container, /ขัดแย้ง/));

  expect(view.container.textContent).toContain("P57");
  expect(button(view.container, /เก็บของเซิร์ฟเวอร์/)).toBeUndefined(); // no mutation to resolve through
  await click(button(view.container, /ตรวจแล้ว/));
  expect(view.onReview).toHaveBeenCalled();
  view.unmount();
});

test("the panel says how full the store is and whether the browser may throw it away", async () => {
  // Two failures a crew cannot otherwise see. Neither announces itself: a store that cannot take
  // another write says so only at the moment a write fails, which is after the ring is on screen.
  const view = mount({ storage: { supported: true, usage: 42 * 1024 * 1024, quota: 100 * 1024 * 1024, ratio: 0.42, persisted: true, warn: false } });
  await act(async () => {});

  expect(view.container.textContent).toMatch(/42/);
  expect(view.container.textContent).toMatch(/100/);
  expect(view.container.textContent).toContain("ถาวร");
  view.unmount();
});

test("a store that is nearly full says so where the crew will read it", async () => {
  const view = mount({ storage: { supported: true, usage: 90 * 1024 * 1024, quota: 100 * 1024 * 1024, ratio: 0.9, persisted: false, warn: true } });
  await act(async () => {});

  expect(view.container.textContent).toContain("พื้นที่เก็บข้อมูลใกล้เต็ม");
  view.unmount();
});

test("a browser that cannot report storage does not get a made-up number", async () => {
  const view = mount({ storage: { supported: false, usage: null, quota: null, ratio: null, persisted: null, warn: false } });
  await act(async () => {});

  expect(view.container.textContent).not.toMatch(/0 MB|0%/);
  view.unmount();
});

test("the panel names which build this device is running", async () => {
  // Two crews reporting the same app behaving differently is answered by this line. Without it,
  // working out that one device was on a replaced build took a dump of the live sheet.
  const view = mount({ buildId: "main.f11b0f70" });
  await act(async () => {});

  expect(view.container.textContent).toContain("main.f11b0f70");
  view.unmount();
});

test("no build id is printed when there is none to name", async () => {
  const view = mount();
  await act(async () => {});

  expect(view.container.textContent).not.toContain("เวอร์ชันแอปบนเครื่องนี้");
  view.unmount();
});

test("the crew can export what has not reached the sheet", async () => {
  // The last resort behind every other safeguard: a phone whose queue cannot drain hands the work
  // to someone who can replay it.
  const onExport = jest.fn(async () => "tbm-offline-recovery-20260803-1130.json");
  const view = mount({ onExport, load: jest.fn(async () => ({ ...emptyView, pending: [row("P1")] })) });
  await act(async () => {});

  await click(button(view.container, /ส่งออกข้อมูลที่ยังไม่ซิงก์/));

  expect(onExport).toHaveBeenCalledTimes(1);
  view.unmount();
});

test("an export that fails says so instead of looking like it worked", async () => {
  const onExport = jest.fn(async () => { throw new Error("QuotaExceededError"); });
  const view = mount({ onExport });
  await act(async () => {});

  await click(button(view.container, /ส่งออกข้อมูลที่ยังไม่ซิงก์/));

  expect(view.container.textContent).toContain("ส่งออกไม่สำเร็จ");
  view.unmount();
});

test("storage numbers the browser did not give are not printed as zero", async () => {
  // `getStorageHealth` can answer `supported: true` with no numbers. "0 MB / 0 MB" is the most
  // reassuring thing this panel could say, and it would be saying it about nothing.
  const view = mount({ storage: { supported: true, usage: null, quota: null, ratio: null, persisted: true, warn: false } });
  await act(async () => {});

  expect(view.container.textContent).not.toContain("0 MB");
  view.unmount();
});

test("the panel shows how long the link actually took, last time it worked", async () => {
  // The two deadlines guarding the wire are 90 s and neither was ever measured. Remote inspection
  // needs a cable and a desktop, or a Mac; neither travels down a shaft. These two numbers do.
  const view = mount({ summary: { online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null, lastFetchMs: 12400, lastPostMs: 3100 } });
  await act(async () => {});

  expect(view.container.textContent).toContain("12.4 วิ");
  expect(view.container.textContent).toContain("3.1 วิ");
  view.unmount();
});

test("a link that has never been timed shows a dash, not a zero", async () => {
  const view = mount({ summary: { online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null, lastFetchMs: null, lastPostMs: null } });
  await act(async () => {});

  expect(view.container.textContent).not.toContain("0.0 วิ");
  view.unmount();
});
