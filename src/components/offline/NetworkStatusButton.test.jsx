import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import NetworkStatusButton from "./NetworkStatusButton";

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}
const click = async el => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const summary = extra => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null, ...extra });

test("an offline device says so, and says when its data is from", () => {
  const view = render(<NetworkStatusButton summary={summary({ online: false, lastSyncedAt: "2026-08-02T01:30:00.000Z" })} onOpen={() => {}} />);

  expect(view.container.textContent).toContain("ออฟไลน์");
  expect(view.container.textContent).toMatch(/08:30|01:30/); // Bangkok or UTC, but a time the crew can read
  view.unmount();
});

test("the counts the crew can act on are on the button itself", () => {
  // Not behind a tap. A crew underground has to see that something is stuck without going looking.
  const view = render(<NetworkStatusButton summary={summary({ pending: 3, conflicts: 2, errors: 1, blocked: 4 })} onOpen={() => {}} />);

  const label = view.container.textContent;
  expect(label).toContain("3"); // on its way
  expect(label).toContain("7 ต้องแก้"); // conflicts + errors + blocked — the number that needs a person, under a word the panel does not reuse
  view.unmount();
});

test("a device with nothing queued says it is up to date rather than showing a zero", () => {
  const view = render(<NetworkStatusButton summary={summary({ lastSyncedAt: "2026-08-02T01:30:00.000Z" })} onOpen={() => {}} />);

  expect(view.container.textContent).toContain("ซิงก์แล้ว");
  view.unmount();
});

test("tapping it opens the Sync Center", async () => {
  const onOpen = jest.fn();
  const view = render(<NetworkStatusButton summary={summary()} onOpen={onOpen} />);

  await click(view.container.querySelector("button"));

  expect(onOpen).toHaveBeenCalledTimes(1);
  view.unmount();
});

test("the last-sync time is Bangkok's, not the browser's", () => {
  // 01:30Z is 08:30 in Bangkok. A crew reading a UTC stamp would think the snapshot is seven hours
  // older than it is, and every other time in this app is Bangkok's.
  const view = render(<NetworkStatusButton summary={summary({ lastSyncedAt: "2026-08-02T01:30:00.000Z" })} onOpen={() => {}} />);

  expect(view.container.textContent).toContain("08:30");
  view.unmount();
});

test("a snapshot from another day is dated, not just clocked", async () => {
  // "ออฟไลน์ 07:15" at six the next evening reads as fifteen minutes ago. The notice strip names
  // both date and time for exactly this reason, and the Sync Center renders this same value as a
  // full stamp one tap away.
  jest.useFakeTimers().setSystemTime(new Date("2026-08-02T11:00:00.000Z"));
  const view = render(<NetworkStatusButton summary={summary({ online: false, lastSyncedAt: "2026-08-01T00:15:00.000Z" })} onOpen={() => {}} />);

  expect(view.container.textContent).toMatch(/2569|2026/); // the date, in whatever calendar the app formats
  view.unmount();
  jest.useRealTimers();
});

test("today's stamp is dated too, because midnight is not an event", async () => {
  // Dating it only when it is not today would be the same untruth wearing a disguise: the
  // comparison runs during render, and this button re-renders only when a queue count changes — so
  // a phone sitting idle across midnight would go on showing a bare clock for yesterday.
  jest.useFakeTimers().setSystemTime(new Date("2026-08-02T11:00:00.000Z"));
  const view = render(<NetworkStatusButton summary={summary({ online: false, lastSyncedAt: "2026-08-02T01:30:00.000Z" })} onOpen={() => {}} />);

  expect(view.container.textContent).toContain("08:30");
  expect(view.container.textContent).toMatch(/2569|2026/);
  view.unmount();
  jest.useRealTimers();
});
