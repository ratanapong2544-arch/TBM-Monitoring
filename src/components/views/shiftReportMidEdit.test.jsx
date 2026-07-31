import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

// Without this React does not warn when a state update escapes an act scope — and every test here
// turns on the flush ordering of async saves, queued chain runs and passive effects. The one warning
// that would catch a stale read was suppressed in exactly the file that needed it.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import ShiftReportView, { __resetShiftSaveStateForTests, SHIFT_SAVE_TIMEOUT_MS } from "./ShiftReportView";
import { apiCall } from "../../utils/api";

jest.mock("../../utils/api", () => ({ apiCall: jest.fn() }));

// CRA sets resetMocks, so a module-scope implementation is stripped before each test
beforeEach(() => {
  apiCall.mockImplementation(async () => ({ status: "success" }));
  // the save bookkeeping deliberately outlives a mount, so it has to be cleared between tests
  __resetShiftSaveStateForTests();
});

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
  // the sheet appends on `addShiftReport` without checking the id, so a shared id is not enough:
  // the second save has to go out as an update, which means it must not start until the first lands
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

  // the queued save is still waiting on the first
  expect(apiCall).toHaveBeenCalledTimes(1);
  await act(async () => { releases[0](); });
  await act(async () => { releases[1](); });

  const actions = apiCall.mock.calls.map(([action]) => action);
  const ids = apiCall.mock.calls.map(([, payload]) => payload.id);
  expect(actions).toEqual(["addShiftReport", "updateShiftReport"]);
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

test("the crew's own save is not announced as a server copy", async () => {
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
  await act(async () => { release(); });
  form.rerender(view({ shiftReports: rows, setShiftReports }));

  expect(form.container.textContent).not.toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  expect(form.value("Engineer")).toBe("6");
  form.unmount();
});

test("a row that arrives without what was typed mid-flight is announced, not silently trusted", async () => {
  // The own-write key says "this row is mine, leave the form alone". That is only true while the
  // form still holds what was sent. Type during the round trip and the arriving row is missing it,
  // so claiming the row would make the view skip loading it — and the next save, rebuilt from the
  // form, would overwrite the sheet with the stale copy. Showing the notice is the safe side.
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));
  type(form.container, "Engineer", "6");

  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  type(form.container, "Surveyor", "2"); // not in the payload already sent
  await act(async () => { release(); });
  form.rerender(view({ shiftReports: rows, setShiftReports }));

  expect(form.container.textContent).toContain("มีรายงานกะนี้จากเซิร์ฟเวอร์");
  expect(form.value("Surveyor")).toBe("2"); // and what they typed is still there
  form.unmount();
});

test("a time bar recorded while the form was reloaded is not erased by the next save", async () => {
  // Leaving the report and coming back reloads the form from the stored copy, which does not yet
  // contain the in-flight time bar. Claiming the own-write key then made the view skip loading the
  // row that save produced, so the next save rebuilt its payload from the stale form and dropped the
  // recorded bar — delay minutes gone from an official shift report, with no error.
  const stored = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์", manpower: {}, result: {}, events: {} };
  let rows = [stored];
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));

  // record a time bar; its auto-save starts travelling
  act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const times = form.container.querySelectorAll('input[type="time"]');
  [["08:00", 0], ["09:00", 1]].forEach(([v, i]) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
    times[i].dispatchEvent(new Event("input", { bubbles: true }));
  }));
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // the crew checks the other machine and comes back while it travels. Nothing is typed, so only
  // the form RELOAD tells this save that the view no longer holds what it sent.
  form.rerender(view({ machine: "TBM2", segmentRecords: [], shiftReports: [], setShiftReports }));
  form.rerender(view({ shiftReports: rows, setShiftReports }));
  await act(async () => { release(); });
  form.rerender(view({ shiftReports: rows, setShiftReports }));

  // The form must now be showing the row the save produced. Asserting the stored row alone would
  // pass either way (commitSaved runs regardless); what matters is that the NEXT save carries the
  // bar, because that is the write that erased it.
  apiCall.mockImplementation(async () => ({ status: "success" }));
  type(form.container, "Engineer", "4");
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const lastPayload = apiCall.mock.calls[apiCall.mock.calls.length - 1][1];
  expect(Object.values(JSON.parse(lastPayload.events)).flat()).toHaveLength(1);
  expect(lastPayload.events).toContain("08:00");
  form.unmount();
});

