import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../offline/OfflineProvider", () => ({ useOffline: () => global.__offline }));

import { useOfflineControls } from "./OfflineControls";

// The seam the component tests cannot see: they pin the callback PROPS, and this pins that those
// props reach `runner.runNow`, `repository.resolveConflict` and `repository.discardMutation`.
// Every rule below was green when broken until this file existed.
function Harness() {
  const { button, overlays } = useOfflineControls();
  return <>{button}{overlays}</>;
}

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Harness />); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}
const click = async el => { if (!el) throw new Error("no such control"); await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));

const conflictRow = {
  conflictId: "request-P41", requestId: "request-P41", entityType: "segment", machine: "TBM1",
  recordId: "P41", domainKey: "segment:TBM1:P41:Permanent", currentVersion: 9,
  serverRecord: { ringNo: "P41", grade: "B" }, localRecord: { ringNo: "P41", grade: "A" },
};
const emptyView = { pending: [], blocked: [], errors: [], conflicts: [], recent: [], superseded: [], discarded: [] };

beforeEach(() => {
  global.__offline = {
    repository: {
      getSyncCenter: jest.fn(async () => emptyView),
      resolveConflict: jest.fn(async () => ({ status: "resolved" })),
      discardMutation: jest.fn(async () => ({})),
      retryMutation: jest.fn(async () => ({})),
    },
    runner: { runNow: jest.fn(async () => {}) },
    syncSummary: { online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null },
  };
});

const openCentre = async view => {
  await click(button(view.container, /ซิงก์แล้ว/));
  await act(async () => {});
};

test("ซิงก์ตอนนี้ reaches the runner", async () => {
  const view = render();
  await openCentre(view);

  await click(button(view.container, /ซิงก์ตอนนี้/));

  expect(global.__offline.runner.runNow).toHaveBeenCalledTimes(1);
  view.unmount();
});

test("a conflict choice reaches repository.resolveConflict with that conflict's id and strategy", async () => {
  global.__offline.repository.getSyncCenter = jest.fn(async () => ({ ...emptyView, conflicts: [conflictRow] }));
  const view = render();
  await openCentre(view);

  await click(button(view.container, /ขัดแย้ง/));
  await click(button(view.container, /เลือกว่าจะเก็บอันไหน/));
  await click(button(view.container, /เก็บของเซิร์ฟเวอร์/));

  expect(global.__offline.repository.resolveConflict).toHaveBeenCalledWith("request-P41", { strategy: "server" });
  view.unmount();
});

test("discarding a refused write reaches repository.discardMutation with its request id", async () => {
  global.__offline.repository.getSyncCenter = jest.fn(async () => ({
    ...emptyView,
    errors: [{ requestId: "request-P43", entityType: "segment", machine: "TBM1", recordId: "P43", domainKey: "segment:TBM1:P43:Permanent", status: "validation_error", lastError: { message: "ring ซ้ำ" } }],
  }));
  const view = render();
  await openCentre(view);

  await click(button(view.container, /ติดค้าง/));
  await click(button(view.container, /ทิ้งรายการนี้/));
  await click(button(view.container, /ยืนยันทิ้ง/));

  expect(global.__offline.repository.discardMutation).toHaveBeenCalledWith("request-P43");
  view.unmount();
});

test("retrying a refused write reaches repository.retryMutation", async () => {
  global.__offline.repository.getSyncCenter = jest.fn(async () => ({
    ...emptyView,
    errors: [{ requestId: "request-P44", entityType: "segment", machine: "TBM1", recordId: "P44", domainKey: "segment:TBM1:P44:Permanent", status: "permanent_error", lastError: { message: "ถูกปฏิเสธ" } }],
  }));
  const view = render();
  await openCentre(view);

  await click(button(view.container, /ติดค้าง/));
  await click(button(view.container, /ลองส่งใหม่/));

  expect(global.__offline.repository.retryMutation).toHaveBeenCalledWith("request-P44", undefined);
  view.unmount();
});

test("corrected values reach repository.retryMutation as the payload", async () => {
  // A validation error is about the values. Resending them unchanged is refused identically, and
  // the mutation stays the head of its record — so re-entering it through the normal form does not
  // help either. Editing here is the only way out that is not destructive.
  global.__offline.repository.getSyncCenter = jest.fn(async () => ({
    ...emptyView,
    errors: [{
      requestId: "request-P45", entityType: "segment", machine: "TBM1", recordId: "P45",
      domainKey: "segment:TBM1:P45:Permanent", status: "validation_error",
      lastError: { message: "ring ซ้ำ", fields: ["ringNo"] },
      payload: { ringNo: "P45", installType: "Permanent" },
    }],
  }));
  const view = render();
  await openCentre(view);
  await click(button(view.container, /ติดค้าง/));

  expect(view.container.textContent).toContain("ฟิลด์ที่ต้องแก้: ringNo");
  await click(button(view.container, /แก้ค่าแล้วส่งใหม่/));
  const field = view.container.querySelector("textarea");
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(field, '{"ringNo":"P46","installType":"Permanent"}');
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(button(view.container, /ส่งค่าที่แก้/));

  expect(global.__offline.repository.retryMutation).toHaveBeenCalledWith("request-P45", { payload: { ringNo: "P46", installType: "Permanent" } });
  view.unmount();
});

