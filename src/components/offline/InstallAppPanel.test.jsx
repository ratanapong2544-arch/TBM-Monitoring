import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import InstallAppPanel from "./InstallAppPanel";

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}
const click = async el => { if (!el) throw new Error("no such control"); await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));

test("an iPhone gets the Safari steps, in the order the plan fixes them", () => {
  const view = render(<InstallAppPanel install={{ mode: "ios-instructions", canPrompt: false, promptInstall: () => {} }} />);

  const text = view.container.textContent;
  expect(text).toContain("เปิดลิงก์ด้วย Safari");
  expect(text).toContain("กด Share");
  expect(text).toContain("เพิ่มไปยังหน้าจอโฮม");
  expect(text.indexOf("เปิดลิงก์ด้วย Safari")).toBeLessThan(text.indexOf("กด Share"));
  expect(text.indexOf("กด Share")).toBeLessThan(text.indexOf("เพิ่มไปยังหน้าจอโฮม"));
  view.unmount();
});

test("an Android with the event in hand gets one button, and it fires the prompt", async () => {
  const promptInstall = jest.fn(async () => ({ outcome: "accepted" }));
  const view = render(<InstallAppPanel install={{ mode: "prompt", canPrompt: true, promptInstall }} />);

  await click(button(view.container, /ติดตั้งแอป/));

  expect(promptInstall).toHaveBeenCalledTimes(1);
  view.unmount();
});

test("an installed app says nothing at all", () => {
  const view = render(<InstallAppPanel install={{ mode: "installed", canPrompt: false, promptInstall: () => {} }} />);

  expect(view.container.textContent).toBe("");
  view.unmount();
});

test("a desktop is told to open it on the phone, and never that it installed", () => {
  const view = render(<InstallAppPanel install={{ mode: "share-link", canPrompt: false, promptInstall: () => {} }} />);

  expect(view.container.textContent).toContain("เปิดลิงก์นี้บนมือถือ");
  expect(view.container.textContent).not.toContain("ติดตั้งแล้ว");
  expect(button(view.container, /^ติดตั้งแอป$/)).toBeUndefined();
  view.unmount();
});

test("an Android still waiting for the browser is told to wait, not given a dead button", () => {
  const view = render(<InstallAppPanel install={{ mode: "waiting", canPrompt: false, promptInstall: () => {} }} />);

  expect(button(view.container, /^ติดตั้งแอป$/)).toBeUndefined();
  expect(view.container.textContent).toContain("เบราว์เซอร์ยังไม่พร้อม");
  view.unmount();
});

test("the desktop guidance shows the link it tells the crew to open", () => {
  const view = render(<InstallAppPanel install={{ mode: "share-link", canPrompt: false, promptInstall: () => {} }} url="https://tbm.example/app" />);

  expect(view.container.textContent).toContain("https://tbm.example/app");
  expect(button(view.container, /คัดลอกลิงก์/)).toBeTruthy();
  view.unmount();
});
