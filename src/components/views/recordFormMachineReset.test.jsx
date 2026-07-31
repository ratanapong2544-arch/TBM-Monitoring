import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import SegmentRecordView from "./SegmentRecordView";
import GroutRecordView from "./GroutRecordView";
import { apiCall } from "../../utils/api";

jest.mock("../../utils/api", () => ({ apiCall: jest.fn(async () => ({ status: "success" })) }));

// A record form left open across a machine switch kept the previous machine's ring number and
// chainage. Both prefill effects are guarded on an empty ringNo, so they never corrected it, and a
// submit wrote one machine's ring sequence and CH into the other machine's sheet — the ring numbers
// must stay sequential per machine and the chainage is a real surveyed value.
const projectInfo = { date: "2026-07-30", shift: "Day", location: "L", tbmNo: "TBM1" };

function type(container, name, value) {
  act(() => {
    const field = container.querySelector(`[name="${name}"]`);
    const proto = field.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

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

const tbm1Segments = [
  { id: "s1", ringNo: "P643", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent" },
];

test("a segment form drops the previous machine's ring and chainage on a machine switch", () => {
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={tbm1Segments}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  // prefilled from TBM1's last ring
  expect(view.value("ringNo")).toBe("P644");
  expect(view.value("startCH")).toBe("8+008.80");

  // switching machine also empties the rows (App gates them), so nothing may re-prefill
  view.rerender(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={[]}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );

  expect(view.value("ringNo")).toBe("");
  expect(view.value("startCH")).toBe("");
  expect(view.value("finishCH")).toBe("");
  view.unmount();
});

test("a segment form does not carry ring length or type into the next machine's chainage", () => {
  // the prefill computes finishCH as (last ring's finish − length) and soilVolume from length, so a
  // ring length left over from the other machine produced a wrong chainage for this one
  // an in-progress ring is loaded into the form as-is, so its length becomes the form's length
  const shortRing = [{ id: "s1", ringNo: "P643", typeRing: "C2", keyPos: "16", startCH: "8+010.20", finishCH: "8+009.30", length: "0.90", status: "In Progress", installType: "Permanent", remark: "TBM1 note" }];
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={shortRing}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  expect(view.value("length")).toBe("0.90");

  const tbm2 = [{ id: "s9", ringNo: "P100", typeRing: "C1", keyPos: "16", startCH: "9+499.50", finishCH: "9+498.60", length: "1.40", status: "Completed", installType: "Permanent" }];
  view.rerender(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={tbm2}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );

  // TBM2's own last ring drives the next one: 9+498.60 − 1.40 = 9+497.20, not 9+497.70
  expect(view.value("length")).toBe("1.40");
  expect(view.value("typeRing")).toBe("C1");
  expect(view.value("startCH")).toBe("9+498.60");
  expect(view.value("finishCH")).toBe("9+497.20");
  expect(view.value("remark")).toBe("");
  view.unmount();
});

test("a segment form never overwrites what the crew typed when new records arrive", () => {
  // the prefill runs on every segmentRecords change now, so its `prev.ringNo ? prev : …` guard is
  // the only thing stopping a background refresh from reverting a hand-corrected ring and chainage
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={tbm1Segments}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  expect(view.value("ringNo")).toBe("P644");

  act(() => {
    const ring = view.container.querySelector('[name="ringNo"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(ring, "P700");
    ring.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(view.value("ringNo")).toBe("P700");

  // a server refresh re-mirrors the same rows as a NEW array identity
  view.rerender(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={[...tbm1Segments]}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );

  expect(view.value("ringNo")).toBe("P700");
  view.unmount();
});

test("a grout form drops every carried-over field on a machine switch", () => {
  // asserting only ringNo let Part A/B volumes, injection positions and the derived key segment
  // ride into the other machine's record
  const segmentsWithKey = [{ id: "s1", ringNo: "P643", keyPos: "4", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent" }];
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={[]}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={segmentsWithKey} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  // the crew types the ring being grouted; the key segment then syncs from that segment record
  type(view.container, "ringNo", "P643");
  expect(view.value("keyType")).toBe("4");
  // and fills the grout quantities — these must not ride into the other machine either, so they
  // have to hold non-default values BEFORE the switch or the assertions below prove nothing
  type(view.container, "partA", "12.5");
  type(view.container, "partB", "6.25");
  type(view.container, "pressure", "3.2");
  type(view.container, "remark", "TBM1 note");
  expect(view.value("partA")).toBe("12.5");
  // and ticks injection positions — these ride into the submitted record and drive the ring
  // visualiser's rotation together with keyType, so they must clear too
  act(() => {
    const wedge = view.container.querySelector('svg g[style*="cursor"]');
    wedge.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // TBM2 has no rings yet, so nothing would ever re-sync keyType
  view.rerender(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={[]}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={[]} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );

  expect(view.value("keyType")).toBe("16");
  expect(view.value("ringNo")).toBe("");
  expect(view.value("excavRing")).toBe("");
  expect(view.value("pressure")).toBe("");
  expect(view.value("partA")).toBe("");
  expect(view.value("partB")).toBe("");
  expect(view.value("remark")).toBe("");
  view.unmount();
});

test("a grout machine switch clears the injection positions", async () => {
  // positions are submitted with the record and drive the ring visualiser's rotation, so a wedge
  // ticked on one machine must not be recorded against the other's ring
  apiCall.mockClear();
  const segments = [{ id: "s1", ringNo: "P643", keyPos: "4", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent" }];
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={[]}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={segments} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  act(() => {
    view.container.querySelector('svg g[style*="cursor"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  view.rerender(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={[]}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={[]} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );
  type(view.container, "ringNo", "P1");
  type(view.container, "partA", "5");

  await act(async () => {
    view.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  const [, payload] = apiCall.mock.calls[apiCall.mock.calls.length - 1];
  expect(payload.machine).toBe("TBM2");
  expect(payload.positions).toEqual({ A: false, B1: false, B2: false, C1: false, C2: false, K: false });
  view.unmount();
});

test("a grout save resolving after the form unmounts does not land in the other machine", async () => {
  // same hazard as the segment form: the crew taps another nav item mid-save, then switches machine.
  // Only App can answer which machine is current by then.
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  let currentMachine = "TBM1";
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={rows}
      setGroutRecords={updater => { rows = typeof updater === "function" ? updater(rows) : updater; }}
      secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}} segmentRecords={[]}
      setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1"
      isCurrentMachine={m => m === currentMachine} />
  );
  type(view.container, "ringNo", "P643");
  type(view.container, "partA", "12.5");
  await act(async () => {
    view.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  view.unmount();
  currentMachine = "TBM2";
  await act(async () => { release(); });

  expect(rows).toEqual([]);
});

test("a grout form never overwrites a hand-corrected ring when new records arrive", () => {
  // the twin of the segment guard: the mirror hands this view a new array identity on every
  // snapshot, so without it the typed ring reverts to the computed one and gets submitted
  const segments = [{ id: "s1", ringNo: "P643", keyPos: "4", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "Completed", installType: "Permanent" }];
  const grouts = [{ id: "g1", ringNo: "P640", partA: "1", partB: "1", pressure: "2.5" }];
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={grouts}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={segments} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  const prefilled = view.value("ringNo");
  expect(prefilled).toBeTruthy();

  type(view.container, "ringNo", "P700");
  view.rerender(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={[...grouts]}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={[...segments]} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );

  expect(view.value("ringNo")).toBe("P700");
  view.unmount();
});

test("a segment form does not carry the other machine's row id into a save", async () => {
  // handleSubmit branches on formData.id to choose updateSegment over addSegment, so a leaked id
  // would send an update carrying the previous machine's row id to this machine's sheet
  apiCall.mockClear();
  const inProgress = [{ id: "seg_tbm1_row", ringNo: "P643", typeRing: "C1", keyPos: "16", startCH: "8+010.20", finishCH: "8+008.80", length: "1.40", status: "In Progress", installType: "Permanent" }];
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={inProgress}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  // the in-progress ring is loaded for editing, so the form now holds that row's id
  expect(view.value("ringNo")).toBe("P643");

  view.rerender(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={[]}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );
  type(view.container, "ringNo", "P1");
  type(view.container, "startCH", "9+499.50");

  await act(async () => {
    const form = view.container.querySelector("form");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(apiCall).toHaveBeenCalled();
  const [action, payload] = apiCall.mock.calls[apiCall.mock.calls.length - 1];
  expect(action).toBe("addSegment");
  expect(payload.machine).toBe("TBM2");
  expect(payload.id).not.toBe("seg_tbm1_row");
  view.unmount();
});

test("changing the working shift does not wipe the open segment record", () => {
  // the Working Shift selector lives in this same form, so making it a dependency of the
  // machine-switch reset silently cleared the excavation times, soil type, head-level survey
  // readings and the ring length — which then corrupts the derived chainage and soil volume
  const element = shift => (
    <SegmentRecordView projectInfo={{ ...projectInfo, shift }} handleProjectInfoChange={() => {}}
      segmentRecords={tbm1Segments} setSegmentRecords={() => {}} setCurrentModule={() => {}}
      setActiveTab={() => {}} machine="TBM1" />
  );
  const view = render(element("Day"));
  type(view.container, "excavStartTime", "08:15");
  type(view.container, "soilType", "ดินเหนียวปนทราย");
  type(view.container, "length", "0.90");
  type(view.container, "headV", "29");
  type(view.container, "vrt", "0.2");

  view.rerender(element("Night"));

  expect(view.value("excavStartTime")).toBe("08:15");
  expect(view.value("soilType")).toBe("ดินเหนียวปนทราย");
  expect(view.value("length")).toBe("0.90");
  expect(view.value("headV")).toBe("29");
  expect(view.value("vrt")).toBe("0.2");
  view.unmount();
});

test("a segment machine switch clears the survey and excavation fields too", () => {
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={tbm1Segments}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  type(view.container, "excavStartTime", "08:15");
  type(view.container, "excavEndTime", "09:40");
  type(view.container, "soilType", "ดินเหนียว");
  type(view.container, "headV", "29");
  type(view.container, "artV", "33");
  type(view.container, "tailV", "34");
  type(view.container, "vrt", "0.2");

  view.rerender(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={[]}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );

  ["excavStartTime", "excavEndTime", "soilType", "headV", "artV", "tailV", "vrt"].forEach(name => {
    expect(view.value(name)).toBe("");
  });
  view.unmount();
});

test("a segment save resolving after a machine switch does not land in the other machine", async () => {
  // the reset closes the synchronous door; a save takes seconds on a tunnel link, so its resolve is
  // the async one — writing the row back would put one machine's ring and surveyed CH into the
  // other machine's state, where the next snapshot merge would carry it to the sheet
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  const setSegmentRecords = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const element = machine => (
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={rows}
      setSegmentRecords={setSegmentRecords} setCurrentModule={() => {}} setActiveTab={() => {}} machine={machine} />
  );
  const view = render(element("TBM1"));
  type(view.container, "ringNo", "P644");
  type(view.container, "startCH", "8+008.80");
  await act(async () => {
    view.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  view.rerender(element("TBM2"));
  await act(async () => { release(); });

  expect(rows).toEqual([]);
  // and the FORM must be untouched too: it now holds the other machine's next ring, so taking this
  // save's row id would turn the next Save into an updateSegment against a row TBM2's sheet has
  // never seen — GAS finds no match, the local map matches nothing, and the ring is lost silently
  expect(view.value("ringNo")).toBe("");
  expect(view.container.querySelector('[name="ringNo"]').closest("form")).toBeTruthy();
  type(view.container, "ringNo", "P101");
  type(view.container, "startCH", "9+499.50");
  apiCall.mockImplementation(async () => ({ status: "success" }));
  await act(async () => {
    view.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  const [action, payload] = apiCall.mock.calls[apiCall.mock.calls.length - 1];
  expect(action).toBe("addSegment");
  expect(payload.machine).toBe("TBM2");
  view.unmount();
});

test("a segment save resolving after the form unmounts does not land in the other machine", async () => {
  // the machine switcher is in the TopBar, so it is reachable from every tab — the crew can submit,
  // tap another nav item (this view unmounts), then switch machine. A ref inside the view freezes at
  // unmount and would still answer "TBM1"; App's answer is the live one.
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  let currentMachine = "TBM1";
  const view = render(
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={rows}
      setSegmentRecords={updater => { rows = typeof updater === "function" ? updater(rows) : updater; }}
      setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1"
      isCurrentMachine={m => m === currentMachine} />
  );
  type(view.container, "ringNo", "P644");
  type(view.container, "startCH", "8+008.80");
  await act(async () => {
    view.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  view.unmount();          // the crew navigated away
  currentMachine = "TBM2"; // then switched machine
  await act(async () => { release(); });

  expect(rows).toEqual([]);
});

test("a grout save resolving after a machine switch does not land in the other machine", async () => {
  let release;
  apiCall.mockImplementation(() => new Promise(resolve => { release = () => resolve({ status: "success" }); }));
  let rows = [];
  const setGroutRecords = updater => { rows = typeof updater === "function" ? updater(rows) : updater; };
  const element = machine => (
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={rows}
      setGroutRecords={setGroutRecords} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={[]} setCurrentModule={() => {}} setActiveTab={() => {}} machine={machine} />
  );
  const view = render(element("TBM1"));
  expect(view.container.querySelector("form")).toBeTruthy();
  type(view.container, "ringNo", "P643");
  type(view.container, "partA", "12.5");
  await act(async () => {
    view.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  view.rerender(element("TBM2"));
  // the crew is already filling in this machine's ring while the previous save is still travelling
  type(view.container, "ringNo", "P100");
  type(view.container, "partA", "11.0");
  type(view.container, "partB", "5.5");
  type(view.container, "pressure", "3.2");
  await act(async () => { release(); });

  expect(rows).toEqual([]);
  // the post-save reset must be inside the guard too, or it clears measured volumes belonging to a
  // record that was never saved
  expect(view.value("ringNo")).toBe("P100");
  expect(view.value("partA")).toBe("11.0");
  expect(view.value("partB")).toBe("5.5");
  expect(view.value("pressure")).toBe("3.2");
  view.unmount();
});

test("a segment form keeps what the crew typed across an unrelated re-render", () => {
  // asserting the PREFILLED ring here proved nothing: if the reset fired on every render, the
  // prefill (guarded on an empty ringNo) would immediately recompute the same P644. A hand-typed
  // ring is the value that can tell the two apart, because nothing restores it.
  const element = machineProps => (
    <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} segmentRecords={tbm1Segments}
      setSegmentRecords={() => {}} setCurrentModule={() => {}} setActiveTab={() => {}} {...machineProps} />
  );
  const view = render(element({ machine: "TBM1" }));
  expect(view.value("ringNo")).toBe("P644");
  type(view.container, "ringNo", "P700");
  type(view.container, "soilType", "ดินเหนียวปนทราย");

  view.rerender(element({ machine: "TBM1" }));

  expect(view.value("ringNo")).toBe("P700");
  expect(view.value("soilType")).toBe("ดินเหนียวปนทราย");
  view.unmount();
});

test("a grout form drops the previous machine's ring on a machine switch", () => {
  const grouts = [{ id: "g1", ringNo: "P640", partA: "1", partB: "1", pressure: "2.5" }];
  const view = render(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={grouts}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={tbm1Segments} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM1" />
  );
  const before = view.value("ringNo");
  expect(before).toBeTruthy();

  view.rerender(
    <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={() => {}} groutRecords={[]}
      setGroutRecords={() => {}} secondaryGroutRecords={[]} setSecondaryGroutRecords={() => {}}
      segmentRecords={[]} setCurrentModule={() => {}} setActiveTab={() => {}} machine="TBM2" />
  );

  expect(view.value("ringNo")).toBe("");
  view.unmount();
});
