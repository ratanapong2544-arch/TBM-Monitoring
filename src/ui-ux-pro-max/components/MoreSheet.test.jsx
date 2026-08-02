import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import MoreSheet from "./MoreSheet";

// Nothing mounted this sheet, so "ติดตั้งแอป inside MoreSheet" — the plan's own words — could be
// removed without a red test. On a phone this sheet is where the crew goes looking.
test("the footer the app hands it is rendered", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MoreSheet open onClose={() => {}} onNavigate={() => {}} footer={<div>ติดตั้งแอปบนมือถือ</div>} />);
  });

  expect(container.textContent).toContain("ติดตั้งแอปบนมือถือ");
  act(() => { root.unmount(); });
  container.remove();
});