test("the list is re-read after an action, so it stops offering what is already gone", async () => {
  // Without it a discarded row stays listed with live buttons while the status button's count has
  // already dropped — the two surfaces disagree, and the second tap hits a store guard.
  let discarded = false;
  global.__offline.repository.getSyncCenter = jest.fn(async () => (discarded ? emptyView : {
    ...emptyView,
    errors: [{ requestId: "request-P47", entityType: "segment", machine: "TBM1", recordId: "P47", domainKey: "segment:TBM1:P47:Permanent", status: "permanent_error", lastError: { message: "ถูกปฏิเสธ" } }],
  }));
  global.__offline.repository.discardMutation = jest.fn(async () => { discarded = true; });
  const view = render();
  await openCentre(view);
  await click(button(view.container, /ติดค้าง/));

  await click(button(view.container, /ทิ้งรายการนี้/));
  await click(button(view.container, /ยืนยันทิ้ง/));
  await act(async () => {});

  expect(view.container.textContent).not.toContain("P47");
  expect(view.container.textContent).toContain("ไม่มีรายการติดค้าง");
  view.unmount();
});

test("the install panel and the update banner are both rendered, not just built", async () => {
  const view = render();
  await openCentre(view);

  // the install panel lives inside the centre; the banner is a sibling that shows itself when the
  // service worker announces one
  expect(view.container.textContent).toContain("ติดตั้งแอปบนมือถือ");
  await act(async () => { window.dispatchEvent(new CustomEvent("tbm:pwa-update", { detail: { waiting: { postMessage: () => {} } } })); });
  expect(view.container.textContent).toContain("มีเวอร์ชันใหม่");
  view.unmount();
});

test("resolving a conflict re-reads the list, so the row stops being offered", async () => {
  // The resolver is a sibling of the Sync Center, not a child, so its actions cannot reach the
  // panel's own refresh. Without this the row stayed listed with live buttons while the status
  // button's count had already dropped, and the second tap reached "Unknown open conflict".
  let resolved = false;
  global.__offline.repository.getSyncCenter = jest.fn(async () => (resolved ? emptyView : { ...emptyView, conflicts: [conflictRow] }));
  global.__offline.repository.resolveConflict = jest.fn(async () => { resolved = true; return { status: "resolved" }; });
  const view = render();
  await openCentre(view);
  await click(button(view.container, /ขัดแย้ง/));

  await click(button(view.container, /เลือกว่าจะเก็บอันไหน/));
  await click(button(view.container, /เก็บของเซิร์ฟเวอร์/));
  await act(async () => {});

  expect(view.container.textContent).not.toContain("request-P41");
  expect(view.container.textContent).toContain("ไม่มีรายการขัดแย้ง");
  view.unmount();
});

test("discarding from the conflict resolver re-reads the list too", async () => {
  // The resolver has four exits and only three were pinned; its discard is the fourth.
  let gone = false;
  global.__offline.repository.getSyncCenter = jest.fn(async () => (gone ? emptyView : { ...emptyView, conflicts: [conflictRow] }));
  global.__offline.repository.discardMutation = jest.fn(async () => { gone = true; });
  const view = render();
  await openCentre(view);
  await click(button(view.container, /ขัดแย้ง/));
  await click(button(view.container, /เลือกว่าจะเก็บอันไหน/));

  await click(button(view.container, /ทิ้งงานนี้/));
  await click(button(view.container, /ยืนยันทิ้ง/));
  await act(async () => {});

  expect(view.container.textContent).not.toContain("request-P41");
  expect(view.container.textContent).toContain("ไม่มีรายการขัดแย้ง");
  view.unmount();
});

test("a refused retry keeps the corrected values on screen", async () => {
  // The only non-destructive exit a validation error has. The component said the editor stayed open
  // until the retry was accepted; the wiring caught every rejection into an alert, so it always
  // looked accepted and the crew's typing was thrown away.
  const alerted = jest.spyOn(window, "alert").mockImplementation(() => {});
  try {
    global.__offline.repository.getSyncCenter = jest.fn(async () => ({
      ...emptyView,
      errors: [{
        requestId: "request-P48", entityType: "segment", machine: "TBM1", recordId: "P48",
        domainKey: "segment:TBM1:P48:Permanent", status: "validation_error",
        lastError: { message: "ring ซ้ำ" }, payload: { ringNo: "P48", installType: "Permanent" },
      }],
    }));
    global.__offline.repository.retryMutation = jest.fn(async () => { throw new Error("Retry payload changes the record identity"); });
    const view = render();
    await openCentre(view);
    await click(button(view.container, /ติดค้าง/));
    await click(button(view.container, /แก้ค่าแล้วส่งใหม่/));

    const field = view.container.querySelector("textarea");
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(field, '{"ringNo":"P49","installType":"Permanent"}');
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button(view.container, /ส่งค่าที่แก้/));
    await act(async () => {});

    expect(alerted).toHaveBeenCalledWith(expect.stringContaining("ส่งใหม่ไม่สำเร็จ"));
    const stillOpen = view.container.querySelector("textarea");
    expect(stillOpen).toBeTruthy();
    expect(stillOpen.value).toContain("P49"); // their typing, not the refused original
    view.unmount();
  } finally {
    alerted.mockRestore();
  }
});