test("a save that resolves after a machine switch does not reach the other machine", async () => {
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  let currentMachine = "TBM1";
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  // App answers the machine question, so the guard has to be driven through that prop — a local ref
  // would pass this test while still being frozen for the case below
  const isCurrentMachine = m => m === currentMachine;
  const form = render(view({ shiftReports: rows, setShiftReports, isCurrentMachine }));
  type(form.container, "Engineer", "6");

  await act(async () => {
    const save = [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent));
    save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  currentMachine = "TBM2";
  form.rerender(view({ machine: "TBM2", segmentRecords: [], shiftReports: rows, setShiftReports, isCurrentMachine }));
  await act(async () => { release(); });

  expect(rows).toEqual([]); // nothing written back into the other machine's state
  expect(form.value("Engineer")).toBe("");
  form.unmount();
});

test("a save that resolves after the form unmounts does not reach the other machine", async () => {
  // the machine switcher is in the TopBar, so the crew can save, tap another nav item (this view
  // unmounts, freezing any ref inside it), then switch machine
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  let currentMachine = "TBM1";
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports, isCurrentMachine: m => m === currentMachine }));
  type(form.container, "Engineer", "6");
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  form.unmount();          // navigated away
  currentMachine = "TBM2"; // then switched machine
  await act(async () => { release(); });

  expect(rows).toEqual([]);
});

test("a save queued before the crew changed date still writes its own report", async () => {
  // The queued save's payload was frozen for the 30th. Resolving its row identity when it finally
  // runs — after the form moved to the 31st — made it either append a SECOND row for the 30th or
  // overwrite the 31st's row with the 30th's content. Both were silent.
  const releases = [];
  apiCall.mockImplementation(() => new Promise(resolve => { releases.push(() => resolve({ status: "success" })); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));

  type(form.container, "Engineer", "3");
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // a time bar is added while that save travels, so its auto-save is queued behind it
  act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const times = form.container.querySelectorAll('input[type="time"]');
  [["08:00", 0], ["09:00", 1]].forEach(([v, i]) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
    times[i].dispatchEvent(new Event("input", { bubbles: true }));
  }));
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  type(form.container, "date", "2026-07-31"); // the crew moves on before either lands
  await act(async () => { releases[0](); });
  await act(async () => { releases[1](); });

  const [first, second] = apiCall.mock.calls;
  expect(first[1].date).toBe("2026-07-30");
  expect(second[1].date).toBe("2026-07-30");   // the queued save still belongs to the 30th
  expect(second[1].id).toBe(first[1].id);      // and to the row the first one created
  expect(second[0]).toBe("updateShiftReport"); // so it updates rather than appending a duplicate
  expect(rows).toHaveLength(1);
  form.unmount();
});

test("a save stalled on one report does not block another report's save", async () => {
  // One chain for everything meant a request that never answers — a captive portal, a tunnel link
  // that goes quiet — held back every later save for every date, shift and both machines.
  apiCall.mockImplementation(action => (action === "addShiftReport" && apiCall.mock.calls.length === 1
    ? new Promise(() => {})   // the first save never answers
    : Promise.resolve({ status: "success" })));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));

  type(form.container, "Engineer", "3");
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // a different day's report must still reach the sheet. Its time-bar auto-save is the path that
  // was silently swallowed — no alert, no console error, the bar simply never left the device.
  type(form.container, "date", "2026-07-31");
  act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const times = form.container.querySelectorAll('input[type="time"]');
  [["19:00", 0], ["20:00", 1]].forEach(([v, i]) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
    times[i].dispatchEvent(new Event("input", { bubbles: true }));
  }));
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(apiCall).toHaveBeenCalledTimes(2);
  expect(apiCall.mock.calls[1][1].date).toBe("2026-07-31");
  expect(rows).toHaveLength(1);
  form.unmount();
});

test("a save that never answers gives up and says the outcome is unknown", async () => {
  // without a deadline the button stays disabled reading "Saving…" for the rest of the session, and
  // the only recovery — a page reload — discards everything typed
  jest.useFakeTimers();
  const alerts = [];
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(message => alerts.push(message));
  try {
    apiCall.mockImplementation(() => new Promise(() => {}));
    const form = render(view({ shiftReports: [], setShiftReports: () => {} }));
    type(form.container, "Engineer", "3");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const saveButton = () => [...form.container.querySelectorAll("button")].find(b => /Save to Cloud|Saving/.test(b.textContent));
    expect(saveButton().disabled).toBe(true);

    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });

    expect(alerts.join(" ")).toContain("ไม่ทราบว่าบันทึกสำเร็จหรือไม่");
    expect(saveButton().disabled).toBe(false);
    form.unmount();
  } finally {
    alertSpy.mockRestore();
    jest.useRealTimers();
  }
});

