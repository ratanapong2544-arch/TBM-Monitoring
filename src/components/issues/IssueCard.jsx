import React from "react";
import { Pencil, Check, RotateCcw, Trash2 } from "lucide-react";
import Badge from "../../ui-ux-pro-max/components/Badge";
import { SEVERITY, progressPct, effectiveCurrent, MACHINE_LABEL } from "../../utils/issues";

export default function IssueCard({ issue, onEdit, onCloseIssue, onReopenIssue, onDeleteIssue, currentRingNum = 0, alwaysShowActions = false }) {
  const sev = SEVERITY[issue.severity] || SEVERITY.info;
  const isClosed = issue.status === "closed";
  const eff = effectiveCurrent(issue, currentRingNum);
  const pct = issue.qtyEnabled ? progressPct(eff, issue.qtyTarget) : 0;
  const remain = Math.max(0, (Number(issue.qtyTarget) || 0) - eff);

  return (
    <div className={`bg-surface border border-line ${sev.accent} border-l-4 rounded-card shadow-card p-3 group ${isClosed ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`font-semibold text-ink text-base leading-snug ${isClosed ? "line-through" : ""}`}>{issue.title}</div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-badge bg-cyan-tint text-navy">{MACHINE_LABEL[issue.machine || "TBM1"]}</span>
          <Badge code={isClosed ? "neutral" : sev.badge}>{isClosed ? "ปิดแล้ว" : sev.label}</Badge>
        </div>
      </div>

      {issue.qtyEnabled && (
        <div className="mt-2">
          <div className="flex items-end justify-between mb-1">
            <span className="text-lg font-bold text-navy leading-none">{pct}%</span>
            <span className="text-sm font-semibold text-ink-2">ทำได้ {eff} / {issue.qtyTarget} {issue.qtyUnit}</span>
          </div>
          <div className="h-2.5 bg-line/50 rounded-full overflow-hidden">
            <div className="h-full bg-navy rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1 text-xs">
            <span className="text-ink-3">{remain > 0 ? `เหลือ ${remain} ${issue.qtyUnit}` : "ครบแล้ว ✓"}</span>
            {issue.qtyAuto && <span className="text-cyan-med font-semibold">🔄 ตามวงปัจจุบัน</span>}
          </div>
        </div>
      )}

      {(issue.date || issue.ringCH || issue.detail) && (
        <div className="mt-2 text-sm text-ink-3 space-y-0.5">
          {(issue.date || issue.ringCH) && (
            <div>{issue.date && `📅 ${issue.date}`}{issue.date && issue.ringCH && " · "}{issue.ringCH}</div>
          )}
          {issue.detail && <div className="text-ink-2">{issue.detail}</div>}
        </div>
      )}

      <div className={`flex items-center gap-1 mt-2.5 pt-2 border-t border-line/60 transition-opacity ${alwaysShowActions ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
        <button onClick={() => onEdit(issue)} title="แก้ไข" className="p-1.5 rounded-input text-ink-3 hover:bg-cyan-tint hover:text-navy transition-colors"><Pencil size={16} /></button>
        {isClosed ? (
          <button onClick={() => onReopenIssue(issue.id)} title="เปิดใหม่" className="p-1.5 rounded-input text-ink-3 hover:bg-cyan-tint hover:text-navy transition-colors"><RotateCcw size={16} /></button>
        ) : (
          <button onClick={() => onCloseIssue(issue.id)} title="ปิด (แก้แล้ว)" className="p-1.5 rounded-input text-ink-3 hover:bg-code-a/10 hover:text-code-a transition-colors"><Check size={16} /></button>
        )}
        <button onClick={() => onDeleteIssue(issue.id)} title="ลบ" className="p-1.5 rounded-input text-ink-3 hover:bg-code-d/10 hover:text-code-d transition-colors ml-auto"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}
