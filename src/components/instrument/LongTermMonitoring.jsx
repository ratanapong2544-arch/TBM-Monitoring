// Task R3a — Section B: Long Term Monitoring cards. Full-fidelity port from tunnel-monitoring's
// LocationDetailClient.tsx:318-406 (navy reskin).
//
// Target-model note: `schedules` here is expected to already be scoped to ONE location (per the
// task brief's data contract — instSchedules.filter(locationId), same array ScheduleTimeline
// receives). That makes it safe to pass straight through as the `allSchedules` argument of
// getEffectiveLongTermTargetDate: the DISTANCE rows that function needs to look up (same
// triggerOffset) are guaranteed to already be inside this same location-scoped array, so there is
// no risk of matching a same-offset DISTANCE row that actually belongs to a different location
// (that risk would only exist if a project-wide/unfiltered array were passed here).
import { useState } from "react";
import { Clock, Check, Ban } from "lucide-react";
import SchedReportModal from "./SchedReportModal";
import { sortLongTerm, getEffectiveLongTermTargetDate, formatLongTermDate } from "../../utils/instrumentSchedule";

export default function LongTermMonitoring({ schedules = [], locationName, onMark, readOnly = false }) {
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const longTermSchedules = sortLongTerm(schedules);

  if (longTermSchedules.length === 0) return null;

  return (
    <>
      <section className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="bg-surface-alt px-5 py-3 sm:px-6 flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-tint border border-cyan/30 shrink-0">
              <Clock className="w-4 h-4 text-navy" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-ink tracking-tight">ตรวจวัดระยะยาว</h2>
              <p className="text-[10px] text-ink-2 font-medium">รายการตรวจวัดตามกำหนดเวลาหลังก่อสร้างแล้วเสร็จ</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:px-6 bg-surface-alt">
          <div className="flex flex-wrap gap-4">
            {longTermSchedules.map((schedule) => {
              const targetDate = getEffectiveLongTermTargetDate(schedule, schedules);
              const isMeasured = schedule.isMeasured;
              const hasTargetDate = !!targetDate;
              const isPending = hasTargetDate && !isMeasured && new Date(targetDate) <= new Date();
              const hasMeasuredDate = !!schedule.measuredAt;
              const isNA = schedule.notes === "N/A";

              const dateCaption = isMeasured
                ? hasMeasuredDate
                  ? isNA
                    ? `ข้าม ${formatLongTermDate(schedule.measuredAt)}`
                    : `ตรวจแล้ว ${formatLongTermDate(schedule.measuredAt)}`
                  : isNA
                  ? "ข้าม"
                  : "ตรวจแล้ว"
                : hasTargetDate
                ? `กำหนด ${formatLongTermDate(targetDate)}`
                : "รอจุดกระตุ้น";

              const clickable = hasTargetDate || isMeasured;

              return (
                <div
                  key={schedule.id}
                  className={`flex-1 min-w-[140px] flex items-center justify-between p-3 rounded-2xl border transition-all ${
                    isMeasured
                      ? isNA
                        ? "bg-surface-alt border-line opacity-80"
                        : "bg-code-a/10 border-code-a/30"
                      : isPending
                      ? "bg-surface border-code-d/40 shadow-card ring-1 ring-code-d/20"
                      : hasTargetDate
                      ? "bg-surface border-line shadow-card"
                      : "bg-surface-alt border-line opacity-60 grayscale"
                  }`}
                >
                  <div className="flex flex-col">
                    <span
                      className={`text-[11px] font-black tracking-widest uppercase ${
                        isMeasured ? (isNA ? "text-ink-3" : "text-code-a") : isPending ? "text-code-d" : "text-ink-2"
                      }`}
                    >
                      {schedule.longTermLabel}
                    </span>
                    <span
                      className={`text-[9px] mt-0.5 ${
                        isMeasured
                          ? isNA
                            ? "font-bold text-ink-3"
                            : "font-bold text-code-a"
                          : hasTargetDate
                          ? isPending
                            ? "font-bold text-code-d"
                            : "font-bold text-ink-2"
                          : "font-medium text-ink-3 uppercase tracking-tight"
                      }`}
                    >
                      {dateCaption}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => clickable && setSelectedSchedule(schedule)}
                    disabled={!clickable}
                    title={isMeasured ? "แก้ไขผลตรวจวัด" : hasTargetDate ? "บันทึกผลตรวจวัด" : "ยังไม่ถึงจุดกระตุ้น"}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ml-2 ${
                      isMeasured
                        ? isNA
                          ? "bg-surface-alt text-ink-3"
                          : "bg-code-a/10 text-code-a shadow-sm"
                        : isPending
                        ? "bg-code-d text-white hover:bg-code-d/90 animate-pulse shadow-md shadow-code-d/30"
                        : hasTargetDate
                        ? "bg-surface-alt text-ink-2 hover:bg-line/60"
                        : "bg-line/30 text-ink-3 cursor-not-allowed"
                    }`}
                  >
                    {isMeasured ? (
                      isNA ? <Ban className="w-4 h-4 stroke-[3]" /> : <Check className="w-4 h-4 stroke-[3]" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}
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