test("a timed-out save does not let the next one append a second row", async () => {
  // The deadline rejects the wrapper; it cannot cancel the request, which is still travelling and
  // may yet append the row. Sending again before the server has settled the question would put two
  // rows on the sheet for one date and shift — and the auto-save path would do it with nothing on
  // screen. The crew's own time bars are the trigger, so this needs no mistake by anyone.
  jest.useFakeTimers();
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  try {
    apiCall.mockImplementation(() => new Promise(() => {})); // never answers
    let rows = [];
    const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
    const form = render(view({ shiftReports: rows, setShiftReports }));

    const addTimeBar = async (start, end) => {
      act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      const times = form.container.querySelectorAll('input[type="time"]');
      [[start, 0], [end, 1]].forEach(([v, i]) => act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
        times[i].dispatchEvent(new Event("input", { bubbles: true }));
      }));
      await act(async () => {
        [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent))
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    };

    await addTimeBar("08:00", "09:00");        // auto-save 1 goes out and never answers
    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });
    expect(apiCall.mock.calls[0][0]).toBe("addShiftReport");
    // the crew is told, rather than the failure being swallowed
    expect(form.container.textContent).toContain("ไม่ทราบผลการบันทึกล่าสุด");

    await addTimeBar("09:00", "10:00");        // routine next bar, same report

    expect(apiCall).toHaveBeenCalledTimes(1);  // nothing new sent while the outcome is unknown
    form.unmount();
  } finally {
    alertSpy.mockRestore();
    jest.useRealTimers();
  }
});

test("the crew's own check against the server is what resumes saving", async () => {
  // Blocking must not be permanent, and the release has to be CAUSAL: only a fetch issued after we
  // gave up waiting can say whether the request landed. This one is — the crew presses it. Inferring
  // from an ambient snapshot was wrong three rounds running, because those may have read the sheet
  // long before our request reached it.
  jest.useFakeTimers();
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  try {
    apiCall.mockImplementation(() => new Promise(() => {}));
    let rows = [];
    const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
    // `serverPayload` is the GAS response untouched — the only shape that answers "is it on the
    // sheet?", since `data` carries this device's own unsynced records merged back in
    let onRefresh = async () => ({ serverPayload: { status: "success", shiftReports: [] } });
    const form = render(view({ shiftReports: rows, setShiftReports, onRefresh: () => onRefresh() }));
    type(form.container, "Engineer", "3");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });
    const sentId = apiCall.mock.calls[0][1].id;

    // the check comes back: the row DID land after all
    const landed = { id: sentId, date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์", manpower: { Engineer: "3" }, result: {}, events: {} };
    onRefresh = async () => ({ serverPayload: { status: "success", shiftReports: [landed] } });
    apiCall.mockImplementation(async () => ({ status: "success" }));
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /ตรวจสอบกับเซิร์ฟเวอร์/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(form.container.textContent).not.toContain("ไม่ทราบผลการบันทึกล่าสุด");

    type(form.container, "Surveyor", "2");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(apiCall.mock.calls[1][0]).toBe("updateShiftReport"); // the row exists, so update it
    expect(apiCall.mock.calls[1][1].id).toBe(sentId);
    form.unmount();
  } finally {
    alertSpy.mockRestore();
    jest.useRealTimers();
  }
});

test("a check that finds no row lets the next save append, once", async () => {
  jest.useFakeTimers();
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  try {
    apiCall.mockImplementation(() => new Promise(() => {}));
    let rows = [];
    const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
    const form = render(view({ shiftReports: rows, setShiftReports, onRefresh: async () => ({ serverPayload: { status: "success", shiftReports: [] } }) }));
    type(form.container, "Engineer", "3");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });
    const sentId = apiCall.mock.calls[0][1].id;

    apiCall.mockImplementation(async () => ({ status: "success" }));
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /ตรวจสอบกับเซิร์ฟเวอร์/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // the row was genuinely absent when the crew checked, so appending is correct — and it reuses
    // the same draft id, so a later refresh cannot mistake it for a second report
    expect(apiCall.mock.calls[1][0]).toBe("addShiftReport");
    expect(apiCall.mock.calls[1][1].id).toBe(sentId);
    form.unmount();
  } finally {
    alertSpy.mockRestore();
    jest.useRealTimers();
  }
});

