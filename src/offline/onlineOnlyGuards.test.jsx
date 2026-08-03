import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../utils/api", () => ({
  apiCall: jest.fn(async () => []),
  generateGeminiSummary: jest.fn(async () => "สรุป"),
}));

import { apiCall } from "../utils/api";
import DashboardHeaderActions from "../components/dashboard/DashboardHeaderActions";
import ImageSlideshow from "../components/dashboard/ImageSlideshow";
import { isBasemapTileError, BASEMAP_OFFLINE_NOTICE } from "./basemapStatus";

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}
const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
const setOnLine = value => Object.defineProperty(window.navigator, "onLine", { value, configurable: true });

// CRA sets `resetMocks: true`, which strips the factory's implementations before every test — a
// mock that returns `undefined` here surfaces as `.then of undefined` inside the component.
beforeEach(() => {
  jest.clearAllMocks();
  apiCall.mockResolvedValue([]);
  setOnLine(true);
});
afterEach(() => setOnLine(true));

// ---------------------------------------------------------------- Gemini
test("the AI button is refused with a reason when there is no link, not left to fail on its own", async () => {
  // It posts to GAS, which proxies Gemini. Offline it can only spin and then show a stack of
  // connection words the crew cannot act on — and the modal it opens covers the screen while it does.
  setOnLine(false);
  const view = render(<DashboardHeaderActions segmentRecords={[]} groutRecords={[]} shiftReports={[]} />);

  const ai = button(view.container, /วิเคราะห์ AI|AI/);
  expect(ai).toBeTruthy();
  expect(ai.disabled).toBe(true);
  expect(ai.title).toContain("ต้องเชื่อมต่ออินเทอร์เน็ต");

  await act(async () => { ai.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(view.container.textContent).not.toContain("กำลังวิเคราะห์");
  view.unmount();
});

test("with a link the AI button works as before", async () => {
  const view = render(<DashboardHeaderActions segmentRecords={[]} groutRecords={[]} shiftReports={[]} />);

  const ai = button(view.container, /วิเคราะห์ AI|AI/);
  expect(ai.disabled).toBe(false);
  view.unmount();
});

// ---------------------------------------------------------------- Drive slideshow
test("the slideshow does not call the server it cannot reach", async () => {
  // Each attempt is a fetch that has to time out, and the effect re-runs on every reload key. The
  // crew gets a spinner that resolves into an error telling them to check the Drive sharing setting
  // — advice about the wrong problem.
  setOnLine(false);
  const view = render(<ImageSlideshow folderId="folder-1" />);
  await act(async () => {});

  expect(apiCall).not.toHaveBeenCalled();
  expect(view.container.textContent).toContain("ต้องเชื่อมต่ออินเทอร์เน็ต");
  expect(view.container.textContent).not.toContain("Anyone with the link");
  view.unmount();
});

test("the slideshow loads normally when there is a link", async () => {
  const view = render(<ImageSlideshow folderId="folder-1" />);
  await act(async () => {});

  expect(apiCall).toHaveBeenCalledWith("getDriveImages", { folderId: "folder-1" });
  view.unmount();
});

// ---------------------------------------------------------------- basemap
test("a tile failure is told apart from every other map error", () => {
  // The route, the shafts, the tunnel and the head are this app's own data and keep drawing without
  // a link. Only the satellite imagery underneath them comes from Esri, so only that is worth a
  // notice — and a style or WebGL error must not be reported as a missing basemap.
  expect(isBasemapTileError({ sourceId: "sat" })).toBe(true);
  expect(isBasemapTileError({ source: { id: "sat" } })).toBe(true);
  expect(isBasemapTileError({ error: { status: 404 }, sourceId: "sat" })).toBe(true);
  expect(isBasemapTileError({ sourceId: "route" })).toBe(false);
  expect(isBasemapTileError({ error: new Error("WebGL context lost") })).toBe(false);
  expect(isBasemapTileError(null)).toBe(false);
});

test("the basemap notice says which part is missing, not that the map is broken", () => {
  expect(BASEMAP_OFFLINE_NOTICE).toContain("พื้นหลังแผนที่ต้องใช้อินเทอร์เน็ต");
});
