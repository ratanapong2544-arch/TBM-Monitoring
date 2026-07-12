// Task R3a — Section A: Measurement Schedule timeline (THE CORE of the instrument module).
// Full-fidelity port from tunnel-monitoring's LocationDetailClient.tsx:205-316 (navy reskin; see
// .superpowers/sdd/R3-source-map.md §8 for the color-meaning map). Node-status derivation
// (isAllSkipped/isAllMeasured/isComplete/isPending/isApproachingNode) is re-derived inline per
// source 226-233 — the grouping/pass/approach/TBM-position logic itself comes from
// utils/instrumentSchedule.js (R1, already tested) and is intentionally NOT reimplemented here.
//
// Known source-inherited quirk (not introduced by this port): if a group is "mixed resolved" (e.g.
// SURFACE measured-done + DEEP measured-NA in the same offset group), isAllSkipped and isAllMeasured
// are both false (neither condition covers a mixed notes state) yet isComplete is true, so isPending
// is also false — the node ring renders as a plain "future" ring even though every sub-schedule in
// the group is actually resolved. This exact behavior exists in the source file too (lines 226-231);
// faithfully preserved here per the task's full-fidelity requirement rather than silently "fixed".
import { useMemo, useState } from "react";
import { Clock, Check, Ban } from "lucide-react";
import SchedReportModal from "./SchedReportModal";
import {
  groupDistanceSchedules,
  approachingIndex,
  isPassed,
  isTbmHere,
  formatOffsetLabel,
  formatMeasuredAtLabel,
} from "../../utils/instrumentSchedule";