test("a check ignores the app's own merged snapshot and reads the server's answer", async () => {
  // `repository.refresh().data` re-injects unsynced local records and overlays optimistic payloads,
  // so the row it shows can be this device's echo of the very write being asked about. Counting that
  // as confirmation would release the block and send `updateShiftReport` for a row GAS never had —
  // which no-ops silently, losing the report. Only `serverPayload` answers the question.
  jest.useFakeTimers();
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  try {
    apiCall.mockImplementation(() => new Promise(() => {}));
    // the merged view echoes back OUR OWN unsynced record — same id we sent — while the sheet has
    // nothing for this shift. That is what `writeServerSnapshot` does with a retained local record.
    let mergedRows = [];
    const form = render(view({
      shiftReports: [], setShiftReports: () => {},
      onRefresh: async () => ({
        data: { shiftReports: mergedRows },
        serverPayload: { status: "success", shiftReports: [] },
      }),
    }));
    type(form.container, "Engineer", "3");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });
    const sentId = apiCall.mock.calls[0][1].id;
    mergedRows = [{ id: sentId, date: "2026-07-30", shift: "Day", tbmNo: "TBM1", manpower: {}, result: {}, events: {} }];

    apiCall.mockImplementation(async () => ({ status: "success" }));
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /ตรวจสอบกับเซิร์ฟเวอร์/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // the sheet had no row, so appending is correct — an update would have been written nowhere
    expect(apiCall.mock.calls[1][0]).toBe("addShiftReport");
    expect(apiCall.mock.calls[1][1].id).toBe(sentId);
    form.unmount();
  } finally {
    alertSpy.mockRestore();
    jest.useRealTimers();
  }
});

test("a response that omits the shift reports entirely is not read as 'no row'", async () => {
  // the normalizer maps an absent key to [], so an older GAS deployment or a partial doGet looks
  // exactly like an empty sheet — the same ambiguity App refuses to act on when mirroring
  jest.useFakeTimers();
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  try {
    apiCall.mockImplementation(() => new Promise(() => {}));
    const form = render(view({
      shiftReports: [], setShiftReports: () => {},
      onRefresh: async () => ({ serverPayload: { status: "success", segments: [] } }), // no shiftReports key
    }));
    type(form.container, "Engineer", "3");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });

    apiCall.mockImplementation(async () => ({ status: "success" }));
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /ตรวจสอบกับเซิร์ฟเวอร์/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(form.container.textContent).toContain("ตรวจสอบไม่สำเร็จ");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(apiCall).toHaveBeenCalledTimes(1); // still blocked
    form.unmount();
  } finally {
    alertSpy.mockRestore();
    jest.useRealTimers();
  }
});

test("a time bar cannot create a report before this machine's rows have arrived", async () => {
  // The disabled Save button hides this: React drops clicks on a disabled button, so a test that
  // only clicks it passes with the guard deleted. The auto-save path has no button at all — a time
  // bar creates the report by itself — and on a cold launch that would append a second row for a
  // shift the sheet already has, because `existingReport` is null until the rows land.
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports, snapshotReady: false }));

  act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const times = form.container.querySelectorAll('input[type="time"]');
  [["08:00", 0], ["09:00", 1]].forEach(([v, i]) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
    times[i].dispatchEvent(new Event("input", { bubbles: true }));
  }));
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(apiCall).not.toHaveBeenCalled();
  expect(rows).toEqual([]);
  form.unmount();
});

test("an update is not refused while the snapshot is still loading", async () => {
  // the gate is against APPENDING a duplicate. An update carries an id already known to be on the
  // sheet, so refusing it would only discard a recorded time bar — which is what happened when the
  // gate was read at execution time and a machine switch flipped it mid-flight.
  const stored = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์", manpower: {}, result: {}, events: {} };
  let rows = [stored];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports, snapshotReady: false }));

  act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const times = form.container.querySelectorAll('input[type="time"]');
  [["08:00", 0], ["09:00", 1]].forEach(([v, i]) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
    times[i].dispatchEvent(new Event("input", { bubbles: true }));
  }));
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(apiCall).toHaveBeenCalledTimes(1);
  expect(apiCall.mock.calls[0][0]).toBe("updateShiftReport");
  form.unmount();
});

