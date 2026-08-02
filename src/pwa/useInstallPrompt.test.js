import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import React from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { useInstallPrompt } from "./useInstallPrompt";

function renderHook(options) {
  const seen = {};
  function Probe() { Object.assign(seen, useInstallPrompt(options)); return null; }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Probe />); });
  return { seen, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

const beforeInstallPrompt = () => {
  const event = new Event("beforeinstallprompt");
  event.prompt = jest.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  return event;
};

test("Android's install prompt is captured and never fired without the crew asking", async () => {
  // The browser gives the page ONE chance to hold this event. Calling prompt() on capture spends it
  // on a crew who never asked, and the browser will not offer it again this visit.
  const hook = renderHook({ platform: "android" });
  const event = beforeInstallPrompt();

  await act(async () => { window.dispatchEvent(event); });

  expect(hook.seen.canPrompt).toBe(true);
  expect(event.prompt).not.toHaveBeenCalled();

  await act(async () => { await hook.seen.promptInstall(); });
  expect(event.prompt).toHaveBeenCalledTimes(1);
  hook.unmount();
});

test("an iPhone that is not installed is told the Safari steps, because there is no prompt to fire", () => {
  const hook = renderHook({ platform: "ios", standalone: false });

  expect(hook.seen.mode).toBe("ios-instructions");
  expect(hook.seen.canPrompt).toBe(false);
  hook.unmount();
});

test("an app already running standalone offers no install at all", () => {
  const hook = renderHook({ platform: "ios", standalone: true });

  expect(hook.seen.mode).toBe("installed");
  hook.unmount();
});

test("a desktop browser with no prompt is told how to open it on a phone, not that it installed", () => {
  // The failure this guards: a panel that says "ติดตั้งแล้ว" on a machine where nothing happened.
  const hook = renderHook({ platform: "desktop", standalone: false });

  expect(hook.seen.mode).toBe("share-link");
  expect(hook.seen.canPrompt).toBe(false);
  hook.unmount();
});

test("an Android that has not offered the event yet is not told it can install", () => {
  const hook = renderHook({ platform: "android", standalone: false });

  expect(hook.seen.canPrompt).toBe(false);
  expect(hook.seen.mode).toBe("waiting");
  hook.unmount();
});

test("the captured prompt is released once it has been used", async () => {
  // It is single-use: the browser will not accept a second prompt() on the same event, and a button
  // that stays enabled after it was spent does nothing when tapped.
  const hook = renderHook({ platform: "android" });
  await act(async () => { window.dispatchEvent(beforeInstallPrompt()); });

  await act(async () => { await hook.seen.promptInstall(); });

  expect(hook.seen.canPrompt).toBe(false);
  hook.unmount();
});
