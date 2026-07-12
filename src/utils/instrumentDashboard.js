// Task R4a — compliance-dashboard tally utils. Pure port of tunnel-monitoring's
// src/app/page.tsx:94-120 (DashboardPage summary-calculation loop) + the 5 SummaryCard formulas
// at page.tsx:156-191. See .superpowers/sdd/R4-source-map.md §1/§1.1/§1.2 and
// .superpowers/sdd/task-R4a-brief.md for the full spec. No React here — plain data in, plain data out.
//
// ⚠ DECISION 1 (locked — source fidelity, R4-source-map.md §1.2): N/A counts as MEASURED for the
// "Meas. Progress" tally. `markMeasurementNA` (instrumentSchedule.js) sets isMeasured=true exactly
// like `markMeasurementDone` — page.tsx's summary loop tallies the isMeasured boolean directly
// (111-115) and never special-cases notes==="N/A". We do the same here: tallyMeasurementProgress
// reads `s.isMeasured` directly. We deliberately do NOT delegate to `summarizeSchedules()`
// (instrumentSchedule.js) — that function checks `notes==="N/A"` FIRST and buckets it as "na",
// which is excluded from every count (due/overdue/done/pending all skip it). That's the correct
// behavior for the schedule-timeline "what's left to do" UI (R1 decision), but reusing it here would
// make this dashboard's numbers silently diverge from source's DashboardPage tallies the moment any
// schedule is marked N/A.
//
// ⚠ DECISION 2 (locked — page.tsx:117-119): "Upcoming Nodes" boundary is the half-open interval
// [-50, 0) i.e. `dist >= -50 && dist < 0`. (DataGrid.tsx's sibling `isApproaching` helper uses a
// different boundary, (-50, 0], for a different per-location-card indicator — not reused here.)
import { getOperationalChainage } from "./instrumentSchedule";
import { stationLabel } from "./chainageAdapter";

const UPCOMING_WINDOW_M = 50;

// Metric 1 — TBM Chainage. Port of page.tsx:158-159. ringNo has no home in `machineProgress`
// (R4-source-map.md §3.3.6) — it's an optional prop; render "—" (em dash, matches source's
// `tbmPosition?.ringNo ?? "—"`) rather than inventing a ring number.
export function tallyTbmChainage(tbmChainage, ringNo) {
  return {
    value: `STA ${stationLabel(tbmChainage)}`,
    sub: `Current Ring: #${ringNo ?? "—"}`,
  };
}

// Metric 2 — Upcoming Nodes. Port of page.tsx:104,117-119: for each location,
// dist = operationalChainage - tbmChainage; counted when dist is in [-50, 0).
// tbmChainage==null (machineProgress not loaded yet) → 0, not a coerced-to-zero false positive
// (same guarding philosophy already used in ScheduleTimeline.jsx's hasTbmPosition check).
export function tallyUpcomingNodes(locations, tbmChainage) {
  if (tbmChainage == null) return 0;
  let upcoming = 0;
  (locations || []).forEach((loc) => {
    const operationalChainage = getOperationalChainage(loc);
    if (operationalChainage == null) return;
    const dist = operationalChainage - tbmChainage;
    if (dist >= -UPCOMING_WINDOW_M && dist < 0) upcoming += 1;
  });
  return upcoming;
}

// Metric 3 — Action Required. Port of page.tsx:111-116 (DISTANCE-only; else-branch of isMeasured,
// i.e. only pending rows count): tbmChainage has passed the schedule's own trigger chainage
// (s.tbmChainage) but it is still not measured. Both null-guards are required: s.tbmChainage==null
// mirrors source's own `ms.tbmChainage != null` guard; tbmChainage==null is an addition needed
// because — unlike source, where `tbmChainage = tbmPosition?.chainage ?? 0` can never be null —
// this port's tbmChainage prop can legitimately be null before machineProgress has loaded.
export function tallyActionRequired(schedules, tbmChainage) {
  let pending = 0;
  (schedules || []).forEach((s) => {
    if (s.scheduleType !== "DISTANCE") return;
    if (s.isMeasured) return;
    if (tbmChainage == null || s.tbmChainage == null) return;
    if (tbmChainage <= s.tbmChainage) pending += 1;
  });
  return pending;
}

// Metric 4 — Meas. Progress. Port of page.tsx:112-115 (DISTANCE-only): total = every DISTANCE
// schedule, measured = isMeasured true. See DECISION 1 above re: N/A counting as measured.
export function tallyMeasurementProgress(schedules) {
  let total = 0;
  let measured = 0;
  (schedules || []).forEach((s) => {
    if (s.scheduleType !== "DISTANCE") return;
    total += 1;
    if (s.isMeasured) measured += 1;
  });
  const percent = total > 0 ? Math.round((measured / total) * 100) : 0;
  return { measured, total, percent };
}

// Metric 5 — Inst. Installation. Port of page.tsx:108-109: ALL instruments project-wide, not
// gated by schedule/location at all (unlike metrics 2-4 which are DISTANCE-schedule-only).
export function tallyInstallation(instruments) {
  const list = instruments || [];
  const total = list.length;
  const installed = list.filter((i) => i.installStatus === "INSTALLED").length;
  const percent = total > 0 ? Math.round((installed / total) * 100) : 0;
  return { installed, total, percent };
}

// Convenience aggregate — the shape ComplianceCards.jsx consumes directly (it calls this itself
// from raw {locations, instruments, schedules, tbmChainage, ringNo}, per the brief's
// self-contained-component decision).
export function computeComplianceTallies({ locations, instruments, schedules, tbmChainage, ringNo } = {}) {
  return {
    tbmChainage: tallyTbmChainage(tbmChainage, ringNo),
    upcomingNodes: tallyUpcomingNodes(locations, tbmChainage),
    actionRequired: tallyActionRequired(schedules, tbmChainage),
    measurementProgress: tallyMeasurementProgress(schedules),
    installation: tallyInstallation(instruments),
  };
}