export default function ScheduleTimeline({
  schedules = [],
  locationName,
  tbmChainage,
  operationalChainage,
  onMark,
  readOnly = false,
}) {
  const [selectedSchedule, setSelectedSchedule] = useState(null);

  const groups = useMemo(() => groupDistanceSchedules(schedules, locationName), [schedules, locationName]);

  // isPassed/approachingIndex/isTbmHere ไม่ null-check ค่า tbmChainage เอง (เช็คแค่ field ฝั่ง schedule)
  // — ถ้า tbmChainage/operationalChainage ยังไม่มา (เช่น machineProgress ยังโหลดไม่เสร็จ) ค่า null จะถูก
  // coerce เป็น 0 ใน `<=` แล้วทำให้ทุก node ดูเหมือน "ผ่านแล้ว" ผิดๆ จึง guard ไว้ที่ชั้น presentation นี้
  const hasTbmPosition = tbmChainage != null && operationalChainage != null;
  const approachingIdx = useMemo(
    () => (hasTbmPosition ? approachingIndex(groups, tbmChainage) : -1),
    [groups, tbmChainage, hasTbmPosition]
  );
  const distance = hasTbmPosition ? operationalChainage - tbmChainage : null;

  return (
    <>
      <section className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="bg-surface-alt px-5 py-4 sm:px-6 flex items-center gap-3 border-b border-line">
          <div className="p-2 rounded-xl bg-cyan-tint border border-cyan/30 shrink-0">
            <Clock className="w-5 h-5 text-navy" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-ink tracking-tight">วาระตรวจวัดตามระยะ</h2>
            <p className="text-xs text-ink-2 font-medium">
              คลิกปุ่ม <span className="text-code-d font-black">ACTION</span> เพื่อบันทึกผลตรวจวัด
            </p>
          </div>
        </div>

        <div className="p-4 sm:px-6 sm:pb-5">
          <div className="bg-surface-alt rounded-2xl border border-line p-4 relative overflow-hidden">
            <div className="relative pt-8 pb-3 px-2 overflow-x-auto">
              <div className="min-w-max flex items-start gap-0 relative">
                {/* เส้นเชื่อม background */}
                <div className="absolute top-[13px] left-8 right-8 h-[3px] bg-line z-0 rounded-full" />

                {groups.map((group, idx, arr) => {
                  const distanceOffset = group[0].distanceOffset || 0;
                  const isAllSkipped = group.every((s) => s.isMeasured && s.notes === "N/A");
                  const isAllMeasured = group.every((s) => s.isMeasured && s.notes !== "N/A");
                  const isComplete = group.every((s) => s.isMeasured);
                  const groupPassed = hasTbmPosition && isPassed(group, tbmChainage);
                  const isPending = groupPassed && !isComplete;
                  const isApproachingNode = !groupPassed && idx === approachingIdx;
                  const tbmHere = hasTbmPosition && isTbmHere(groups, idx, distance);

                  return (
                    <div key={`offset-${distanceOffset}-${idx}`} className="relative z-10 flex flex-col items-center min-w-[85px] w-28">
                      {/* Node ring (visual only) */}
                      <div
                        className={`w-[28px] h-[28px] rounded-full border-[3px] flex items-center justify-center bg-surface z-10 mx-auto transition-colors duration-300 shadow-sm ${
                          isAllSkipped
                            ? "border-ink-3 bg-surface-alt text-ink-3"
                            : isAllMeasured
                            ? "border-code-a text-code-a"
                            : isPending
                            ? "border-code-d ring-4 ring-code-d/20"
                            : isApproachingNode
                            ? "border-code-b ring-4 ring-code-b/20"
                            : "border-line pointer-events-none"
                        }`}
                      >
                        {isAllSkipped && <Ban className="w-4 h-4 stroke-[2.5]" />}
                        {isAllMeasured && <Check className="w-4 h-4 stroke-[3]" />}
                        {isPending && <div className="w-3 h-3 rounded-full bg-code-d animate-pulse" />}
                        {isApproachingNode && <div className="w-2 h-2 rounded-full bg-code-b animate-pulse" />}
                      </div>

                      {/* TBM position indicator */}
                      {tbmHere && (
                        <div className="absolute -top-7 text-navy flex flex-col items-center animate-bounce">
                          <span className="text-[11px] font-black tracking-widest uppercase bg-cyan-tint px-2 py-0.5 rounded-md mb-1 shadow-sm">
                            TBM
                          </span>
                          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-navy" />
                        </div>
                      )}

                      {/* Labels & sub-buttons */}
                      <div className="mt-3 text-center flex flex-col items-center w-full px-1">
                        <span
                          className={`text-sm font-mono font-black transition-colors rounded-md px-1.5 mb-1.5 ${
                            groupPassed ? "text-ink" : "text-ink-3"
                          }`}
                        >
                          {formatOffsetLabel(distanceOffset, locationName)}m
                        </span>

                        <div className="flex flex-row justify-center gap-[2px] w-full px-1">
                          {group.map((schedule) => {
                            const schedPassed =
                              hasTbmPosition && schedule.tbmChainage != null && tbmChainage <= schedule.tbmChainage;
                            const schedPending = schedPassed && !schedule.isMeasured;
                            const measured = schedule.isMeasured;
                            const isSurf = schedule.instrumentGroup === "SURFACE" || schedule.instrumentGroup === "SURF";
                            const isDeep = schedule.instrumentGroup === "DEEP";
                            const groupLabel = isSurf ? "SRF" : isDeep ? "DEP" : (schedule.instrumentGroup || "UKWN").substring(0, 3);
                            const clickable = schedPending || measured;

                            return (
                              <div key={schedule.id} className="flex min-w-[28px] flex-col items-center gap-[3px]">
                                <button
                                  type="button"
                                  onClick={() => clickable && setSelectedSchedule(schedule)}
                                  disabled={!clickable}
                                  title={
                                    schedule.notes === "N/A"
                                      ? `ข้าม ${schedule.instrumentGroup || "เครื่องมือ"}`
                                      : `บันทึกผลตรวจวัด ${schedule.instrumentGroup || "เครื่องมือ"}`
                                  }
                                  className={`text-[8px] px-1 py-[3px] rounded uppercase font-black tracking-widest transition-all min-w-[28px] flex items-center justify-center ${
                                    measured
                                      ? schedule.notes === "N/A"
                                        ? "bg-surface-alt text-ink-3 border border-line shadow-sm"
                                        : "bg-code-a/10 text-code-a border border-code-a/30 shadow-sm"
                                      : schedPending
                                      ? "bg-code-d text-white shadow-md shadow-code-d/20 cursor-pointer hover:bg-code-d/90 animate-pulse ring-1 ring-code-d"
                                      : "bg-surface text-ink-3 border border-line"
                                  }`}
                                >
                                  {measured ? (
                                    schedule.notes === "N/A" ? (
                                      <Ban className="w-2.5 h-2.5 stroke-[4]" />
                                    ) : (
                                      <Check className="w-2.5 h-2.5 stroke-[4]" />
                                    )
                                  ) : (
                                    groupLabel
                                  )}
                                </button>
                                {measured && (
                                  <span
                                    className={`text-[8px] font-bold leading-none ${
                                      schedule.notes === "N/A" ? "text-ink-3" : "text-code-a"
                                    }`}
                                  >
                                    {formatMeasuredAtLabel(schedule.measuredAt, measured)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedSchedule && (
        <SchedReportModal
          sched={selectedSchedule}
          locationName={locationName}
          onMark={onMark}
          onClose={() => setSelectedSchedule(null)}
          readOnly={readOnly}
        />
      )}
    </>
  );
}
