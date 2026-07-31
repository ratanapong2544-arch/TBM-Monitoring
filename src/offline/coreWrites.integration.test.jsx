import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

// so React warns when an update escapes an act scope; every case here turns on an async submit
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import SegmentRecordView from "../components/views/SegmentRecordView";
import SegmentDashboardView from "../components/views/SegmentDashboardView";
import GroutRecordView from "../components/views/GroutRecordView";
import GroutDashboardView from "../components/views/GroutDashboardView";
import ShiftReportView, { __resetShiftSaveStateForTests } from "../components/views/ShiftReportView";
import { apiCall } from "../utils/api";

jest.mock("../utils/api", () => ({ apiCall: jest.fn(async () => ({ status: "success" })) }));

// Task 8 routes every core engineering write through the queue instead of `apiCall`. These assert
// the ENVELOPE each view hands to `onMutate` — entityType, operation, machine, recordId, domainKey
// and baseVersion — because that envelope is what GAS keys idempotency and versioning on, and a
// wrong `domainKey` silently splits one record's history into two version streams.
//
// They assert what was SENT, never a notice or a disabled control: Task 7's review proved a notice
// assertion can pass against a source broken in exactly the way the test exists to catch.
const projectInfo = { date: "2026-07-30", shift: "Day", location: "อุโมงค์", tbmNo: "TBM1" };

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
    rerender: next => act(() => { root.render(next); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

function type(container, name, value) {
  act(() => {
    const field = container.querySelector(`[name="${name}"]`);
    if (!field) throw new Error(`no field named ${name}`);
    const proto = field.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const click = async (element) => {
  if (!element) throw new Error("no such control");
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};

const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
const byTitle = (container, title) => container.querySelector(`[title="${title}"]`);
const submit = async (container) => {
  await act(async () => {
    container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

let onMutate;
beforeEach(() => {
  onMutate = jest.fn(async () => ({ optimisticRecord: {} }));
  apiCall.mockImplementation(async () => ({ status: "success" }));
  __resetShiftSaveStateForTests();
});

const noop = () => {};

test("recording a segment queues a create with the ring's domain key", async () => {
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={noop} segmentRecords={[]} setCurrentModule={noop} setActiveTab={noop} machine="TBM1" onMutate={onMutate} />
  );
  type(view.container, "ringNo", "P41");
  type(view.container, "startCH", "8+010.20");
  type(view.container, "finishCH", "8+008.80");
  await submit(view.container);

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "segment",
    operation: "create",
    machine: "TBM1",
    domainKey: "segment:TBM1:P41:Permanent",
    baseVersion: 0,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("saving an in-progress segment queues an update at the version it was read at", async () => {
  const inProgress = [{ id: "seg_1", ringNo: "P41", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "In Progress", installType: "Permanent" }];
  const syncMeta = { "segment:TBM1:P41:Permanent": { version: 3 } };
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={noop} segmentRecords={inProgress} setCurrentModule={noop} setActiveTab={noop} machine="TBM1"
      syncMeta={syncMeta} onMutate={onMutate} />
  );
  await submit(view.container);

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "segment",
    operation: "update",
    machine: "TBM1",
    recordId: "seg_1",
    domainKey: "segment:TBM1:P41:Permanent",
    baseVersion: 3,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("deleting a segment from the data log queues a delete", async () => {
  const records = [{ id: "seg_1", ringNo: "P41", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent", date: "2026-07-30" }];
  const view = render(
    <SegmentDashboardView segmentRecords={records} machine="TBM1"
      syncMeta={{ "segment:TBM1:P41:Permanent": { version: 2 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Delete"));
  await click(button(view.container, /^ลบ$/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "segment",
    operation: "delete",
    machine: "TBM1",
    recordId: "seg_1",
    domainKey: "segment:TBM1:P41:Permanent",
    baseVersion: 2,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("editing a segment from the data log queues an update", async () => {
  const records = [{ id: "seg_1", ringNo: "P41", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent", date: "2026-07-30" }];
  const view = render(
    <SegmentDashboardView segmentRecords={records} machine="TBM1"
      syncMeta={{ "segment:TBM1:P41:Permanent": { version: 2 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  await click(button(view.container, /Save Changes/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "segment",
    operation: "update",
    machine: "TBM1",
    recordId: "seg_1",
    domainKey: "segment:TBM1:P41:Permanent",
    baseVersion: 2,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("recording primary grout queues a create keyed by ring and pass", async () => {
  const segments = [{ id: "s1", ringNo: "P41", keyPos: "4", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent" }];
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={noop} groutRecords={[]} secondaryGroutRecords={[]}
      segmentRecords={segments} setCurrentModule={noop} setActiveTab={noop} machine="TBM1" onMutate={onMutate} />
  );
  type(view.container, "ringNo", "P41");
  type(view.container, "partA", "12.5");
  type(view.container, "partB", "6.25");
  await submit(view.container);

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "grout",
    operation: "create",
    machine: "TBM1",
    domainKey: "grout:TBM1:P41:1st Pass",
    baseVersion: 0,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("recording secondary grout queues a create keyed by its own record id", async () => {
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={noop} groutRecords={[]} secondaryGroutRecords={[]}
      segmentRecords={[]} setCurrentModule={noop} setActiveTab={noop} machine="TBM1" onMutate={onMutate} />
  );
  await click(button(view.container, /Secondary/i));
  type(view.container, "ringNo", "P41");
  type(view.container, "partA", "3.0");
  type(view.container, "partB", "1.5");
  await submit(view.container);

  expect(onMutate).toHaveBeenCalledTimes(1);
  const envelope = onMutate.mock.calls[0][0];
  expect(envelope).toMatchObject({
    entityType: "secondaryGrout",
    operation: "create",
    machine: "TBM1",
    baseVersion: 0,
  });
  // its key carries the record id, so a second injection on the same ring is its own record
  expect(envelope.domainKey).toBe(`secondaryGrout:TBM1:P41:${envelope.recordId}`);
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("editing primary grout from the data log queues an update", async () => {
  const grouts = [{ id: "g1", ringNo: "P41", partA: "12.5", partB: "6.25", pressure: "3.2", total: 18.75, groutPass: "1st Pass", date: "2026-07-30", positions: {} }];
  const view = render(
    <GroutDashboardView groutRecords={grouts} secondaryGroutRecords={[]} segmentRecords={[]} machine="TBM1"
      syncMeta={{ "grout:TBM1:P41:1st Pass": { version: 5 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  await click(button(view.container, /Save Changes/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "grout",
    operation: "update",
    machine: "TBM1",
    recordId: "g1",
    domainKey: "grout:TBM1:P41:1st Pass",
    baseVersion: 5,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("editing grout sends the injection positions as an object, not a string", async () => {
  // the one-shot write stringified these because GAS wanted text; the queue serializes the payload
  // itself on the way out (`serializeSyncRowValues_` encodes each cell once), and the SAME payload
  // is what the snapshot store overlays and the app then renders. Sending a string put a string back
  // on screen — the ring visualiser reads `positions` as an object, and the next save would encode
  // the string again into a cell no parse recovers. The create path is covered elsewhere; the update
  // path lost its stringify in this task and had nothing watching it.
  const grouts = [{ id: "g1", ringNo: "P41", partA: "12.5", partB: "6.25", pressure: "3.2", total: 18.75, groutPass: "1st Pass", date: "2026-07-30", positions: { A: true, B1: false, B2: false, C1: false, C2: false, K: false } }];
  const view = render(
    <GroutDashboardView groutRecords={grouts} secondaryGroutRecords={[]} segmentRecords={[]} machine="TBM1"
      syncMeta={{ "grout:TBM1:P41:1st Pass": { version: 5 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  await click(button(view.container, /Save Changes/));

  const { payload } = onMutate.mock.calls[0][0];
  expect(typeof payload.positions).toBe("object");
  expect(payload.positions).toMatchObject({ A: true, K: false });
  view.unmount();
});

test("deleting primary grout from the data log queues a delete", async () => {
  const grouts = [{ id: "g1", ringNo: "P41", partA: "12.5", partB: "6.25", pressure: "3.2", total: 18.75, groutPass: "1st Pass", date: "2026-07-30", positions: {} }];
  const view = render(
    <GroutDashboardView groutRecords={grouts} secondaryGroutRecords={[]} segmentRecords={[]} machine="TBM1"
      syncMeta={{ "grout:TBM1:P41:1st Pass": { version: 5 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Delete"));
  await click(button(view.container, /^ลบ$/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "grout",
    operation: "delete",
    machine: "TBM1",
    recordId: "g1",
    domainKey: "grout:TBM1:P41:1st Pass",
    baseVersion: 5,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

// The data log merges primary and secondary into one table and picks the entity type from the row.
// That branch is the whole risk: a secondary edit filed as a `grout` mutation writes to the primary
// sheet, and its domain key would collide with the ring's primary record — one blocking the other in
// the queue. Both operations are covered because the type is chosen separately in each handler.
const secondaryRow = { id: "sg1", ringNo: "P41", partA: "3.0", partB: "1.5", pressure: "2.0", total: 4.5, date: "2026-07-30", positions: {} };

test("editing secondary grout from the data log queues a secondaryGrout update", async () => {
  const view = render(
    <GroutDashboardView groutRecords={[]} secondaryGroutRecords={[secondaryRow]} segmentRecords={[]} machine="TBM1"
      syncMeta={{ "secondaryGrout:TBM1:P41:sg1": { version: 7 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  await click(button(view.container, /Save Changes/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "secondaryGrout",
    operation: "update",
    machine: "TBM1",
    recordId: "sg1",
    domainKey: "secondaryGrout:TBM1:P41:sg1",
    baseVersion: 7,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("deleting secondary grout from the data log queues a secondaryGrout delete", async () => {
  const view = render(
    <GroutDashboardView groutRecords={[]} secondaryGroutRecords={[secondaryRow]} segmentRecords={[]} machine="TBM1"
      syncMeta={{ "secondaryGrout:TBM1:P41:sg1": { version: 7 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Delete"));
  await click(button(view.container, /^ลบ$/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "secondaryGrout",
    operation: "delete",
    machine: "TBM1",
    recordId: "sg1",
    domainKey: "secondaryGrout:TBM1:P41:sg1",
    baseVersion: 7,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("saving a shift report queues a create keyed by its Bangkok date and shift", async () => {
  const view = render(
    <ShiftReportView projectInfo={projectInfo} segmentRecords={[]} shiftReports={[]} machine="TBM1" onMutate={onMutate} />
  );
  type(view.container, "Engineer", "3");
  await click(button(view.container, /Save to Cloud/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "shiftReport",
    operation: "create",
    machine: "TBM1",
    domainKey: "shiftReport:TBM1:2026-07-30:Day",
    baseVersion: 0,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("correcting a mistyped ring keeps writing to the record's own version stream", async () => {
  // The domain key is built from business fields, and the data log lets them be corrected. Keying
  // the write on the EDITED ring asks the server about a record that has never existed under that
  // key — `baseVersion` comes back 0, or, worse, the version belonging to whichever ring the typo
  // now names. The write is then refused as unknown, or it advances a second version stream over
  // one sheet row: two histories for one ring, which is exactly what one derivation exists to stop.
  const records = [{ id: "seg_1", ringNo: "P41", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent", date: "2026-07-30" }];
  const view = render(
    <SegmentDashboardView segmentRecords={records} machine="TBM1"
      syncMeta={{ "segment:TBM1:P41:Permanent": { version: 2 }, "segment:TBM1:P42:Permanent": { version: 88 } }}
      onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  type(view.container, "ringNo", "P42");
  await click(button(view.container, /Save Changes/));

  const envelope = onMutate.mock.calls[0][0];
  expect(envelope.domainKey).toBe("segment:TBM1:P41:Permanent"); // the record's own key, not the typo's
  expect(envelope.baseVersion).toBe(2);                          // its own version, not P42's 88
  expect(envelope.payload.ringNo).toBe("P42");                   // and the correction still travels
  view.unmount();
});

test("a version that arrives from the sheet as text is still a version", async () => {
  // a Sheets cell can hand back "2" rather than 2, and GAS compares loosely for that reason
  // (`checkSyncVersion_("2", 2)` is a match). Refusing it here would quietly send baseVersion 0 —
  // the state where the server accepts an edit made against a row that has since moved on.
  const records = [{ id: "seg_1", ringNo: "P41", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent", date: "2026-07-30" }];
  const view = render(
    <SegmentDashboardView segmentRecords={records} machine="TBM1"
      syncMeta={{ "segment:TBM1:P41:Permanent": { version: "2" } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Delete"));
  await click(button(view.container, /^ลบ$/));

  expect(onMutate.mock.calls[0][0].baseVersion).toBe(2);
  view.unmount();
});

test("saving a shift report that already exists queues an update at its version", async () => {
  // the row's date arrives from GAS as a UTC ISO string; the key must reduce it to the Bangkok
  // calendar date, or an edit of a loaded report keys differently from the report itself
  const stored = [{ id: "sr1", date: "2026-07-29T17:00:00.000Z", shift: "Day", tbmNo: "TBM1", location: "อุโมงค์", manpower: {}, result: {}, events: {} }];
  const view = render(
    <ShiftReportView projectInfo={projectInfo} segmentRecords={[]} shiftReports={stored} machine="TBM1"
      syncMeta={{ "shiftReport:TBM1:2026-07-30:Day": { version: 7 } }} onMutate={onMutate} />
  );
  type(view.container, "Engineer", "4");
  await click(button(view.container, /Save to Cloud/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "shiftReport",
    operation: "update",
    machine: "TBM1",
    recordId: "sr1",
    domainKey: "shiftReport:TBM1:2026-07-30:Day",
    baseVersion: 7,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});
