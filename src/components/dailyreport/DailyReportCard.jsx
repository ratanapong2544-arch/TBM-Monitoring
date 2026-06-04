import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { formatDisplayDate } from "../../utils/formatters";
import { itemPercent } from "../../utils/dailyReports";

const MACHINE_BADGE = {
  TBM1: "bg-navy text-white",
  TBM2: "bg-cyan-med text-white",
};

export default function DailyReportCard({ report, onOpen, onDelete }) {
  const eqN = Object.values(report.equipment || {}).filter((v) => v != null).length;
  const lbSum = Object.values(report.labor || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const logs = (report.workLog || []).filter((it) => it.title);
  const status = report.workLog && report.workLog.length ? { label: "บันทึกแล้ว", cls: "bg-sgreen-dark/10 text-sgreen-dark" } : { label: "ร่าง", cls: "bg-line text-ink-2" };

  return (
    <div className="bg-surface rounded-card border border-line shadow-card hover:shadow-hover transition-shadow overflow-hidden flex flex-col">
      <button type="button" onClick={() => onOpen(report)} className="text-left p-4 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="font-mono text-[10px] text-cyan-med">รายงานประจำวัน</span>
          {report.machine && <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-badge ${MACHINE_BADGE[report.machine]}`}>{report.machine}</span>}
        </div>
        <div className="font-semibold text-ink">{formatDisplayDate(report.date)}</div>
        <div className="text-xs text-ink-2 mt-0.5 truncate">{report.area || "—"}</div>
        <div className="mt-3 space-y-1 text-[11px] text-ink-3">
          <div>เครื่องจักร {eqN} · แรงงาน {lbSum} คน</div>
          {logs[0] && <div className="truncate">งาน: {logs[0].title}{itemPercent(logs[0]) !== null ? ` (${logs[0].done}/${logs[0].total})` : ""}</div>}
        </div>
      </button>
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-line-divider">
        <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>{status.label}</span>
        <div className="flex items-center gap-1 print:hidden">
          <button type="button" onClick={() => onOpen(report)} className="p-1.5 text-ink-3 hover:text-navy hover:bg-surface-alt rounded-input" title="แก้ไข"><Pencil size={14} /></button>
          <button type="button" onClick={() => onDelete(report.id)} className="p-1.5 text-ink-3 hover:text-code-d hover:bg-code-d/10 rounded-input" title="ลบ"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );
}
