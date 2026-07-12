// Task R3c — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching InstallationStatus.test.jsx / InstReportModal.test.jsx). Covers the
// install-view upgrade: banner (name/Ref STA/conditional Install STA/Page), shape-by-type +
// color-by-installStatus pins, click-to-toggle photo callout, cross-location blueprintInstruments
// derivation via the optional `allInstruments` pool, the coordinate-presence filter (GAS represents
// "no coordinate" as "" not null/undefined — see BlueprintPlot.jsx), the legend, and the write-light
// cut (no edit-coordinates affordance at all).
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import BlueprintPlot from "./BlueprintPlot";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<BlueprintPlot {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

function click(el) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const location = { id: "loc-1", name: "Shaft IS02", chainage: 8300, actualChainage: null };
const locationWithInstallSta = { id: "loc-1", name: "Shaft IS02", chainage: 8300, actualChainage: 8360 };

function baseInst(overrides) {
  return {
    id: "i1",
    code: "P6379",
    type: "INCLINOMETER",
    installStatus: "PENDING",
    installedAt: null,
    installPhotoUrl: null,
    blueprintPage: 2,
    blueprintX: 19,
    blueprintY: 43,
    ...overrides,
  };
}

test("banner: shows INSTRUMENT PLAN + location name + Ref STA + Page, no Install STA when chainage unchanged", () => {
  const { container, root } = mount({ location, instruments: [baseInst()] });
  expect(container.textContent).toContain("INSTRUMENT PLAN");
  expect(container.textContent).toContain("Shaft IS02");
  expect(container.textContent).toContain("Ref STA 8+300");
  expect(container.textContent).toContain("Page 2");
  expect(container.textContent).not.toContain("Install STA");
  unmount(container, root);
});

test("banner: shows Install STA when actualChainage differs from the design chainage", () => {
  const { container, root } = mount({ location: locationWithInstallSta, instruments: [baseInst()] });
  expect(container.textContent).toContain("Install STA 8+360");
  unmount(container, root);
});

test("graceful without a location: no crash, banner omits name/STA but still shows Page", () => {
  const { container, root } = mount({ instruments: [baseInst()] });
  expect(container.textContent).toContain("INSTRUMENT PLAN");
  expect(container.textContent).not.toContain("Ref STA");
  expect(container.textContent).toContain("Page 2");
  unmount(container, root);
});

test("page resolution: falls back to the source's default page 26 when nothing resolves a blueprintPage", () => {
  const { container, root } = mount({
    location,
    instruments: [baseInst({ blueprintPage: null, blueprintX: "", blueprintY: "" })],
  });
  expect(container.textContent).toContain("Page 26");
  const img = container.querySelector("img[alt='Blueprint page 26']");
  expect(img).toBeTruthy();
  expect(img.getAttribute("src")).toBe("/blueprints/page_26.png");
  unmount(container, root);
});

test("blueprint image src/alt use the resolved page number", () => {
  const { container, root } = mount({ location, instruments: [baseInst({ blueprintPage: 7 })] });
  const img = container.querySelector("img[alt='Blueprint page 7']");
  expect(img).toBeTruthy();
  expect(img.getAttribute("src")).toBe("/blueprints/page_7.png");
  unmount(container, root);
});

test("shape by type: circle (INC), square (EXT), triangle icon (PI), plus icon (SS)", () => {
  const instruments = [
    baseInst({ id: "i1", code: "P1", type: "INCLINOMETER", blueprintX: 10, blueprintY: 10 }),
    baseInst({ id: "i2", code: "P2", type: "EXTENSOMETER", blueprintX: 20, blueprintY: 20 }),
    baseInst({ id: "i3", code: "P3", type: "PIEZOMETER", blueprintX: 30, blueprintY: 30 }),
    baseInst({ id: "i4", code: "P4", type: "SETTLEMENT_POINT", blueprintX: 40, blueprintY: 40 }),
  ];
  const { container, root } = mount({ location, instruments });

  const circle = container.querySelector("button[title='P1']");
  const square = container.querySelector("button[title='P2']");
  const triangleBtn = container.querySelector("button[title='P3']");
  const plusBtn = container.querySelector("button[title='P4']");

  expect(circle.className).toContain("rounded-full");
  expect(square.className).toContain("rounded-sm");
  expect(square.querySelector("svg")).toBeNull(); // shape markers (INC/EXT) render no icon
  expect(circle.querySelector("svg")).toBeNull();
  expect(triangleBtn.querySelector("svg.lucide-triangle")).toBeTruthy();
  expect(plusBtn.querySelector("svg.lucide-plus")).toBeTruthy();
  unmount(container, root);
});

test("color by installStatus: INSTALLED->code-a, INSTALLING->cyan-med, PENDING->ink-3", () => {
  const instruments = [
    baseInst({ id: "i1", code: "P1", installStatus: "INSTALLED", blueprintX: 10, blueprintY: 10 }),
    baseInst({ id: "i2", code: "P2", installStatus: "INSTALLING", blueprintX: 20, blueprintY: 20 }),
    baseInst({ id: "i3", code: "P3", installStatus: "PENDING", blueprintX: 30, blueprintY: 30 }),
  ];
  const { container, root } = mount({ location, instruments });
  expect(container.querySelector("button[title='P1']").className).toContain("text-code-a");
  expect(container.querySelector("button[title='P2']").className).toContain("text-cyan-med");
  expect(container.querySelector("button[title='P3']").className).toContain("text-ink-3");
  unmount(container, root);
});

test("unknown/garbage installStatus falls back to PENDING styling and label rather than crashing", () => {
  const { container, root } = mount({ location, instruments: [baseInst({ installStatus: "???" })] });
  const pin = container.querySelector("button[title='P6379']");
  expect(pin.className).toContain("text-ink-3");
  click(pin);
  expect(container.textContent).toContain("รอดำเนินการ");
  unmount(container, root);
});

test("click pin toggles the photo callout: Thai status text + install date + camera placeholder, click again closes", () => {
  // Note: the legend (always rendered) also shows "ติดตั้งเสร็จสิ้น" as one of its 3 static status
  // labels, so callout open/closed state must be asserted via signals unique to the callout itself
  // (the install-date label, the camera-placeholder icon) rather than the status text alone.
  const instruments = [baseInst({ installStatus: "INSTALLED", installedAt: "2026-01-05T12:00:00.000Z" })];
  const { container, root } = mount({ location, instruments });
  expect(container.querySelector("svg.lucide-camera")).toBeNull();
  expect(container.textContent).not.toContain("05 Jan 2026");

  const pin = container.querySelector("button[title='P6379']");
  click(pin);
  expect(container.textContent).toContain("ติดตั้งเสร็จสิ้น");
  expect(container.textContent).toContain("05 Jan 2026");
  expect(container.querySelector("svg.lucide-camera")).toBeTruthy(); // no installPhotoUrl -> placeholder

  click(pin);
  expect(container.querySelector("svg.lucide-camera")).toBeNull();
  expect(container.textContent).not.toContain("05 Jan 2026");
  unmount(container, root);
});

test("callout shows the real photo when installPhotoUrl is present (no camera placeholder)", () => {
  const instruments = [baseInst({ installPhotoUrl: "https://example.com/p6379.jpg" })];
  const { container, root } = mount({ location, instruments });
  click(container.querySelector("button[title='P6379']"));
  const img = Array.from(container.querySelectorAll("img")).find((el) => el.src === "https://example.com/p6379.jpg");
  expect(img).toBeTruthy();
  expect(container.querySelector("svg.lucide-camera")).toBeNull();
  unmount(container, root);
});

test("clicking the blueprint background closes an open callout", () => {
  const instruments = [baseInst({ installStatus: "INSTALLED", installedAt: "2026-01-05T12:00:00.000Z" })];
  const { container, root } = mount({ location, instruments });
  click(container.querySelector("button[title='P6379']"));
  expect(container.textContent).toContain("05 Jan 2026"); // callout open (date is unique to the callout)
  click(container.querySelector("img[alt^='Blueprint']"));
  expect(container.textContent).not.toContain("05 Jan 2026"); // callout closed
  unmount(container, root);
});

test("cross-location: allInstruments pool renders pins from other locations sharing the same blueprintPage, excludes other pages", () => {
  const ownInst = baseInst({ id: "own1", code: "OWN1", blueprintPage: 5, blueprintX: 10, blueprintY: 10 });
  const otherLocSamePage = baseInst({ id: "other1", code: "OTH1", blueprintPage: 5, blueprintX: 60, blueprintY: 60 });
  const otherLocDiffPage = baseInst({ id: "other2", code: "OTH2", blueprintPage: 9, blueprintX: 20, blueprintY: 20 });
  const { container, root } = mount({
    location,
    instruments: [ownInst],
    allInstruments: [ownInst, otherLocSamePage, otherLocDiffPage],
  });
  expect(container.querySelector("button[title='OWN1']")).toBeTruthy();
  expect(container.querySelector("button[title='OTH1']")).toBeTruthy();
  expect(container.querySelector("button[title='OTH2']")).toBeNull();
  unmount(container, root);
});

test("without allInstruments, falls back to just the given instruments (no cross-location pins)", () => {
  const ownInst = baseInst({ id: "own1", code: "OWN1", blueprintPage: 5, blueprintX: 10, blueprintY: 10 });
  const { container, root } = mount({ location, instruments: [ownInst] });
  expect(container.querySelectorAll("button[title]")).toHaveLength(1);
  expect(container.querySelector("button[title='OWN1']")).toBeTruthy();
  unmount(container, root);
});

test("instruments without blueprint coordinates (GAS empty-string, or missing) are not rendered as pins", () => {
  const withCoords = baseInst({ id: "a", code: "A" });
  const emptyStringCoords = baseInst({ id: "b", code: "B", blueprintX: "", blueprintY: "" });
  const { container, root } = mount({ location, instruments: [withCoords, emptyStringCoords] });
  expect(container.querySelectorAll("button[title]")).toHaveLength(1);
  expect(container.querySelector("button[title='A']")).toBeTruthy();
  expect(container.querySelector("button[title='B']")).toBeNull();
  unmount(container, root);
});

test("legend shows shape-by-type notes and color-by-status Thai labels", () => {
  const { container, root } = mount({ location, instruments: [baseInst()] });
  expect(container.textContent).toContain("Instrument Note");
  expect(container.textContent).toContain("Inclinometer");
  expect(container.textContent).toContain("Extensometer");
  expect(container.textContent).toContain("VW Piezometer");
  expect(container.textContent).toContain("Settlement Point");
  expect(container.textContent).toContain("ติดตั้งเสร็จสิ้น");
  expect(container.textContent).toContain("รอดำเนินการ");
  expect(container.textContent).toContain("กำลังดำเนินการ");
  unmount(container, root);
});

test("write-light cut: no edit-coordinates affordance anywhere (no Edit Positions / Save All button)", () => {
  const { container, root } = mount({ location, instruments: [baseInst()] });
  expect(container.textContent).not.toContain("Edit Positions");
  expect(container.textContent).not.toContain("Save All");
  unmount(container, root);
});