test("a queued save is judged on the snapshot state when the crew acted", async () => {
  // `snapshotReady` describes the machine currently selected; a queued save belongs to whichever
  // machine it was started on. Reading it when the request finally runs threw away a time bar that
  // belonged to the OTHER machine's report — which the switch had already cleared from the form, so
  // it was gone from screen and sheet alike.
  const releases = [];
  // the first save FAILS, so the queued one is still an append when it runs — the only case the
  // gate looks at, and the case where reading it late judges the wrong machine
  apiCall.mockImplementation(() => new Promise((resolve, reject) => { releases.push(() => reject(new Error("NETWORK"))); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports, snapshotReady: true }));

  const addBar = async (start, end) => {
    act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const times = form.container.querySelectorAll('input[type="time"]');
    [[start, 0], [end, 1]].forEach(([v, i]) => act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
      times[i].dispatchEvent(new Event("input", { bubbles: true }));
    }));
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  await addBar("08:00", "09:00");   // save 1 goes out and stalls
  await addBar("09:00", "10:00");   // save 2 queues behind it, judged as of NOW

  // the crew switches machine while both are in flight: the new machine's rows have not landed
  form.rerender(view({ shiftReports: rows, setShiftReports, snapshotReady: false }));
  await act(async () => { releases[0](); });
  await act(async () => { if (releases[1]) releases[1](); });

  expect(apiCall).toHaveBeenCalledTimes(2); // the queued bar was still sent
  form.unmount();
});

test("Save stays available for a report the sheet already has, with no snapshot", async () => {
  // The button gated updates as well as appends, which is the opposite of the save path's rule. On a
  // marginal link the 463 KB snapshot can time out while a kilobyte write lands fine, and manpower —
  // the one field group with no auto-save — would have been lost on the next nav tap with Save dead.
  const stored = { id: "sr1", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์", manpower: {}, result: {}, events: {} };
  let rows = [stored];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports, snapshotReady: false }));

  const save = [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent));
  expect(save.disabled).toBe(false);
  expect(form.container.textContent).not.toContain("ยังไม่ได้ข้อมูลรายงานกะของเครื่องนี้");

  type(form.container, "Engineer", "4");
  await act(async () => { save.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

  expect(apiCall).toHaveBeenCalledTimes(1);
  expect(apiCall.mock.calls[0][0]).toBe("updateShiftReport");
  form.unmount();
});

test("a check that cannot reach the server leaves the block in place", async () => {
  jest.useFakeTimers();
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  try {
    apiCall.mockImplementation(() => new Promise(() => {}));
    const form = render(view({ shiftReports: [], setShiftReports: () => {}, onRefresh: async () => null }));
    type(form.container, "Engineer", "3");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });

    apiCall.mockImplementation(async () => ({ status: "success" }));
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /ตรวจสอบกับเซิร์ฟเวอร์/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(form.container.textContent).toContain("ไม่ทราบผลการบันทึกล่าสุด");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(apiCall).toHaveBeenCalledTimes(1); // still refused
    form.unmount();
  } finally {
    alertSpy.mockRestore();
    jest.useRealTimers();
  }
});

