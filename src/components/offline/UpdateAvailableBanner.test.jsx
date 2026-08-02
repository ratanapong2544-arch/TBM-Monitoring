import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import UpdateAvailableBanner from "./UpdateAvailableBanner";

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}
const click = async el => { if (!el) throw new Error("no such control"); await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));

const announce = registration => act(() => {
  window.dispatchEvent(new CustomEvent("tbm:pwa-update", { detail: registration }));
});

test("nothing is shown until the service worker says a new build is waiting", () => {
  const view = render(<UpdateAvailableBanner />);

  expect(view.container.textContent).toBe("");
  view.unmount();
});

test("the new build is applied only when the crew says so, and never mid-shift by itself", async () => {
  // A reload the crew did not ask for is a half-typed shift report gone. The banner waits.
  const waiting = { postMessage: jest.fn() };
  const reload = jest.fn();
  const listeners = {};
  const serviceWorker = { addEventListener: (type, handler, options) => { listeners[type] = { handler, options }; } };
  const view = render(<UpdateAvailableBanner reload={reload} serviceWorker={serviceWorker} />);

  await announce({ waiting });
  expect(view.container.textContent).toContain("มีเวอร์ชันใหม่");
  expect(waiting.postMessage).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();

  await click(button(view.container, /อัปเดตตอนนี้/));

  expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  expect(listeners.controllerchange.options).toEqual({ once: true });
  expect(reload).not.toHaveBeenCalled(); // not until the new worker actually takes over

  await act(async () => { listeners.controllerchange.handler(); });
  expect(reload).toHaveBeenCalledTimes(1);
  view.unmount();
});

test("dismissing it leaves the new build waiting rather than applying it", async () => {
  const waiting = { postMessage: jest.fn() };
  const view = render(<UpdateAvailableBanner reload={() => {}} serviceWorker={{ addEventListener: () => {} }} />);
  await announce({ waiting });

  await click(button(view.container, /ภายหลัง/));

  expect(view.container.textContent).toBe("");
  expect(waiting.postMessage).not.toHaveBeenCalled();
  view.unmount();
});

test("an announcement with no waiting worker is not offered as an update", async () => {
  // `onUpdate` also fires on the controller-change path, where there is nothing to activate.
  const view = render(<UpdateAvailableBanner reload={() => {}} serviceWorker={{ addEventListener: () => {} }} />);

  await announce({ waiting: null });

  expect(view.container.textContent).toBe("");
  view.unmount();
});
