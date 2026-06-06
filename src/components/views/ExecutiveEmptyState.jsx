import React from "react";
import { Clock, ClipboardList, ChevronRight } from "lucide-react";
import PrepGanttView from "./PrepGanttView";
import ImageSlideshow from "../dashboard/ImageSlideshow";
import { DRIVE_PHOTOS_FOLDER_ID } from "../../utils/constants";
import { getMachineConfig } from "../../utils/machineConfig";
import { dailyReportSummary } from "../../utils/dailyReports";
import { formatDisplayDate } from "../../utils/formatters";

const ExecutiveEmptyState = ({ machine = "TBM1", dailyReports = [], onNavigate }) => {
  const cfg = getMachineConfig(machine);
  const { count, latestDate, latestText } = dailyReportSummary(dailyReports);
  const goDaily = () => onNavigate && onNavigate({ tab: "daily_report" });

  return (
    <div className="max-w-full mx-auto space-y-8 animate-fade-in pb-24">
      {/* Hero */}
      <section className="rounded-card border border-line bg-surface shadow-card p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-tint text-cyan-med mb-4">
          <Clock size={32} />
        </div>
        <h2 className="text-xl font-semibold text-ink">ยังไม่เริ่มขุดเจาะ</h2>
        <p className="text-sm text-ink-3 mt-1">{cfg.tbmNo} · {cfg.location}</p>
        <p className="text-sm text-ink-2 mt-3 max-w-md mx-auto">
          หน้าสรุปผลงานขุดเจาะจะแสดงอัตโนมัติเมื่อบันทึกวงแรก ระหว่างนี้ดูรายงานประจำวันและรูปหน้างานได้ด้านล่าง
        </p>
      </section>

      {/* แผนเตรียมงาน (Gantt) */}
      <PrepGanttView machine={machine} />

      {/* Daily report summary (คลิกไปหน้า Daily Report) */}
      <button
        onClick={goDaily}
        className="w-full text-left rounded-card border border-line bg-surface shadow-card p-6 hover:bg-cyan-tint/40 transition-colors group"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-input bg-navy/5 text-navy shrink-0">
              <ClipboardList size={20} />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-ink text-base">
                รายงานประจำวัน <span className="text-ink-3 font-normal">{count} รายการ</span>
                {latestDate && <span className="text-ink-3 font-normal"> · ล่าสุด {formatDisplayDate(latestDate)}</span>}
              </div>
              <div className="text-sm text-ink-3 mt-0.5 line-clamp-2">
                {count > 0 ? (latestText || "—") : "ยังไม่มีรายงานประจำวัน"}
              </div>
            </div>
          </div>
          <ChevronRight size={20} className="text-ink-3 group-hover:text-navy shrink-0" />
        </div>
      </button>

      {/* รูปหน้างาน */}
      <ImageSlideshow folderId={DRIVE_PHOTOS_FOLDER_ID} />
    </div>
  );
};

export default ExecutiveEmptyState;
