import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import ShiftReportView from "./ShiftReportView";
import { apiCall } from "../../utils/api";

jest.mock("../../utils/api", () => ({ apiCall: jest.fn() }));

// CRA sets resetMocks, so a module-scope implementation is stripped before each test
beforeEach(() => { apiCall.mockImplementation(async () => ({ status: "success" })); });

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

test("a report arriving from the server mid-typing does not replace what the crew filled in", () => {
  // a device with no cached copy (fresh install, or a report created on another phone after this
  // device's last refresh) starts on a blank form and is usable during the fetch
  const form = render(view({ shiftReports: [] }));
  type(form.container, "Engineer", "3");
  type(form.container, "Operator", "2");

  const arriving = {
    id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1",
    manpower: { Engineer: "9", Operator: "9" }, result: {}, events: {},
  };
  form.rerender(view({ shiftReports: [arriving], segmentRecords: [...segments] }));

  expect(form.value("Engineer")).toBe("3");
  expect(form.value("Operator")).toBe("2");
  expect(form.container.textContent).toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  form.unmount();
});

test("a report arriving on an untouched form is loaded normally", () => {
  const form = render(view({ shiftReports: [] }));

  const arriving = {
    id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1",
    manpower: { Engineer: "9" }, result: {}, events: {},
  };
  form.rerender(view({ shiftReports: [arriving], segmentRecords: [...segments] }));

  expect(form.value("Engineer")).toBe("9");
  expect(form.container.textContent).not.toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  form.unmount();
});

test("input typed while a save is in flight is not discarded when it resolves", async () => {
  // the payload is built before the request goes out, and a GAS round trip takes seconds on a
  // tunnel link — clearing the dirty flag unconditionally on resolve threw away anything typed
  // meanwhile, and the arriving row then loaded over the form
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  // mirror the saved row back into the view the way App does, or the arriving copy never lands
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));
  type(form.container, "Engineer", "6");

  await act(async () => {
    const save = [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent));
    save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // the crew keeps typing while the request is in flight
  type(form.container, "Surveyor", "2");
  await act(async () => { release(); });
  form.rerender(view({ shiftReports: rows, setShiftReports }));

  expect(form.value("Engineer")).toBe("6");
  expect(form.value("Surveyor")).toBe("2");
  form.unmount();
});

test("a notice raised for a row that then disappears does not linger", () => {
  const saved = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: { Engineer: "7" }, result: {}, events: {} };
  const form = render(view({ shiftReports: [] }));
  type(form.container, "Engineer", "9");

  form.rerender(view({ shiftReports: [saved] }));
  expect(form.container.textContent).toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");

  form.rerender(view({ shiftReports: [] }));

  expect(form.container.textContent).not.toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  expect(form.value("Engineer")).toBe("9");
  form.unmount();
});

test("a server copy differing only in key order is not reported as a change", () => {
  // must start from a loaded, quiet form: asserting while a notice is already up cannot tell the
  // two behaviours apart, because both render identically
  const cached = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: { Engineer: "3", Worker: "1" }, result: {}, events: {} };
  const form = render(view({ shiftReports: [cached] }));
  expect(form.value("Engineer")).toBe("3");
  type(form.container, "Surveyor", "5");
  expect(form.container.textContent).not.toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");

  // same data, different insertion order
  form.rerender(view({ shiftReports: [{ ...cached, manpower: { Worker: "1", Engineer: "3" } }] }));

  expect(form.container.textContent).not.toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  expect(form.value("Surveyor")).toBe("5");
  form.unmount();
});

test("a time-bar auto-save keeps input typed while it is in flight", async () => {
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));

  const click = el => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const setValue = (el, value) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // add a time bar, which auto-saves without reloading the form
  click(form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]'));
  const times = form.container.querySelectorAll('input[type="time"]');
  setValue(times[0], "08:00");
  setValue(times[1], "09:00");
  await act(async () => {
    const add = [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent));
    add.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  type(form.container, "Engineer", "4"); // typed while the auto-save is still in flight
  await act(async () => { release(); });
  form.rerender(view({ shiftReports: rows, setShiftReports }));
  expect(form.value("Engineer")).toBe("4");

  // and it is still there when a copy from another device lands afterwards: the auto-save's payload
  // predates the typing, so the form has to stay dirty
  const other = { id: "sr-other", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์", manpower: { Engineer: "9" }, result: {}, events: {} };
  form.rerender(view({ shiftReports: [other], setShiftReports }));

  expect(form.value("Engineer")).toBe("4");
  form.unmount();
});

