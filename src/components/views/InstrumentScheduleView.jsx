// Task R6 — upgrade of the v1 flat cross-location schedule table (kept per user request: its
// strength is scanning every schedule across every location sorted by status, which the R4
// per-location dashboard cards don't offer). Fixes 3 v1 bugs, reusing already-built pieces only
// (no shared-util logic reimplemented here):
//   1. KPI over-counted LONG_TERM as "due" for its whole waiting window (same bug class fixed in
//      R3d's Action Req chip, task-R3d-report.md "Fix (post-review)") — now uses scheduleStatus's
//      4-arg form (effective LONG_TERM target) and buckets LONG_TERM "due" (waiting) as "รอ", only
//      "overdue" as actionable.
//   2. The raw tick button called onMark(...) directly (no modal/date/NA choice) and — because it
//      gated on `st !== "done"` rather than `isMeasured` — still showed for na (skipped) rows,
//      letting a click silently rewrite measuredAt on a row that stays displayed as "na" forever
//      (notes==="N/A" is checked before isMeasured in scheduleStatus). Replaced with the same
//      SchedReportModal (R3a) ScheduleTimeline/LongTermMonitoring already use; gating switched to
//      `!isMeasured` (done AND na both excluded — na rows have isMeasured=true too, so this one
//      boolean check is a strict superset of the old `st !== "done"` check, no separate na guard
//      needed).
//   3. Added a "วันที่วัด" column via formatMeasuredAtLabel (instrumentSchedule.js, R3a).
import { useMemo, useState } from "react";
import { Check, Clock, AlertTriangle, Hourglass, CheckCircle2 } from "lucide-react";
import StatCard from "../common/StatCard";
import SchedReportModal from "../instrument/SchedReportModal";
import { scheduleStatus, formatMeasuredAtLabel } from "../../utils/instrumentSchedule";
import { currentChainage, stationLabel } from "../../utils/chainageAdapter";

const STATUS_CLS = { due:"text-code-b", overdue:"text-code-d", done:"text-code-a", pending:"text-ink-3", na:"text-ink-3" };
const STATUS_ORDER = { overdue:0, due:1, pending:2, done:3, na:4 };
const today = () => new Date().toISOString();

