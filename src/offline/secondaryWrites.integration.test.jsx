import "fake-indexeddb/auto";
if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import PrepGanttView from "../components/views/PrepGanttView";
import RouteScheduleView from "../components/views/RouteScheduleView";
import SegmentAnalysisView from "../components/views/SegmentAnalysisView";
import App from "../App";
import { OfflineProvider } from "./OfflineProvider";
import { emptyServerData } from "./normalizeServerData";
import { apiCall } from "../utils/api";
import { normalize as normalizeDailyReports } from "../utils/dailyReports";

// Task 9 moves the remaining business writes onto the same queue Task 8 built for the core five.
// These assert the ENVELOPE — one mutation per affected record, with the domain key the record's own
// fields derive — rather than a notice or a spinner, for the reason Step 4 gives: a test that watches
// the screen cannot tell a queued write from one that was never sent.
jest.mock("../utils/api", () => ({ apiCall: jest.fn(async () => ({ status: "success" })) }));

const TASKS_KEY = "tbmPrepTasks_TBM1";

let onMutate;
beforeEach(() => {
  window.localStorage.clear();
  apiCall.mockImplementation(async () => ({ status: "success" }));
  onMutate = jest.fn(async () => ({}));
});

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
    rerender: element => act(() => { root.render(element); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

const click = async (element) => {
  if (!element) throw new Error("no such control");
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const button = (container, pattern) => [...container.querySelectorAll("button")].find(b => pattern.test(b.textContent));
const type = (container, selector, value) => act(() => {
  const field = container.querySelector(selector);
  const proto = field.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
});

const task = (id, name, extra = {}) => ({
  id, name, start: "2026-08-01", end: "2026-08-05", progress: 0, deps: [], milestone: false, parentId: null, ...extra,
});
// The view took its rows from localStorage; Step 5 hands them down instead, so the fixture is the
// prop. `machineTasks` mirrors what App passes: the slice for the machine on screen.
let seeded = [];
const seedTasks = rows => { seeded = rows; };
const machineTasks = (machine = "TBM1") => seeded.filter(t => (t.machine || "TBM1") === machine);

test("editing a prep task queues one update for that task", async () => {
  seedTasks([task("prep_1", "ตั้งเครน"), task("prep_2", "ติดตั้งราง")]);
  const view = render(<PrepGanttView machine="TBM1" tasks={machineTasks("TBM1")} onMutate={onMutate} syncMeta={{ "prepTask:TBM1:prep_1": { version: 4 } }} />);

  await click([...view.container.querySelectorAll("div")].find(node => node.textContent === "ตั้งเครน"));
  type(view.container, 'input[placeholder^="เช่น"]', "ตั้งเครนหลัก"); // the task-name field
  await click(button(view.container, /^บันทึก$/));

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "prepTask",
    operation: "update",
    machine: "TBM1",
    recordId: "prep_1",
    domainKey: "prepTask:TBM1:prep_1",
    baseVersion: 4,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("adding a prep task queues a create that claims no version", async () => {
  // a create must not carry the key's known version — `createBaseVersion`'s rule, and the reason a
  // second crew recording the same thing gets a conflict rather than a silent merge
  seedTasks([]);
  const view = render(<PrepGanttView machine="TBM1" tasks={machineTasks("TBM1")} onMutate={onMutate} syncMeta={{}} />);

  await click(button(view.container, /เพิ่มงาน/));
  type(view.container, 'input[placeholder^="เช่น"]', "เทฐานราก");
  type(view.container, 'input[type="date"]', "2026-08-10");
  await click(button(view.container, /^เพิ่ม$/));

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "prepTask", operation: "create", machine: "TBM1", baseVersion: 0,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("deleting a prep task queues one delete for that task", async () => {
  seedTasks([task("prep_1", "ตั้งเครน")]);
  const view = render(<PrepGanttView machine="TBM1" tasks={machineTasks("TBM1")} onMutate={onMutate} syncMeta={{ "prepTask:TBM1:prep_1": { version: 2 } }} />);

  await click([...view.container.querySelectorAll("div")].find(node => node.textContent === "ตั้งเครน"));
  await click(button(view.container, /^ลบ$/));

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "prepTask", operation: "delete", recordId: "prep_1", domainKey: "prepTask:TBM1:prep_1", baseVersion: 2,
  }));
  view.unmount();
});

test("Set Baseline queues one mutation per task, not one batch", async () => {
  // Step 1 calls this out by name: N independent request ids, so a refusal on one task does not
  // strand the rest — the queue orders per record, and a batch would make them one record.
  seedTasks([task("prep_1", "ตั้งเครน"), task("prep_2", "ติดตั้งราง"), task("prep_3", "เทฐานราก")]);
  const confirmed = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    const view = render(<PrepGanttView machine="TBM1" tasks={machineTasks("TBM1")} onMutate={onMutate} syncMeta={{}} />);

    await click(button(view.container, /Set Baseline/));

    expect(onMutate).toHaveBeenCalledTimes(3);
    const keys = onMutate.mock.calls.map(([envelope]) => envelope.domainKey);
    expect(keys).toEqual(["prepTask:TBM1:prep_1", "prepTask:TBM1:prep_2", "prepTask:TBM1:prep_3"]);
    expect(onMutate.mock.calls.every(([envelope]) => envelope.entityType === "prepTask" && envelope.operation === "update")).toBe(true);
    expect(apiCall).not.toHaveBeenCalled();
    view.unmount();
  } finally {
    confirmed.mockRestore();
  }
});

test("a prep task of the other machine is never written under this one's key", async () => {
  // `prepTask` is machine-keyed AND returned project-wide, so one list holds both machines' rows —
  // open item 3l. The key has to come from the machine the view is showing.
  seedTasks([task("prep_1", "ตั้งเครน", { machine: "TBM1" }), task("prep_9", "งานของ TBM2", { machine: "TBM2" })]);
  const view = render(<PrepGanttView machine="TBM2" tasks={machineTasks("TBM2")} onMutate={onMutate} syncMeta={{}} />);

  await click([...view.container.querySelectorAll("div")].find(node => node.textContent === "งานของ TBM2"));
  await click(button(view.container, /^ลบ$/));

  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    machine: "TBM2", recordId: "prep_9", domainKey: "prepTask:TBM2:prep_9",
  }));
  view.unmount();
});

