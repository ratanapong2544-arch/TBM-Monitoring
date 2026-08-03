import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { useIsOnline } from "./useIsOnline";

function renderHook() {
  const seen = []; // every render, so the first one can be asserted on its own
  function Probe() { seen.push(useIsOnline()); return null; }
  let container;
  let root;
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(<Probe />);
  });
  return { first: () => seen[0], last: () => seen[seen.length - 1], unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

const setOnLine = value => Object.defineProperty(window.navigator, "onLine", { value, configurable: true });

afterEach(() => setOnLine(true));

test("starts from what the platform says right now", () => {
  // The FIRST render, not the last: reading the last one lets the effect correct an initial `true`,
  // so a component that renders once before its effects — every one of the four guards — would show
  // the online branch for a frame with no test able to see it.
  setOnLine(false);
  const hook = renderHook();
  expect(hook.first()).toBe(false);
  expect(hook.last()).toBe(false);
  hook.unmount();
});

test("follows the link going down and coming back", () => {
  // The whole point: the guards that hang off this must change the moment the crew loses signal, not
  // at the next render that happens to occur.
  setOnLine(true);
  const hook = renderHook();
  expect(hook.last()).toBe(true);

  act(() => { setOnLine(false); window.dispatchEvent(new Event("offline")); });
  expect(hook.last()).toBe(false);

  act(() => { setOnLine(true); window.dispatchEvent(new Event("online")); });
  expect(hook.last()).toBe(true);
  hook.unmount();
});

test("stops listening when it unmounts", () => {
  const removed = [];
  const realRemove = window.removeEventListener.bind(window);
  jest.spyOn(window, "removeEventListener").mockImplementation((type, handler, options) => { removed.push(type); return realRemove(type, handler, options); });

  renderHook().unmount();

  expect(removed).toEqual(expect.arrayContaining(["online", "offline"]));
  jest.restoreAllMocks();
});
