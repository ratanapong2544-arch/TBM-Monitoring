// Task R3a — SchedReportModal: measurement report modal (date + Confirm Done / N/A / Cancel).
// Full-fidelity port from tunnel-monitoring's LocationDetailClient.tsx:915-1001 (navy reskin).
// Reused by both ScheduleTimeline and LongTermMonitoring (each holds its own `selectedSchedule`
// state and renders this as a sibling modal), and per the task brief intended for reuse by the R4
// dashboard too. Contract: onMark(sched, "done", isoDate) | onMark(sched, "na") | onMark(sched,
// "cancel") — matches App.jsx's handleMarkInstSchedule(sched, kind, measuredAtISO) from R1.
// readOnly hides the Confirm/N-A/Cancel buttons and shows a read-only status line instead.
import { useState } from "react";
import { X, CheckCircle2, Ban, Undo2, AlertTriangle } from "lucide-react";
import { formatOffsetLabel, formatLongTermDate } from "../../utils/instrumentSchedule";

function toDateInputValue(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SchedReportModal({ sched, locationName, onMark, onClose, readOnly = false }) {
  const now = new Date();
  const initialDate = sched?.measuredAt ? new Date(sched.measuredAt) : now;
  const [dateStr, setDateStr] = useState(toDateInputValue(initialDate));
  const todayStr = toDateInputValue(now);

  if (!sched) return null;
  const isNA = sched.notes === "N/A";

  const handleConfirm = () => {
    onMark && onMark(sched, "done", new Date(dateStr).toISOString());
    onClose();
  };
  const handleNA = () => {
    onMark && onMark(sched, "na");
    onClose();
  };
  const handleCancelMeasurement = () => {
    onMark && onMark(sched, "cancel");
    onClose();
  };

  const offsetLabel =
    sched.scheduleType === "LONG_TERM"
      ? sched.longTermLabel ?? "Long Term"
      : `ระยะ: ${formatOffsetLabel(sched.distanceOffset, locationName)}m`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-dark/50 backdrop-blur-sm animate-fade-in no-print">
      <div className="bg-surface rounded-modal w-full max-w-sm shadow-modal overflow-hidden">
        <div className="px-6 py-4 bg-navy-dark text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-base">{sched.isMeasured ? "แก้ไขผลตรวจวัด" : "บันทึกผลตรวจวัด"}</h3>
            <p className="text-xs text-cyan-tint/80 font-medium mt-0.5">{offsetLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-ink-3 mb-2 block">วันที่ตรวจวัด</label>
            {readOnly ? (
              <div className="w-full px-4 py-3 bg-surface-alt border border-line rounded-xl text-sm font-bold text-ink">
                {sched.measuredAt ? formatLongTermDate(sched.measuredAt) : "ยังไม่ระบุ"}
              </div>
            ) : (
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                max={todayStr}
                className="w-full px-4 py-3 bg-surface-alt border border-line rounded-xl text-sm font-bold text-ink focus:ring-2 focus:ring-navy focus:outline-none transition-all"
              />
            )}
            {isNA && (
              <div className="mt-2 text-xs font-bold text-code-b bg-code-b/10 p-2 rounded-lg border border-code-b/30 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> ปัจจุบันบันทึกเป็นเข้าไม่ได้ (N/A)
              </div>
            )}
            {!readOnly && (
              <p className="text-[10px] text-ink-3 mt-1.5 font-medium">เลือกวันที่ตรวจวัดจริงเพื่อยืนยันผลการตรวจสอบ</p>
            )}
          </div>

          {readOnly ? (
            <div className="text-xs text-ink-2 font-medium bg-surface-alt border border-line rounded-xl p-3">
              {sched.isMeasured ? (isNA ? "สถานะ: ข้าม (N/A)" : "สถานะ: ตรวจวัดแล้ว") : "สถานะ: ยังไม่ตรวจวัด"}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                className="w-full py-3.5 bg-code-a hover:bg-code-a/90 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> {sched.isMeasured && !isNA ? "อัปเดตวันที่" : "ยืนยันตรวจวัดเสร็จสิ้น"}
              </button>

              {!sched.isMeasured && (
                <button
                  type="button"
                  onClick={handleNA}
                  className="w-full py-3 bg-surface-alt hover:bg-line/40 text-ink-2 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" /> ไม่สามารถเข้าตรวจวัดได้ (N/A)
                </button>
              )}

              {sched.isMeasured && (
                <button
                  type="button"
                  onClick={handleCancelMeasurement}
                  className="w-full py-3 mt-2 bg-code-d/10 hover:bg-code-d/20 text-code-d rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 border border-code-d/30"
                >
                  <Undo2 className="w-4 h-4" /> ยกเลิกการบันทึก (Cancel)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