const projectInfo = { date: "2026-08-01", shift: "Day", location: "L", tbmNo: "TBM1" };
const byTitle = (container, title) => container.querySelector(`[title="${title}"]`);

test("saving the plan settings queues planConfig alone", async () => {
  // The one-shot write sent planConfig AND distPlanConfig together, from two different views, to
  // stop GAS overwriting whichever one was not being edited. Each is its own record with its own
  // version now, and the sync path writes exactly the key the envelope names — so sending the other
  // one would be this view saving a config it was never showing.
  const view = render(<SegmentAnalysisView segmentRecords={[]} projectInfo={projectInfo} machine="TBM1"
    onMutate={onMutate} syncMeta={{ "planConfig:TBM1": { version: 6 } }} />);

  await click(byTitle(view.container, "Plan Settings"));
  await click(button(view.container, /บันทึกการตั้งค่า/));

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "planConfig", operation: "update", machine: "TBM1", domainKey: "planConfig:TBM1", baseVersion: 6,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("saving the distance plan queues distPlanConfig for the machine on screen", async () => {
  // It synced only on TBM1 — "per-machine GAS = future". The sync path keys on
  // `distPlanConfig_<machine>` and getData reads it back the same way, so TBM2's distance plan has
  // been local-only for no reason, which is exactly the "localStorage as sole durable source" this
  // task exists to end.
  const view = render(<RouteScheduleView segmentRecords={[]} projectInfo={projectInfo} machine="TBM2"
    onMutate={onMutate} syncMeta={{ "distPlanConfig:TBM2": { version: 3 } }} />);

  await click(byTitle(view.container, "Distance Plan Settings"));
  await click(button(view.container, /บันทึกการตั้งค่า/));

  expect(onMutate).toHaveBeenCalledTimes(1);
  expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "distPlanConfig", operation: "update", machine: "TBM2", domainKey: "distPlanConfig:TBM2", baseVersion: 3,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("saving the route queues routeConfig carrying its project total", async () => {
  // `routeProjectTotal` is a sibling singleton edited through the same mutation — GAS stores it in
  // its own PlanConfig row, and the snapshot merge already carries it across for a routeConfig edit.
  const view = render(<RouteScheduleView segmentRecords={[]} projectInfo={projectInfo} machine="TBM1"
    routeProjectTotal={4321} onMutate={onMutate} syncMeta={{ "routeConfig:TBM1": { version: 9 } }} />);

  await click(button(view.container, /แก้ไขเส้นทาง/));
  await click(button(view.container, /บันทึก$/)); // the icon leaves a leading space in the label

  expect(onMutate).toHaveBeenCalledTimes(1);
  const [envelope] = onMutate.mock.calls[0];
  expect(envelope).toEqual(expect.objectContaining({
    entityType: "routeConfig", operation: "update", machine: "TBM1", domainKey: "routeConfig:TBM1", baseVersion: 9,
  }));
  expect(envelope.payload.routeProjectTotal).toBe(4321);
  expect(envelope.payload.routeConfig).toBeTruthy();
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

// App owns the issue, daily-report and instrument handlers, so those envelopes can only be asserted
// where they are built. A fake repository captures them; everything else is the real App.
function renderApp(serverData = {}, { mutate }) {
  const machineData = machine => ({ ...emptyServerData(machine), ...serverData });
  const repository = {
    load: async machine => ({ data: machineData(machine), source: "indexeddb", fetchedAt: "2026-07-01T00:00:00.000Z", stale: true }),
    refresh: async machine => ({ data: { ...machineData(machine), present: {} }, source: "server", fetchedAt: "2026-08-01T00:00:00.000Z", stale: false }),
    subscribe: () => () => {},
    getSyncSummary: async () => ({ online: true, pending: 0, syncing: 0, conflicts: 0, errors: 0, blocked: 0, lastSyncedAt: null }),
    setSyncMetaValue: async () => {},
    mutate,
  };
  let container;
  let root;
  act(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(
      <OfflineProvider deps={{
        openDb: async () => ({}), stageLegacyLocalStorage: async () => {},
        createRepository: () => repository,
        createSyncRunner: () => ({ start: async () => {}, stop: () => {}, runNow: async () => {} }),
        storage: null,
      }}>
        <App />
      </OfflineProvider>
    );
  });
  return { container, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

const issue = (id, title, extra = {}) => ({
  // `severity`, not `priority`: `validateForm` refuses a form without one, so an edit of a record
  // fixtured with the wrong field silently saves nothing
  id, title, status: "open", machine: "TBM1", severity: "delay", createdAt: "2026-08-01T00:00:00.000Z", ...extra,
});

test("closing an issue queues one update for that issue", async () => {
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = renderApp({ issues: [issue("iss_1", "รอ Platform")] }, { mutate });
  // load, then refresh, then the mirror effect
  for (let pass = 0; pass < 4; pass += 1) await act(async () => {});

  // the rail renders its cards without a toggle once there is an issue — the count IS the button
  await click(byTitle(view.container, "ปิด (แก้แล้ว)"));

  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "issue", operation: "update", recordId: "iss_1", domainKey: "issue:GLOBAL:iss_1",
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

// --- daily reports -----------------------------------------------------------------------------

// Built through the app's own normaliser: the detail panel reads `weather`/`equipment`/`labor` as
// objects, and a hand-written literal without them crashes the page rather than failing an
// assertion — the fixture has to be the shape the server path actually produces.
const dailyReport = (id, extra = {}) => ({
  ...normalizeDailyReports([{ id, date: "2026-07-30", area: "IS2", machine: "TBM1", kind: "itemized", workLogText: "ติดตั้งราง", ...extra }])[0],
});

const settle = async (view) => { for (let pass = 0; pass < 4; pass += 1) await act(async () => {}); return view; };
const navigate = async (container, label) => click(button(container, label));

test("deleting a daily report queues a delete carrying the record, not { id }", async () => {
  // The domain key of a dailyReport is machine-scoped and read off the payload, so a delete sent as
  // `{ id }` keys to `dailyReport:GLOBAL:<id>` — a domain nothing else on the branch writes, which
  // means it never orders behind the create it is meant to undo.
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = await settle(renderApp({ dailyReports: [dailyReport("dr_1")] }, { mutate }));

  await navigate(view.container, /Daily Report/);
  await click(byTitle(view.container, "ลบ"));

  expect(mutate).toHaveBeenCalledTimes(1);
  const [envelope] = mutate.mock.calls[0];
  expect(envelope).toEqual(expect.objectContaining({
    entityType: "dailyReport", operation: "delete", machine: "TBM1",
    recordId: "dr_1", domainKey: "dailyReport:TBM1:dr_1",
  }));
  expect(envelope.payload.area).toBe("IS2"); // the record itself, so the key can be derived from it
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

// --- instrument schedules ----------------------------------------------------------------------

const schedule = (id, extra = {}) => ({
  id, locationId: "L1", scheduleType: "DISTANCE", instrumentGroup: "SURFACE", distanceOffset: 0,
  tbmChainage: 9000, isMeasured: false, measuredAt: null, notes: "", ...extra,
});

test("marking a measurement queues one mutation per changed row, not one batch", async () => {
  // Marking the DISTANCE row completes its offset, which cascades a target date onto both LONG_TERM
  // rows waiting on it — three records changed by one click. The queue orders per record, so these
  // must be three envelopes with three request ids: a row GAS refuses then strands only itself.
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = await settle(renderApp({
    instLocations: [{ id: "L1", name: "IS2 Shaft" }],
    instSchedules: [
      schedule("sc_dist"),
      schedule("sc_lt30", { scheduleType: "LONG_TERM", longTermLabel: "30 วัน", longTermDays: 30, triggerOffset: 0, distanceOffset: null }),
      schedule("sc_lt90", { scheduleType: "LONG_TERM", longTermLabel: "90 วัน", longTermDays: 90, triggerOffset: 0, distanceOffset: null }),
    ],
  }, { mutate }));

  await navigate(view.container, /วาระตรวจวัด/);
  await click(byTitle(view.container, "บันทึกผลตรวจวัด"));
  await click(button(view.container, /ยืนยันตรวจวัดเสร็จสิ้น/));

  expect(mutate).toHaveBeenCalledTimes(3);
  const envelopes = mutate.mock.calls.map(([envelope]) => envelope);
  expect(envelopes.map(e => e.recordId)).toEqual(["sc_dist", "sc_lt30", "sc_lt90"]);
  // each envelope carries its own row — the batch failure mode is one envelope holding the list
  expect(envelopes.map(e => e.payload.id)).toEqual(["sc_dist", "sc_lt30", "sc_lt90"]);
  envelopes.forEach(envelope => expect(Array.isArray(envelope.payload)).toBe(false));
  envelopes.forEach(envelope => expect(envelope).toEqual(expect.objectContaining({
    entityType: "instSchedule", operation: "update",
    domainKey: `instSchedule:GLOBAL:${envelope.recordId}`,
  })));
  expect(envelopes[0].payload.isMeasured).toBe(true);
  expect(envelopes[1].payload.targetDate).toBeTruthy(); // the cascade, carried in its own envelope
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

// --- Step 5: the plan config comes down as a prop, not out of localStorage --------------------

test("the analysis view edits the plan config it was given, not whatever localStorage holds", async () => {
  // `tbmPlanConfig` is one key for both machines: App wrote whichever machine was active into it,
  // so switching to TBM2 and back showed TBM2's plan under TBM1's rings. The snapshot already
  // stores the config per machine — reading the prop is what makes that reach the screen.
  window.localStorage.setItem("tbmPlanConfig", JSON.stringify({ basePlanAcc: 999, ranges: [{ start: "2026-01-01", end: "2026-12-31", dailyPlan: 99 }] }));
  const planConfig = { basePlanAcc: 120, baseActualAcc: 118, ranges: [{ start: "2026-08-01", end: "2026-08-31", dailyPlan: 6 }] };
  const view = render(<SegmentAnalysisView segmentRecords={[]} projectInfo={projectInfo} machine="TBM1"
    planConfig={planConfig} onMutate={onMutate} syncMeta={{ "planConfig:TBM1": { version: 6 } }} />);

  await click(byTitle(view.container, "Plan Settings"));
  await click(button(view.container, /บันทึกการตั้งค่า/));

  const [envelope] = onMutate.mock.calls[0];
  expect(envelope.payload.planConfig).toMatchObject({ basePlanAcc: 120, baseActualAcc: 118 });
  expect(envelope.payload.planConfig.ranges).toEqual([{ start: "2026-08-01", end: "2026-08-31", dailyPlan: 6 }]);
  view.unmount();
});

test("a plan config arriving after mount replaces the one on screen", async () => {
  // The first render is the cached snapshot; the server answer lands a moment later. A `useState`
  // initialiser only ever runs once, so without this the crew keeps editing the stale plan.
  const view = render(<SegmentAnalysisView segmentRecords={[]} projectInfo={projectInfo} machine="TBM1"
    planConfig={{ basePlanAcc: 1, ranges: [] }} onMutate={onMutate} syncMeta={{}} />);
  view.rerender(<SegmentAnalysisView segmentRecords={[]} projectInfo={projectInfo} machine="TBM1"
    planConfig={{ basePlanAcc: 240, ranges: [] }} onMutate={onMutate} syncMeta={{}} />);

  await click(byTitle(view.container, "Plan Settings"));
  await click(button(view.container, /บันทึกการตั้งค่า/));

  expect(onMutate.mock.calls[0][0].payload.planConfig).toMatchObject({ basePlanAcc: 240 });
  view.unmount();
});

test("the route view edits the route config it was given, not whatever localStorage holds", async () => {
  window.localStorage.setItem("tbmRouteConfig", JSON.stringify({ legs: [{ order: "9.9", level: 2, name: "จาก localStorage", plannedDistance: 111 }] }));
  const routeConfigs = { TBM1: { legs: [{ order: "1.1", level: 2, name: "IS2 → IS1", plannedDistance: 1234, remark: "" }] }, TBM2: { legs: [] } };
  const view = render(<RouteScheduleView segmentRecords={[]} projectInfo={projectInfo} machine="TBM1"
    routeConfigs={routeConfigs} onMutate={onMutate} syncMeta={{}} />);

  await click(button(view.container, /แก้ไขเส้นทาง/));
  await click(button(view.container, /บันทึก$/));

  const [envelope] = onMutate.mock.calls[0];
  expect(envelope.payload.routeConfig.legs[0]).toMatchObject({ name: "IS2 → IS1", plannedDistance: 1234 });
});

test("the distance plan comes down as a prop, per machine", async () => {
  window.localStorage.setItem("tbmDistancePlanConfig__TBM2", JSON.stringify({ ranges: [{ start: "2020-01", end: "2020-02", monthlyPlan: 1 }] }));
  const view = render(<RouteScheduleView segmentRecords={[]} projectInfo={projectInfo} machine="TBM2"
    distPlanConfig={{ ranges: [{ start: "2026-08", end: "2026-12", monthlyPlan: 180 }] }}
    onMutate={onMutate} syncMeta={{}} />);

  await click(byTitle(view.container, "Distance Plan Settings"));
  await click(button(view.container, /บันทึกการตั้งค่า/));

  const [envelope] = onMutate.mock.calls[0];
  expect(envelope.payload.distPlanConfig.ranges).toEqual([{ start: "2026-08", end: "2026-12", monthlyPlan: 180 }]);
});

test("a route config arriving after mount replaces the one on screen", async () => {
  const view = render(<RouteScheduleView segmentRecords={[]} projectInfo={projectInfo} machine="TBM1"
    routeConfigs={{ TBM1: { legs: [{ order: "1.1", level: 2, name: "เก่า", plannedDistance: 1 }] } }} onMutate={onMutate} syncMeta={{}} />);
  view.rerender(<RouteScheduleView segmentRecords={[]} projectInfo={projectInfo} machine="TBM1"
    routeConfigs={{ TBM1: { legs: [{ order: "1.1", level: 2, name: "ใหม่จากเซิร์ฟเวอร์", plannedDistance: 2 }] } }} onMutate={onMutate} syncMeta={{}} />);

  await click(button(view.container, /แก้ไขเส้นทาง/));
  await click(button(view.container, /บันทึก$/));

  expect(onMutate.mock.calls[0][0].payload.routeConfig.legs[0].name).toBe("ใหม่จากเซิร์ฟเวอร์");
});

test("no business collection is written to localStorage any more", async () => {
  // Step 5's whole point: the queue and the snapshot are the durable store. A second copy in
  // localStorage is not a safety net — it is a second source of truth that no longer receives
  // deletes, versions or conflict outcomes, and the reconciliation pass exists to retire it.
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = await settle(renderApp({
    issues: [issue("iss_1", "รอ Platform")],
    dailyReports: [dailyReport("dr_1")],
    instInstruments: [{ id: "ins_1", locationId: "L1", type: "INC", name: "P604" }],
  }, { mutate }));

  await click(byTitle(view.container, "ปิด (แก้แล้ว)"));

  expect(window.localStorage.getItem("tbmIssues")).toBeNull();
  expect(window.localStorage.getItem("tbmDailyReports")).toBeNull();
  expect(window.localStorage.getItem("instInstruments")).toBeNull();
  expect(mutate).toHaveBeenCalledTimes(1); // the write still happened — through the queue
  view.unmount();
});

test("adding an issue queues one create that claims no version", async () => {
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = await settle(renderApp({}, { mutate }));

  await click(button(view.container, /เพิ่ม/));
  type(view.container, 'input[placeholder^="เช่น ติดตั้ง"]', "รอ Platform ทางเดิน");
  await click(button(view.container, /^เพิ่ม$/));

  expect(mutate).toHaveBeenCalledTimes(1);
  const [envelope] = mutate.mock.calls[0];
  expect(envelope).toEqual(expect.objectContaining({ entityType: "issue", operation: "create", baseVersion: 0 }));
  expect(envelope.domainKey).toBe(`issue:GLOBAL:${envelope.recordId}`);
  expect(envelope.payload.title).toBe("รอ Platform ทางเดิน");
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("editing an issue queues one update against the version it was loaded with", async () => {
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = await settle(renderApp({
    issues: [issue("iss_1", "รอ Platform")],
    syncMeta: { "issue:GLOBAL:iss_1": { version: 5 } },
  }, { mutate }));

  await click(byTitle(view.container, "แก้ไข"));
  type(view.container, 'input[placeholder^="เช่น ติดตั้ง"]', "รอ Platform ทางเดิน (แก้ไข)");
  await click(button(view.container, /^บันทึก$/));

  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "issue", operation: "update", recordId: "iss_1", domainKey: "issue:GLOBAL:iss_1", baseVersion: 5,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("deleting an issue queues one delete for that issue", async () => {
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = await settle(renderApp({
    issues: [issue("iss_1", "รอ Platform"), issue("iss_2", "รอไฟฟ้า")],
    syncMeta: { "issue:GLOBAL:iss_2": { version: 2 } },
  }, { mutate }));

  const cards = [...view.container.querySelectorAll('[title="ลบ"]')];
  await click(cards[1]);

  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "issue", operation: "delete", recordId: "iss_2", domainKey: "issue:GLOBAL:iss_2", baseVersion: 2,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("saving a daily report queues one create keyed to the machine on screen", async () => {
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = await settle(renderApp({}, { mutate }));

  await navigate(view.container, /Record Daily/);
  type(view.container, 'input[placeholder^="เช่น AOB"]', "IS2 ปากบ่อ");
  await click(button(view.container, /บันทึก$/));

  expect(mutate).toHaveBeenCalledTimes(1);
  const [envelope] = mutate.mock.calls[0];
  expect(envelope).toEqual(expect.objectContaining({ entityType: "dailyReport", operation: "create", machine: "TBM1", baseVersion: 0 }));
  expect(envelope.domainKey).toBe(`dailyReport:TBM1:${envelope.recordId}`);
  expect(envelope.payload.area).toBe("IS2 ปากบ่อ");
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});

test("editing a daily report queues an update against the version it was loaded with", async () => {
  const mutate = jest.fn(async () => ({ optimisticRecord: {} }));
  const view = await settle(renderApp({
    dailyReports: [dailyReport("dr_1")],
    syncMeta: { "dailyReport:TBM1:dr_1": { version: 7 } },
  }, { mutate }));

  await navigate(view.container, /Daily Report/);
  await click(byTitle(view.container, "แก้ไข")); // the card's pencil opens the detail panel
  await click(button(view.container, /แก้ไข/));   // the detail's own edit is what reaches the form
  await settle(view);
  type(view.container, 'input[placeholder^="เช่น AOB"]', "IS2 ปากบ่อ (แก้ไข)");
  await click(button(view.container, /บันทึก$/));

  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "dailyReport", operation: "update", machine: "TBM1",
    recordId: "dr_1", domainKey: "dailyReport:TBM1:dr_1", baseVersion: 7,
  }));
  expect(apiCall).not.toHaveBeenCalled();
  view.unmount();
});
