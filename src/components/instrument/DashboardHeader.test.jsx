// Task R4a — render smoke test (react-dom/client + act; this repo has no @testing-library,
// matching ScheduleTimeline.test.jsx / InstrumentReportTabs.test.jsx conventions).
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import DashboardHeader from "./DashboardHeader";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<DashboardHeader {...props} />);
  });
  return { container, root };
}

function unmount(container, root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

test("renders title, subtitle, and STA position", () => {
  const { container, root } = mount({ tbmChainage: 8375, ringNo: 42 });
  expect(container.textContent).toContain("Instrument Monitoring");
  expect(container.textContent).toContain("BMA Drainage Tunnel");
  expect(container.textContent).toContain("STA 8+375");
  unmount(container, root);
});

test("Ring pill renders when ringNo is provided", () => {
  const { container, root } = mount({ tbmChainage: 8375, ringNo: 42 });
  expect(container.textContent).toContain("Ring #42");
  unmount(container, root);
});

test("Ring pill is entirely absent (not '#—') when ringNo is not provided — no fabricated ring number", () => {
  const { container, root } = mount({ tbmChainage: 8375 });
  expect(container.textContent).not.toContain("Ring #");
  unmount(container, root);
});

test("does not crash when tbmChainage is null (machineProgress not loaded yet)", () => {
  const { container, root } = mount({ tbmChainage: null });
  expect(container.textContent).toContain("STA -");
  unmount(container, root);
});
