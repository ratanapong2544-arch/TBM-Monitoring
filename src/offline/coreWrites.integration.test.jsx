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
import { buildMutationEnvelope } from "./mutationEnvelope";
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

test("editing a record does not send the queued-photo marker as its photo URL", async () => {
  // "Attached" is this app's marker for a photo that has not synced yet — there is a photo, no link
  // for it. GAS merges every payload key onto the stored record, so sending it overwrote a real
  // Drive URL the server had already minted: the file is orphaned and both data logs then show no
  // photo at all. With the queue the window is a whole shift, because an edit rides behind the
  // create that uploads the file.
  const grouts = [{ id: "g1", ringNo: "P41", partA: "12.5", partB: "6.25", pressure: "3.2", total: 18.75, groutPass: "1st Pass", date: "2026-07-30", positions: {}, imageUrl: "Attached" }];
  const view = render(
    <GroutDashboardView groutRecords={grouts} secondaryGroutRecords={[]} segmentRecords={[]} machine="TBM1"
      syncMeta={{ "grout:TBM1:P41:1st Pass": { version: 5 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  await click(button(view.container, /Save Changes/));

  expect("imageUrl" in onMutate.mock.calls[0][0].payload).toBe(false);
  view.unmount();
});

test("both photo markers are stripped, and only the markers", async () => {
  // A segment carries two photos under separate field names, and the marker on either would
  // overwrite that photo's real Drive URL on the server. Asserted on the builder directly: no view
  // puts BOTH a marker and a real link into one payload, so driving this through a form would have
  // proved nothing about the field the form happens not to send.
  const envelope = buildMutationEnvelope({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_1",
    payload: { id: "seg_1", ringNo: "P41", installType: "Permanent", imageUrl: "Attached", excavImageUrl: "Attached" },
    syncMeta: { "segment:TBM1:P41:Permanent": { version: 3 } },
  });
  expect("imageUrl" in envelope.payload).toBe(false);
  expect("excavImageUrl" in envelope.payload).toBe(false);

  const withLinks = buildMutationEnvelope({
    entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_1",
    payload: { id: "seg_1", ringNo: "P41", installType: "Permanent", imageUrl: "https://drive.example/1", excavImageUrl: "https://drive.example/2" },
    syncMeta: { "segment:TBM1:P41:Permanent": { version: 3 } },
  });
  expect(withLinks.payload.imageUrl).toBe("https://drive.example/1");
  expect(withLinks.payload.excavImageUrl).toBe("https://drive.example/2");
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

const segmentRow = { id: "seg_1", ringNo: "P41", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent", date: "2026-07-30" };

test("the data log does not offer a record's identity as something to edit", async () => {
  // The key travels with the payload — `repository.mutate` and GAS both recompute it and refuse a
  // mismatch — so a corrected ring would write under the NEW key while the OLD key's metadata stayed
  // behind, alive, describing a ring no row carries. Ring numbers are sequential and never skipped,
  // so that ring is one the machine actually reaches, and recording it then is refused for good.
  // The save refuses the edit (pinned in `repository.write.test.js`), and a field that can only ever
  // be refused is worse than no field: the crew fills it in and is told no. Correcting a ring means
  // deleting the record and recording it again, which the queue handles.
  const view = render(
    <SegmentDashboardView segmentRecords={[segmentRow]} machine="TBM1"
      syncMeta={{ "segment:TBM1:P41:Permanent": { version: 2 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));

  expect(view.container.querySelector('[name="ringNo"]')).toBeNull();
  expect(view.container.querySelector('[name="installType"]')).toBeNull();
  expect(view.container.textContent).toContain("P41"); // shown, just not editable
  // and what is NOT part of the key stays editable
  expect(view.container.querySelector('[name="startCH"]')).not.toBeNull();
  expect(view.container.querySelector('[name="status"]')).not.toBeNull();
  view.unmount();
});

test("the grout data log does not offer the ring either, Re-Grout included", async () => {
  // Re-Grout is the case that makes it plain: no view can create one, so a refused correction there
  // would leave the crew with instructions the app cannot carry out.
  for (const row of [
    { id: "g1", ringNo: "P41", partA: "12.5", partB: "6.25", pressure: "3.2", total: 18.75, groutPass: "1st Pass", date: "2026-07-30", positions: {} },
    { id: "g2", ringNo: "P41", partA: "12.5", partB: "6.25", pressure: "3.2", total: 18.75, groutPass: "Re-Grout", date: "2026-07-30", positions: {} },
  ]) {
    const view = render(
      <GroutDashboardView groutRecords={[row]} secondaryGroutRecords={[]} segmentRecords={[]} machine="TBM1"
        syncMeta={{ "grout:TBM1:P41:1st Pass": { version: 5 } }} onMutate={onMutate} />
    );
    await click(view.container.querySelector("tbody tr"));
    await click(byTitle(view.container, "Edit"));

    expect([row.groutPass, view.container.querySelector('[name="ringNo"]')]).toEqual([row.groutPass, null]);
    expect([row.groutPass, view.container.querySelector('[name="date"]')]).not.toEqual([row.groutPass, null]);
    view.unmount();
  }
});

test("an ordinary edit of a record is not read as a re-identification", async () => {
  // the refusal has to be narrow: everything that is NOT part of the key must stay editable
  const view = render(
    <SegmentDashboardView segmentRecords={[segmentRow]} machine="TBM1"
      syncMeta={{ "segment:TBM1:P41:Permanent": { version: 2 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  type(view.container, "startCH", "8+011.60");
  await click(button(view.container, /Save Changes/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    domainKey: "segment:TBM1:P41:Permanent",
    baseVersion: 2,
  }));
  view.unmount();
});

test("re-saving the open ring under a different number is refused", async () => {
  // the record form's own re-identification path: the ring is prefilled from the row still In
  // Progress, and the crew can type over it before saving. `handleInputChange` also flips
  // installType from a T/P prefix, so this is two key fields moving at once.
  const inProgress = [{ id: "seg_1", ringNo: "P41", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "In Progress", installType: "Permanent" }];
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={noop} segmentRecords={inProgress}
      setCurrentModule={noop} setActiveTab={noop} machine="TBM1"
      syncMeta={{ "segment:TBM1:P41:Permanent": { version: 3 } }} onMutate={onMutate} />
  );
  type(view.container, "ringNo", "P42");
  await submit(view.container);

  expect(onMutate).not.toHaveBeenCalled();
  view.unmount();
});

test("re-saving the open ring is queued when its id names one row, and refused when it names four", async () => {
  // The production sheet spreads one record id over four rings — `seg_1a2b3c4d5e6f` sits on P37,
  // P41, P71 and P81. The form prefills the ring still In Progress, which is the LAST of them, and
  // the identity lookup used to answer with the FIRST: the guard then compared two different rings
  // and refused a save that renamed nothing, telling the crew to delete and re-record a ring — which
  // per open item 1 would brick that ring number. The identity is the row the form loaded now.
  //
  // The save is still refused, for the real reason: GAS resolves by record id and takes the first
  // match, so this write would land on a ring the crew is not looking at. The message says that.
  const row = (ringNo, status) => ({ id: "seg_dup", ringNo, typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status, installType: "Permanent" });
  const alerts = [];
  const alerted = jest.spyOn(window, "alert").mockImplementation(message => alerts.push(message));
  try {
    const unique = render(
      <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={noop} segmentRecords={[row("P81", "In Progress")]}
        setCurrentModule={noop} setActiveTab={noop} machine="TBM1"
        syncMeta={{ "segment:TBM1:P81:Permanent": { version: 3 } }} onMutate={onMutate} />
    );
    await submit(unique.container);
    expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({ domainKey: "segment:TBM1:P81:Permanent", operation: "update" }));
    expect(alerts).toEqual([]);
    unique.unmount();

    onMutate.mockClear();
    const shared = render(
      <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={noop}
        segmentRecords={[row("P37", "Completed"), row("P41", "Completed"), row("P71", "Completed"), row("P81", "In Progress")]}
        setCurrentModule={noop} setActiveTab={noop} machine="TBM1"
        syncMeta={{ "segment:TBM1:P81:Permanent": { version: 3 } }} onMutate={onMutate} />
    );
    await submit(shared.container);
    expect(onMutate).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("ซ้ำกันอยู่ 4 แถว");   // the real cause
    expect(alerts[0]).not.toContain("แก้เลขริง");        // not "you renamed it"
    // and a refusal, not a save that went wrong — nothing was attempted, so the "failed" wrapper
    // that every other error gets must not be prepended to it
    expect(alerts[0]).not.toContain("บันทึกข้อมูลไม่สำเร็จ");
    shared.unmount();
  } finally {
    alerted.mockRestore();
  }
});

// A test stood here driving the grout data log's ring field to prove the save refused a changed
// ring. The field is gone — a control that can only ever be refused is worse than no control — so
// the rule is pinned where it still applies: the field's absence, above, and the envelope builder's
// refusal in `repository.write.test.js`, which is what protects the paths that still pass `identity`.

test("a ring recorded twice claims nothing, so the server can say so", async () => {
  // A create must never carry a version. Taking the key's known one told GAS this was a
  // post-conflict successor: the version matched, and the create was MERGED onto the row already
  // holding that ring — the other shift's record overwritten, and the response a success. At 0 the
  // server answers `conflict`, which is the truth about two crews recording one ring.
  const segments = [{ id: "s1", ringNo: "P41", keyPos: "4", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent" }];
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={noop} groutRecords={[]} secondaryGroutRecords={[]}
      segmentRecords={segments} setCurrentModule={noop} setActiveTab={noop} machine="TBM1"
      syncMeta={{ "grout:TBM1:P41:1st Pass": { version: 12 } }} onMutate={onMutate} />
  );
  type(view.container, "ringNo", "P41");
  type(view.container, "partA", "12.5");
  type(view.container, "partB", "6.25");
  await submit(view.container);

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    operation: "create",
    domainKey: "grout:TBM1:P41:1st Pass",
    baseVersion: 0, // not 12
  }));
  view.unmount();
});

test("a ring the sheet stored untidily still edits under its own key", async () => {
  // The sheet holds whatever it holds — " p41 " — and GAS builds the key from that same value
  // verbatim (`makeSyncRecordKey_` does not trim or upper-case either). So the edit must send the
  // ring exactly as the record carries it: tidying it here would key the write to a ring the server
  // has no metadata for, which is a rename this view was never asked to make.
  const view = render(
    <SegmentDashboardView segmentRecords={[{ ...segmentRow, ringNo: " p41 " }]} machine="TBM1"
      syncMeta={{ "segment:TBM1: p41 :Permanent": { version: 2 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  type(view.container, "startCH", "8+011.60");
  await click(button(view.container, /Save Changes/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    domainKey: "segment:TBM1: p41 :Permanent",
    baseVersion: 2, // the record's own history, found because the key matches the server's
  }));
  expect(onMutate.mock.calls[0][0].payload.ringNo).toBe(" p41 ");
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

test("un-ticking one injection position keeps the others", async () => {
  // A primary row as `GroutRecordView` writes it carries `positions` and no `primaryPositions`. The
  // toggle wrote BOTH maps, and `!(prev.primaryPositions || {})[pos]` on a map that does not exist is
  // `true` — so un-ticking A saved `primaryPositions: {A: true}`, and every consumer prefers that map
  // once anything in it is true. The record came back as "A injected, nothing else": the inverse of
  // what the crew did, with every other position they had recorded dropped.
  const grouts = [{ id: "g1", ringNo: "P41", partA: "12.5", partB: "6.25", pressure: "3.2", total: 18.75, groutPass: "1st Pass", date: "2026-07-30", positions: { A: true, B1: true, C1: true } }];
  const view = render(
    <GroutDashboardView groutRecords={grouts} secondaryGroutRecords={[]} segmentRecords={[]} machine="TBM1"
      syncMeta={{ "grout:TBM1:P41:1st Pass": { version: 5 } }} onMutate={onMutate} />
  );
  await click(view.container.querySelector("tbody tr"));
  await click(byTitle(view.container, "Edit"));
  // the positions are SVG wedges, not buttons: each `<g>` carries the toggle and a `<text>` label
  const wedge = [...view.container.querySelectorAll("svg g")].find(node => node.textContent.trim() === "A");
  await click(wedge);
  await click(button(view.container, /Save Changes/));

  const { positions, primaryPositions } = onMutate.mock.calls[0][0].payload;
  const injected = { ...positions, ...(primaryPositions || {}) };
  expect(Object.keys(injected).filter(key => injected[key])).toEqual(["B1", "C1"]);
  view.unmount();
});

test("the data log refuses an edit or a delete whose record id names more than one row", async () => {
  // This view can reach every duplicate-id row on the sheet, and the delete is the sharp end:
  // `applyOptimisticRow` removes the right ring locally while GAS removes the first id match — a
  // different one. The crew watches P81 go, the sheet loses P37, and the next refresh swaps them
  // back. The record form already refuses this; open item 2a is the server half.
  const row = ringNo => ({ id: "seg_dup", ringNo, typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent", date: "2026-07-30" });
  const alerts = [];
  const alerted = jest.spyOn(window, "alert").mockImplementation(message => alerts.push(message));
  try {
    const view = render(
      <SegmentDashboardView segmentRecords={[row("P37"), row("P81")]} machine="TBM1"
        syncMeta={{ "segment:TBM1:P81:Permanent": { version: 2 } }} onMutate={onMutate} />
    );
    await click(view.container.querySelectorAll("tbody tr")[1]);
    await click(byTitle(view.container, "Edit"));
    await click(button(view.container, /Save Changes/));
    await click(byTitle(view.container, "Delete"));
    await click(button(view.container, /^ลบ$/));

    expect(onMutate).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(2);
    alerts.forEach(message => {
      expect(message).toContain("ซ้ำกันอยู่ 2 แถว");
      expect(message).not.toContain("ไม่สำเร็จ"); // a refusal, not a save that went wrong
    });
    view.unmount();
  } finally {
    alerted.mockRestore();
  }
});
