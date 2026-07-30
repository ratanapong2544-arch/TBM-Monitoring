import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import ShiftReportView from "./ShiftReportView";

jest.mock("../../utils/api", () => ({ apiCall: jest.fn() }));

// App re-mirrors segmentRecords/shiftReports with a NEW array identity on every snapshot — the
// offline cache pass, then the server pass, then again on each machine switch. Because the app is
// interactive during the server fetch (Task 7 clears `loading` on the cache pass), a crew can be
// typing a shift report when one of those lands. Manpower and result have no auto-save, so anything
// this form drops on a re-mirror is gone.
const projectInfo = { date: "2026-07-30", shift: "Day", location: "อุโมงค์", tbmNo: "TBM1" };

const segments = [
  { id: "s1", ringNo: "P643", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent", date: "2026-07-30", shift: "Day", installShift: "Day", installStartTime: "08:10" },
];

function render(element) {
  let container;
  let root;
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(element);
  });
  return {
    container,
    value: name => {
      const field = container.querySelector(`[name="${name}"]`);
      return field ? field.value : null;
    },
    rerender: next => act(() => { root.render(next); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

function type(container, name, value) {
  act(() => {
    const field = container.querySelector(`[name="${name}"]`);
    const proto = field.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const view = (props = {}) => (
  <ShiftReportView projectInfo={projectInfo} segmentRecords={segments} shiftReports={[]}
    setShiftReports={() => {}} machine="TBM1" {...props} />
);

test("a snapshot landing mid-edit does not wipe typed manpower", () => {
  const form = render(view());
  type(form.container, "Engineer", "3");
  expect(form.value("Engineer")).toBe("3");

  // the server pass returns the same rows, but as a new array
  form.rerender(view({ segmentRecords: [...segments] }));

  expect(form.value("Engineer")).toBe("3");
  form.unmount();
});

test("a snapshot landing mid-edit does not wipe typed result fields", () => {
  const form = render(view());
  type(form.container, "startSta", "8+000.00");
  type(form.container, "progressRate", "9.99");

  form.rerender(view({ segmentRecords: [...segments] }));

  expect(form.value("startSta")).toBe("8+000.00");
  expect(form.value("progressRate")).toBe("9.99");
  form.unmount();
});

test("a snapshot landing mid-edit does not revert unsaved corrections to a saved report", () => {
  const saved = {
    id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1",
    manpower: { Engineer: "1" }, result: { startSta: "8+010.20" }, events: {},
  };
  const form = render(view({ shiftReports: [saved] }));
  expect(form.value("Engineer")).toBe("1");

  type(form.container, "Engineer", "4");
  // a re-mirror hands the view an equal-but-new report object
  form.rerender(view({ shiftReports: [{ ...saved }], segmentRecords: [...segments] }));

  expect(form.value("Engineer")).toBe("4");
  form.unmount();
});

test("the auto-derived result still fills in as rings are recorded", () => {
  const form = render(view({ segmentRecords: [] }));
  expect(form.value("numberRing")).toBe("");

  form.rerender(view({ segmentRecords: segments }));

  expect(form.value("numberRing")).toBe("1");
  expect(form.value("startSta")).toBe("8+010.20");
  form.unmount();
});

test("switching to a different shift loads that shift's own report", () => {
  const form = render(view());
  type(form.container, "Engineer", "3");

  form.rerender(view({ projectInfo: { ...projectInfo, shift: "Night" } }));

  // a different report is being edited now, so the form resets rather than carrying the day shift
  expect(form.value("Engineer")).toBe("");
  form.unmount();
});