// Group by locationId so the 4-arg scheduleStatus/getEffectiveLongTermTargetDate call below only
// ever matches DISTANCE siblings from the SAME location when resolving a LONG_TERM row's effective
// target date. This view (unlike ScheduleTimeline/LongTermMonitoring, which only ever receive an
// already location-filtered `schedules` prop) is the one place in the app that holds the full
// project-wide array — passing that whole array as `allSchedules` would risk two different
// locations' same-offset DISTANCE rows colliding (LongTermMonitoring.jsx's own top-of-file note
// flags this exact hazard; R5's ledger separately flagged getEffectiveLongTermTargetDate as "not
// internally locationId-scoped, safe for all callers [so far]" — this is the first caller where it
// isn't automatically safe, since it's the first to receive cross-location data).
function groupByLocation(schedules) {
  const map = new Map();
  (schedules || []).forEach((s) => {
    const key = String(s.locationId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  });
  return map;
}

export default function InstrumentScheduleView({ schedules = [], locations = [], machineProgress, onMark, readOnly = false }) {
  const [locFilter, setLocFilter] = useState("all");
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const cur = currentChainage(machineProgress, "TBM1"); // อ้าง TBM1 เป็นหลัก (project-wide)
  const now = today();
  const locName = useMemo(() => Object.fromEntries(locations.map((l) => [String(l.id), l.name])), [locations]);
  const byLocation = useMemo(() => groupByLocation(schedules), [schedules]);
  const siblingsFor = (s) => byLocation.get(String(s.locationId)) || [s];

  // KPI — mutually-exclusive 4-way partition of every schedule (project-wide, independent of the
  // location filter below — matches v1's existing scope):
  //   เสร็จ    = s.isMeasured (N/A counts as measured — dashboard convention, tallyMeasurementProgress
  //              in instrumentDashboard.js; markMeasurementNA sets isMeasured=true same as
  //              markMeasurementDone). Checked first so na rows never fall through to the type/status
  //              branches below.
  //   ถึงกำหนด = DISTANCE, status "due" (TBM passed the trigger chainage, still unmeasured).
  //   เลยกำหนด = LONG_TERM, status "overdue" (effective target date has already passed). DISTANCE has
  //              no "overdue" status in this data model (scheduleStatus's DISTANCE branch only ever
  //              returns "due"/"pending") — so all calendar-lateness lives on the LONG_TERM side.
  //   รอ       = everything else unmeasured: DISTANCE "pending" (TBM not yet at the trigger) +
  //              LONG_TERM "due" (still inside its waiting window — the exact R3d-class bug: v1's
  //              summarizeSchedules counted this as "due"/ถึงกำหนด for the whole window) + LONG_TERM
  //              "pending" (no effective target resolvable yet).
  // Together ถึงกำหนด+เลยกำหนด = the full "actionable now" set (DISTANCE due + LONG_TERM overdue) the
  // brief describes — split across two cards instead of merged into one so the 4 cards stay a clean
  // partition (sum === total schedules, no card double-counting another).
  const kpi = useMemo(() => {
    let due = 0, overdue = 0, pending = 0, done = 0;
    (schedules || []).forEach((s) => {
      if (s.isMeasured) { done += 1; return; }
      const st = scheduleStatus(s, cur, now, siblingsFor(s));
      if (s.scheduleType === "LONG_TERM") {
        if (st === "overdue") overdue += 1; else pending += 1;
      } else if (st === "due") {
        due += 1;
      } else {
        pending += 1;
      }
    });
    return { due, overdue, pending, done };
  }, [schedules, cur, now, byLocation]);

  const rows = useMemo(() => {
    const list = locFilter === "all" ? schedules : schedules.filter((s) => String(s.locationId) === locFilter);
    return list
      .map((s) => ({ s, st: scheduleStatus(s, cur, now, siblingsFor(s)) }))
      .sort((a, b) => STATUS_ORDER[a.st] - STATUS_ORDER[b.st]);
  }, [schedules, locFilter, cur, now, byLocation]);

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="ถึงกำหนด" value={kpi.due} subtext="Due" color="text-code-b" valueColor="text-code-b" icon={Clock} />
        <StatCard label="เลยกำหนด" value={kpi.overdue} subtext="Overdue" color="text-code-d" valueColor="text-code-d" icon={AlertTriangle} />
        <StatCard label="รอ" value={kpi.pending} subtext="Pending" color="text-ink-2" valueColor="text-ink-2" icon={Hourglass} />
        <StatCard label="เสร็จ" value={kpi.done} subtext="Done" color="text-code-a" valueColor="text-code-a" icon={CheckCircle2} />
      </div>
      <div className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-surface-alt flex items-center gap-3">
          <h3 className="font-semibold text-ink">วาระตรวจวัด</h3>
          <select className="ml-auto border border-line rounded-input px-2 py-1 text-sm" value={locFilter} onChange={(e) => setLocFilter(e.target.value)}>
            <option value="all">ทุกจุด</option>
            {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white uppercase bg-navy-dark">
              <tr>
                <th className="px-4 py-2">จุด</th>
                <th className="px-4 py-2">ชนิด</th>
                <th className="px-4 py-2">กำหนด</th>
                <th className="px-4 py-2">วันที่วัด</th>
                <th className="px-4 py-2">สถานะ</th>
                {!readOnly && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ s, st }) => (
                <tr key={s.id} className="hover:bg-cyan-tint">
                  <td className="px-4 py-2.5 text-ink">{locName[String(s.locationId)] || s.locationId}</td>
                  <td className="px-4 py-2.5 text-ink-2">{s.scheduleType === "LONG_TERM" ? s.longTermLabel : `${s.instrumentGroup} @${s.distanceOffset}m`}</td>
                  <td className="px-4 py-2.5 text-ink-2">{s.scheduleType === "DISTANCE" ? stationLabel(s.tbmChainage) : (s.targetDate || "-")}</td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {formatMeasuredAtLabel(s.measuredAt, s.isMeasured) || "—"}
                    {s.isMeasured && s.measuredBy ? <span className="text-ink-3"> · {s.measuredBy}</span> : null}
                  </td>
                  <td className={`px-4 py-2.5 font-semibold ${STATUS_CLS[st]}`}>{st}</td>
                  {!readOnly && (
                    <td className="px-4 py-2.5">
                      {!s.isMeasured && onMark && (
                        <button
                          type="button"
                          onClick={() => setSelectedSchedule(s)}
                          title="บันทึกผลตรวจวัด"
                          className="p-1.5 rounded hover:bg-code-a/10 text-code-a"
                        >
                          <Check size={16} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSchedule && (
        <SchedReportModal
          sched={selectedSchedule}
          locationName={locName[String(selectedSchedule.locationId)]}
          onMark={onMark}
          onClose={() => setSelectedSchedule(null)}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
