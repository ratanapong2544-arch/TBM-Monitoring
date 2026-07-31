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

// Every save goes through the queue now, so the default mount supplies it — a view mounted without
// `onMutate` would exercise a path the app no longer has. A test that needs to hold a save in flight
// assigns `onMutateOverride` rather than threading a prop through every render in that test.
let onMutateOverride = null;
const view = (props = {}) => (
  <ShiftReportView projectInfo={projectInfo} segmentRecords={segments} shiftReports={[]}
    setShiftReports={() => {}} machine="TBM1" onMutate={(...args) => (onMutateOverride ? onMutateOverride(...args) : Promise.resolve({}))} {...props} />
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
  onMutateOverride = () => new Promise(resolve => { release = () => resolve({}); });
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
  onMutateOverride = () => new Promise(resolve => { release = () => resolve({}); });
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

test("two saves overlapping on a new report describe one row, not two", async () => {
  // Rewritten against the queue. The rule survives the mechanism: two saves that overlap while
  // `existingReport` is still falsy must not file two reports for one shift. The queue enforces it
  // by `domainKey` — both envelopes carry the same key and the same record id, so the second is an
  // update of the row the first created rather than a second append.
  const onMutate = jest.fn(async () => ({}));
  const form = render(view({ onMutate }));

  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // a time bar is added before that settles, so its auto-save queues too
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

  const envelopes = onMutate.mock.calls.map(([envelope]) => envelope);
  expect(envelopes).toHaveLength(2);
  expect(new Set(envelopes.map(e => e.domainKey)).size).toBe(1);
  expect(new Set(envelopes.map(e => e.recordId)).size).toBe(1);
  expect(apiCall).not.toHaveBeenCalled();
  form.unmount();
});

test("a report started on another date is its own row, not an overwrite", async () => {
  // Rewritten against the queue: reusing the previous date's draft id would have made the second
  // save an update of the first day's report. Different dates are different domain keys and must
  // carry different record ids.
  const onMutate = jest.fn(async () => ({}));
  const form = render(view({ onMutate }));
  const save = async () => {
    await act(async () => {
      [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  type(form.container, "Engineer", "3");
  await save();

  type(form.container, "date", "2026-07-31"); // a different shift report, still unsaved
  type(form.container, "Engineer", "5");
  await save();

  const [first, second] = onMutate.mock.calls.map(([envelope]) => envelope);
  expect(first.domainKey).toBe("shiftReport:TBM1:2026-07-30:Day");
  expect(second.domainKey).toBe("shiftReport:TBM1:2026-07-31:Day");
  expect(second.recordId).not.toBe(first.recordId);
  expect(second.operation).toBe("create");
  form.unmount();
});

test("a value typed during a save survives a later snapshot from another device", async () => {
  // the save's own row is recognised by its key, so the guard that matters here is the one on the
  // dirty flag: a value typed while the request was in flight is not in the row that comes back, so
  // the form must still count as dirty when a DIFFERENT copy lands afterwards
  let release;
  onMutateOverride = () => new Promise(resolve => { release = () => resolve({}); });
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
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  onMutateOverride = envelope => new Promise(resolve => {
    // App applies the optimistic row when the mutation resolves — the view no longer writes it
    release = () => { setShiftReports(prev => [...prev.filter(r => r.id !== envelope.recordId), envelope.payload]); resolve({}); };
  });
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
  let rows = [];
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  onMutateOverride = envelope => new Promise(resolve => {
    release = () => { setShiftReports(prev => [...prev.filter(r => r.id !== envelope.recordId), envelope.payload]); resolve({}); };
  });
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
  const setShiftReports = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  // App applies the optimistic row when the mutation resolves, which is what puts the recorded bar
  // back in front of the reloaded form
  onMutateOverride = envelope => new Promise(resolve => {
    release = () => { setShiftReports(prev => prev.map(r => (r.id === envelope.recordId ? envelope.payload : r))); resolve({}); };
  });
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
  // pass either way (the optimistic apply runs regardless); what matters is that the NEXT save
  // carries the bar, because that is the write that erased it.
  const later = [];
  onMutateOverride = async envelope => { later.push(envelope); return {}; };
  type(form.container, "Engineer", "4");
  await act(async () => {
    [...form.container.querySelectorAll("button")].find(b => /Save to Cloud/.test(b.textContent))
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // the payload carries objects, not JSON strings: the queue serializes on the way out, and this
  // same payload is what the snapshot store overlays and the app renders
  const lastPayload = later[later.length - 1].payload;
  const bars = Object.values(lastPayload.events).flat();
  expect(bars).toHaveLength(1);
  expect(bars[0].start).toBe("08:00");
  form.unmount();
});

test("a save that resolves after a machine switch does not reach the other machine", async () => {
  let release;
  onMutateOverride = () => new Promise(resolve => { release = () => resolve({}); });
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
  onMutateOverride = () => new Promise(resolve => { release = () => resolve({}); });
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
  // Rewritten against the queue: the envelope is what carries the report's identity now, and the
  // queue decides append-versus-update from the domain key rather than the view deciding it.
  const releases = [];
  const onMutate = jest.fn(() => new Promise(resolve => { releases.push(() => resolve({})); }));
  const form = render(view({ onMutate }));

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
  await act(async () => { if (releases[1]) releases[1](); });

  const [first, second] = onMutate.mock.calls.map(([envelope]) => envelope);
  expect(first.payload.date).toBe("2026-07-30");
  expect(second.payload.date).toBe("2026-07-30");   // the queued save still belongs to the 30th
  expect(second.domainKey).toBe("shiftReport:TBM1:2026-07-30:Day");
  expect(second.recordId).toBe(first.recordId);     // and to the row the first one created
  form.unmount();
});

test("a queued save does not clear the dirty flag for edits it never carried", async () => {
  // the edit serial has to be sampled when the save is QUEUED, alongside its payload — sampling it
  // when the queued request starts counts edits made in between as already sent, and the next
  // snapshot then loads over them
  const releases = [];
  onMutateOverride = () => new Promise(resolve => { releases.push(() => resolve({})); });
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