test("two saves overlapping on a new report write one row, not two", async () => {
  const releases = [];
  apiCall.mockImplementation(() => new Promise(resolve => { releases.push(() => resolve({ status: "success" })); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));

  // Save to Cloud goes out first
  await act(async () => {
    const save = [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent));
    save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // a time bar is added before it comes back, so its auto-save goes out too — both while
  // `existingReport` is still falsy
  act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const times = form.container.querySelectorAll('input[type="time"]');
  [["08:00", 0], ["09:00", 1]].forEach(([v, i]) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
    times[i].dispatchEvent(new Event("input", { bubbles: true }));
  }));
  await act(async () => {
    const add = [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent));
    add.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await act(async () => { releases.forEach(r => r()); });

  const ids = apiCall.mock.calls.map(([, payload]) => payload.id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(rows).toHaveLength(1);
  form.unmount();
});

test("a report started on another date does not overwrite the row already saved", async () => {
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));
  const save = async () => {
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    form.rerender(view({ shiftReports: rows, setShiftReports }));
  };

  type(form.container, "Engineer", "3");
  await save();
  expect(rows).toHaveLength(1);

  type(form.container, "date", "2026-07-31"); // a different shift report, still unsaved
  type(form.container, "Engineer", "5");
  await save();

  expect(rows).toHaveLength(2);
  expect(rows[0].manpower.Engineer).toBe("3");
  form.unmount();
});

test("a value typed during a save survives a later snapshot from another device", async () => {
  // the save's own row is recognised by its key, so the guard that matters here is the one on the
  // dirty flag: a value typed while the request was in flight is not in the row that comes back, so
  // the form must still count as dirty when a DIFFERENT copy lands afterwards
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));

  await act(async () => {
    const save = [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent));
    save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  type(form.container, "Engineer", "6"); // in flight — not in the payload already sent
  await act(async () => { release(); });

  // another device's copy of the same shift lands
  const other = { id: "sr-other", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์", manpower: { Engineer: "9" }, result: {}, events: {} };
  form.rerender(view({ shiftReports: [other], setShiftReports }));

  expect(form.value("Engineer")).toBe("6");
  expect(form.container.textContent).toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  form.unmount();
});

test("the crew's own save is never announced as a server copy", async () => {
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));
  type(form.container, "Engineer", "6");

  await act(async () => {
    const save = [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent));
    save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  type(form.container, "Surveyor", "2"); // keeps the form dirty through the round trip
  await act(async () => { release(); });
  form.rerender(view({ shiftReports: rows, setShiftReports }));

  expect(form.container.textContent).not.toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  form.unmount();
});

test("a save that resolves after a machine switch does not reach the other machine", async () => {
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));
  type(form.container, "Engineer", "6");

  await act(async () => {
    const save = [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent));
    save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  form.rerender(view({ machine: "TBM2", segmentRecords: [], shiftReports: rows, setShiftReports }));
  await act(async () => { release(); });

  expect(rows).toEqual([]); // nothing written back into the other machine's state
  expect(form.value("Engineer")).toBe("");
  form.unmount();
});

test("a server copy differing only in location reaches an untouched form", () => {
  const saved = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "เดิม", manpower: {}, result: {}, events: {} };
  const form = render(view({ shiftReports: [saved] }));
  expect(form.value("location")).toBe("เดิม");

  form.rerender(view({ shiftReports: [{ ...saved, location: "แก้ไขแล้ว" }] }));

  expect(form.value("location")).toBe("แก้ไขแล้ว");
  form.unmount();
});

test("editing the location marks the form as having content to protect", () => {
  const form = render(view({ shiftReports: [] }));
  type(form.container, "location", "อุโมงค์ช่วงพิเศษ");

  const arriving = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "ของเซิร์ฟเวอร์", manpower: {}, result: {}, events: {} };
  form.rerender(view({ shiftReports: [arriving] }));

  expect(form.value("location")).toBe("อุโมงค์ช่วงพิเศษ");
  expect(form.container.textContent).toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  form.unmount();
});

