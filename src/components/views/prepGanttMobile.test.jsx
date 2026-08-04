import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import PrepGanttView from "./PrepGanttView";
import ExecutiveEmptyState from "./ExecutiveEmptyState";
import ExecutiveDashboardView from "./ExecutiveDashboardView";

// jsdom reports 0 for every layout measurement, so the component can never see a viewport width and
// always renders its desktop layout. The phone is the case that broke; this is how the test reaches it.
const withWidth = (px, run) => {
  const original = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "clientWidth");
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => px });
  try { return run(); } finally {
    if (original) Object.defineProperty(window.HTMLElement.prototype, "clientWidth", original);
    else delete window.HTMLElement.prototype.clientWidth;
  }
};

function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

const tasks = [
  { id: "t1", machine: "TBM2", name: "งานประกอบและติดตั้งระบบหัวขุดเจาะอุโมงค์", start: "2026-03-25", end: "2026-06-04", percent: 100 },
  { id: "t2", machine: "TBM2", name: "งาน TBM Commissioning", start: "2026-06-05", end: "2026-06-19", percent: 60 },
];

// the widest the left block may be and still leave room for a bar on the narrowest phone this app
// is used on — an iPhone 13 is 390 CSS px, and the card it sits in takes some of that
const PHONE_WIDTH = 358;

test("the chart is reachable on a phone, not hidden behind the frozen columns", () => {
  // The left block was a fixed 428px of `position: sticky` cells. On a 390px phone that is wider than
  // the viewport, so the columns covered the whole screen and stayed covering it however far the crew
  // scrolled — the bars existed, at coordinates no one could ever see. A Gantt with no visible bar is
  // a table with extra steps.
  const view = withWidth(PHONE_WIDTH, () => render(<PrepGanttView machine="TBM2" tasks={tasks} />));

  const grid = view.container.querySelector("[style*='grid-template-columns']");
  expect(grid).toBeTruthy();
  const widths = grid.style.gridTemplateColumns.split(/\s+/).map(part => parseFloat(part));
  const leftBlock = widths.slice(0, -1).reduce((sum, px) => sum + px, 0);
  const chart = widths[widths.length - 1];

  expect(leftBlock).toBeLessThan(PHONE_WIDTH - 80); // room left over for bars
  expect(chart).toBeGreaterThan(0);
  view.unmount();
});

test("a desktop still gets the full columns, dates and all", () => {
  // The compact layout drops the two date columns. That is a phone concession, not a redesign.
  const view = withWidth(1280, () => render(<PrepGanttView machine="TBM2" tasks={tasks} />));

  expect(view.container.textContent).toContain("เริ่ม");
  expect(view.container.textContent).toContain("จบ");
  const grid = view.container.querySelector("[style*='grid-template-columns']");
  const widths = grid.style.gridTemplateColumns.split(/\s+/).map(part => parseFloat(part));
  expect(widths.slice(0, -1).reduce((sum, px) => sum + px, 0)).toBe(428);
  view.unmount();
});

test("the task name survives the compact layout", () => {
  // Losing the dates is acceptable; losing which task a bar belongs to is not.
  const view = withWidth(PHONE_WIDTH, () => render(<PrepGanttView machine="TBM2" tasks={tasks} />));

  expect(view.container.textContent).toContain("งาน TBM Commissioning");
  expect(view.container.textContent).toContain("100%");
  view.unmount();
});

test("the Executive dashboard's Work Plan card shows the plan the Work Plan tab shows", () => {
  // `PrepGanttView` stopped reading localStorage when the queue arrived and became prop-driven. The
  // Work Plan tab was updated; this embed was not, so it rendered "ยังไม่มีงาน" over a plan with ten
  // tasks in it — the same records, two screens, opposite answers.
  const view = render(<ExecutiveEmptyState machine="TBM2" prepTasks={tasks} />);

  expect(view.container.textContent).toContain("งาน TBM Commissioning");
  expect(view.container.textContent).not.toContain("ยังไม่มีงาน");
  view.unmount();
});

test("an empty plan still says so on the Executive dashboard", () => {
  const view = render(<ExecutiveEmptyState machine="TBM2" prepTasks={[]} />);

  expect(view.container.textContent).toContain("ยังไม่มีงาน");
  view.unmount();
});

test("the whole dashboard, not just the card, carries the plan to the crew", () => {
  // The card's own test passes props straight to it, so it cannot see a dashboard that forgets to
  // pass them on — which is exactly the shape of the bug it was written for, one level up.
  const view = render(
    <ExecutiveDashboardView segmentRecords={[]} groutRecords={[]} dailyReports={[]} machine="TBM2" prepTasks={tasks} />
  );

  expect(view.container.textContent).toContain("งาน TBM Commissioning");
  view.unmount();
});
