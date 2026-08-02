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

  expect(global.__offline.repository.retryMutation).toHaveBeenCalledWith("request-P44");
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