test("a machine switch clears the shift report", () => {
  // ShiftReportView has no other machine reset, so without this a report typed for one machine
  // stayed on screen and was saved into the other machine's sheet
  const form = render(view());
  type(form.container, "Engineer", "3");
  type(form.container, "startSta", "8+010.20");

  form.rerender(view({ machine: "TBM2", segmentRecords: [], shiftReports: [] }));

  expect(form.value("Engineer")).toBe("");
  expect(form.value("startSta")).toBe("");
  form.unmount();
});

test("a report vanishing from the snapshot does not offer to load it", () => {
  // the offered row would be nothing at all, so the button would just wipe the form
  const saved = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: { Engineer: "7" }, result: {}, events: {} };
  const form = render(view({ shiftReports: [saved] }));
  type(form.container, "Engineer", "9");

  form.rerender(view({ shiftReports: [] }));

  expect(form.value("Engineer")).toBe("9");
  expect(form.container.textContent).not.toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  form.unmount();
});

test("a changed server copy under the same id reaches an untouched form", () => {
  // the cache pass and the server pass carry the same id with different content; keying on the id
  // alone left the stale copy on screen and wrote it back on the next save
  const cached = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: { Engineer: "3" }, result: {}, events: {} };
  const form = render(view({ shiftReports: [cached] }));
  expect(form.value("Engineer")).toBe("3");

  form.rerender(view({ shiftReports: [{ ...cached, manpower: { Engineer: "8" } }] }));

  expect(form.value("Engineer")).toBe("8");
  form.unmount();
});

test("discarding for the server copy takes a second confirmation", () => {
  const form = render(view({ shiftReports: [] }));
  type(form.container, "Engineer", "3");
  const arriving = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: { Engineer: "9" }, result: {}, events: {} };
  form.rerender(view({ shiftReports: [arriving] }));

  const click = label => act(() => {
    const button = [...form.container.querySelectorAll("button")].find(b => b.textContent.trim() === label);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  click("โหลดข้อมูลจากเซิร์ฟเวอร์แทน");
  expect(form.value("Engineer")).toBe("3"); // still theirs until confirmed
  expect(form.container.textContent).toContain("ข้อมูลที่กรอกไว้จะหายทั้งหมด");

  click("ยกเลิก");
  expect(form.value("Engineer")).toBe("3");

  click("โหลดข้อมูลจากเซิร์ฟเวอร์แทน");
  click("ยืนยันทับ");
  expect(form.value("Engineer")).toBe("9");
  form.unmount();
});

test("a partial manpower row still renders every role", () => {
  const saved = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: { Engineer: "2" }, result: {}, events: {} };
  const form = render(view({ shiftReports: [saved] }));

  expect(form.value("Engineer")).toBe("2");
  expect(form.value("Worker")).toBe("");
  expect(form.value("Surveyor")).toBe("");
  form.unmount();
});

test("a saved location is restored rather than overwritten by the default", () => {
  const saved = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์ IS2-IS1 ช่วงพิเศษ", manpower: {}, result: {}, events: {} };
  const form = render(view({ shiftReports: [saved] }));

  expect(form.value("location")).toBe("อุโมงค์ IS2-IS1 ช่วงพิเศษ");
  form.unmount();
});

test("a reopened report shows the figure derived from the rings, not the stored one", () => {
  // confirmed behaviour: the Result reflects what was actually excavated this shift, so it
  // self-corrects as rings are recorded. A value typed in the current session is still protected
  // from being overwritten mid-edit (see the tests above); a stored one is not.
  const saved = {
    id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1",
    manpower: {}, events: {},
    result: { startSta: "8+010.20", finishSta: "8+008.80", numberRing: "1", totalDistance: "1.40", progressRate: "1.40" },
  };
  const twoRings = [
    segments[0],
    { id: "s2", ringNo: "P644", startCH: "8+008.80", finishCH: "8+007.40", length: "1.40", status: "Completed", installType: "Permanent", date: "2026-07-30", shift: "Day", installShift: "Day", installStartTime: "09:10" },
  ];

  const form = render(view({ shiftReports: [saved], segmentRecords: twoRings }));

  expect(form.value("numberRing")).toBe("2");
  expect(form.value("progressRate")).toBe("2.80");
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
