// Task R3c — render + interaction smoke test (react-dom/client + act; this repo has no
// @testing-library, matching sibling *.test.jsx files). Covers the BLUEPRINT/CHART tab switch itself
// (LocationRightPane owns activeTab) — BlueprintPlot's and InstrumentReportTabs' own internals are
// covered by their own test files, so fixtures here stay minimal (reused from
// InstrumentReportTabs.test.jsx's proven-safe shape).
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import LocationRightPane from "./LocationRightPane";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<LocationRightPane {...props} />);
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

const location = { id: "loc-1", name: "Above Tunnel 8+300", chainage: 8300, actualChainage: 8360 };
const instruments = [{ id: "inc-1", code: "P390", type: "INCLINOMETER", installStatus: "PENDING", blueprintPage: 2, blueprintX: 19, blueprintY: 43 }];
const readings = [
  {
    instrumentId: "inc-1",
    date: "2026-01-01",
    tbmChainage: 8150,
    sourcePdf: "preset-8+300",
    profileJson: JSON.stringify({ points: [{ depth: 0, a: 0, b: 0 }], _thresholds: { alert: 15, alarm: 17, action: 20 } }),
  },
];

function findTabButton(container, label) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(label));
  expect(btn).toBeTruthy();
  return btn;
}

test("defaults to the BLUEPRINT tab: shows BlueprintPlot's banner", () => {
  const { container, root } = mount({ location, instruments, readings });
  expect(container.textContent).toContain("INSTRUMENT PLAN");
  expect(container.textContent).not.toContain("Measurement Report");
  unmount(container, root);
});

test("switching to CHART renders InstrumentReportTabs and hides the blueprint banner", () => {
  const { container, root } = mount({ location, instruments, readings });
  click(findTabButton(container, "CHART"));
  expect(container.textContent).toContain("Measurement Report");
  expect(container.textContent).not.toContain("INSTRUMENT PLAN");
  unmount(container, root);
});

test("switching back to BLUEPRINT restores the blueprint pane", () => {
  const { container, root } = mount({ location, instruments, readings });
  click(findTabButton(container, "CHART"));
  expect(container.textContent).toContain("Measurement Report");
  click(findTabButton(container, "BLUEPRINT"));
  expect(container.textContent).toContain("INSTRUMENT PLAN");
  expect(container.textContent).not.toContain("Measurement Report");
  unmount(container, root);
});

test("CHART tab with no recognized instrument types renders nothing extra, without crashing", () => {
  const { container, root } = mount({ location, instruments: [], readings: [] });
  click(findTabButton(container, "CHART"));
  expect(container.textContent).not.toContain("INSTRUMENT PLAN");
  expect(container.textContent).not.toContain("Measurement Report");
  unmount(container, root);
});

test("passes allInstruments / onSelectInstrument through to BlueprintPlot", () => {
  const onSelectInstrument = jest.fn();
  const allInstruments = [
    instruments[0],
    { id: "other1", code: "OTH1", type: "EXTENSOMETER", installStatus: "PENDING", blueprintPage: 2, blueprintX: 70, blueprintY: 70 },
  ];
  const { container, root } = mount({ location, instruments, allInstruments, onSelectInstrument, readings });
  expect(container.querySelector("button[title='OTH1']")).toBeTruthy();
  unmount(container, root);
});