describe("what may release an unknown outcome", () => {
  // The block exists because the timed-out request is still travelling and may yet append the row.
  // Only a server snapshot fetched AFTER we gave up can say where it ended up — and the crew reaches
  // that state through ordinary actions, so each of these was a live route back to a duplicate row.
  const armTimeout = async (form) => {
    apiCall.mockImplementation(() => new Promise(() => {}));
    type(form.container, "Engineer", "3");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { jest.advanceTimersByTime(SHIFT_SAVE_TIMEOUT_MS); });
  };
  const saveAgain = async (form) => {
    apiCall.mockImplementation(async () => ({ status: "success" }));
    type(form.container, "Surveyor", "2");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  let alertSpy;
  beforeEach(() => { jest.useFakeTimers(); alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {}); });
  afterEach(() => { alertSpy.mockRestore(); jest.useRealTimers(); });

  test("another report's successful save does not release it", async () => {
    let rows = [];
    const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
    const form = render(view({ shiftReports: rows, setShiftReports }));
    await armTimeout(form);
    const sentId = apiCall.mock.calls[0][1].id;

    // save a DIFFERENT report; its commit re-mirrors shiftReports with a new identity
    apiCall.mockImplementation(async () => ({ status: "success" }));
    type(form.container, "date", "2026-07-31");
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    form.rerender(view({ shiftReports: rows, setShiftReports }));

    // back to the 30th: still blocked, because the server has never answered
    type(form.container, "date", "2026-07-30");
    await saveAgain(form);

    const idsSent = apiCall.mock.calls.map(c => c[1].id);
    expect(idsSent.filter(sent => sent === sentId)).toHaveLength(1);
    expect(apiCall.mock.calls.filter(c => c[0] === "addShiftReport" && c[1].date === "2026-07-30")).toHaveLength(1);
    form.unmount();
  });

  test("a remount does not release it", async () => {
    let rows = [];
    const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
    const first = render(view({ shiftReports: rows, setShiftReports }));
    // a snapshot lands before the timeout, so the first mount is NOT in its initial state — without
    // this the two mounts looked identical to any per-mount counter and the test could not tell them
    // apart, which is exactly the divergence it is here to pin
    first.rerender(view({ shiftReports: [], setShiftReports }));
    await armTimeout(first);
    const sentId = apiCall.mock.calls[0][1].id;
    first.unmount();                         // a nav tap

    const second = render(view({ shiftReports: rows, setShiftReports }));
    expect(second.container.textContent).toContain("ไม่ทราบผลการบันทึกล่าสุด"); // and the crew still sees why
    await saveAgain(second);

    expect(apiCall.mock.calls.filter(c => c[1].id === sentId)).toHaveLength(1);
    second.unmount();
  });

  test("a snapshot arriving on its own does not release it, whatever it contains", async () => {
    // Any snapshot the app fetched by itself may have read the sheet BEFORE the timed-out request
    // reached it, so an absent row proves nothing — and one that arrives while the request is still
    // travelling proves even less. Only a check the crew issues after we gave up can settle it.
    let rows = [];
    const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
    const form = render(view({ shiftReports: rows, setShiftReports }));
    await armTimeout(form);
    const sentId = apiCall.mock.calls[0][1].id;

    // the cache pass, then the server pass, each a fresh array identity — and neither showing the row
    form.rerender(view({ shiftReports: [], setShiftReports }));
    form.rerender(view({ shiftReports: [{ id: "someone-else", date: "2026-07-30", shift: "Night", tbmNo: "TBM1", manpower: {}, result: {}, events: {} }], setShiftReports }));
    await saveAgain(form);

    expect(apiCall.mock.calls.filter(c => c[1].id === sentId)).toHaveLength(1);
    expect(form.container.textContent).toContain("ไม่ทราบผลการบันทึกล่าสุด");
    form.unmount();
  });
});

test("a remounted form does not append a second row for a report already saved", async () => {
  // any nav tap unmounts this view; the save keeps travelling. Per-mount bookkeeping let the
  // remounted form mint a fresh id and append a duplicate for the same date and shift.
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const first = render(view({ shiftReports: rows, setShiftReports }));
  type(first.container, "Engineer", "3");
  await act(async () => {
    [...first.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  first.unmount();                        // navigated away mid-save
  await act(async () => { release(); });  // the row lands in App's state

  apiCall.mockImplementation(async () => ({ status: "success" }));
  const second = render(view({ shiftReports: [], setShiftReports })); // came back before the snapshot
  type(second.container, "Surveyor", "2");
  await act(async () => {
    [...second.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const calls = apiCall.mock.calls;
  expect(calls[1][1].id).toBe(calls[0][1].id);
  expect(calls[1][0]).toBe("updateShiftReport");
  expect(rows).toHaveLength(1);
  second.unmount();
});

test("a queued save does not clear the dirty flag for edits it never carried", async () => {
  // the edit serial has to be sampled when the save is QUEUED, alongside its payload — sampling it
  // when the queued request starts counts edits made in between as already sent, and the next
  // snapshot then loads over them
  const releases = [];
  apiCall.mockImplementation(() => new Promise(resolve => { releases.push(() => resolve({ status: "success" })); }));
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const form = render(view({ shiftReports: rows, setShiftReports }));

  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  act(() => { form.container.querySelector('[title="เพิ่มเวลาการทำงาน"]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const times = form.container.querySelectorAll('input[type="time"]');
  [["08:00", 0], ["09:00", 1]].forEach(([v, i]) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(times[i], v);
    times[i].dispatchEvent(new Event("input", { bubbles: true }));
  }));
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /เพิ่มช่วงเวลาลงกราฟ/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  type(form.container, "Foreman", "4"); // typed after the second save was queued
  await act(async () => { releases[0](); });
  await act(async () => { releases[1](); });

  // another device's copy of the same shift arrives afterwards
  const other = { id: "sr-other", date: "2026-07-30", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์", manpower: { Foreman: "9" }, result: {}, events: {} };
  form.rerender(view({ shiftReports: [other], setShiftReports }));

  expect(form.value("Foreman")).toBe("4");
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
