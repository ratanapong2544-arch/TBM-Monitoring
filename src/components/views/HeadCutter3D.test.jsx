import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import HeadCutter3D from "./HeadCutter3D";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no WebGL — the component must fail soft (render its container +
// fallback), never throw. This guards that three is dynamic-imported (no
// top-level import leaks into the jest bundle) and mount/unmount is clean.
test("mounts in jsdom without crashing and renders the container", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<HeadCutter3D posture={{ headV: 10, tailV: 0, vrt: 0.2 }} />);
  });
  expect(container.querySelector('[data-testid="head-cutter-3d"]')).toBeTruthy();
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});
