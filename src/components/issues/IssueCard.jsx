import React from "react";
import { Pencil, Check, RotateCcw, Trash2 } from "lucide-react";
import Badge from "../../ui-ux-pro-max/components/Badge";
import { SEVERITY, progressPct } from "../../utils/issues";

export default function IssueCard({ issue, onEdit, onCloseIssue, onReopenIssue, onDeleteIssue }) {
  const sev = SEVERITY[issue.severity] || SEVERITY.info;
  const isClosed = issue.status === "closed";
  const pct = issue.qtyEnabled ? progressPct(issue.qtyCurrent, issue.qtyTarget) : 0;

  return (
    <div className={`bg-surface border border-line ${sev.accent} border-l-4 rounded-card shadow-card p-3 ${isClosed ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`font-semibold text-ink text-sm leading-snug ${isClosed ? "line-through" : ""}`}>{issue.title}</div>
        <Badge code={isClosed ? "neutral" : sev.badge}>{isClosed ? "ปิดแล้ว" : sev.label}</Badge>
      </div>

      {issue.qtyEnabled && (
        <div className="mt-2">
          <div className="flex justify-between text-[11px] font-semibold text-ink-2">
            <span>ทำได้ {issue.qtyCurrent}</span>
            <span>เป้า {issue.qtyTarget} {issue.qtyUnit}</span>
          </div>
          <div className="h-1.5 bg-line/50 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-navy rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {(issue.date || issue.ringCH || issue.detail) && (
        <div className="mt-2 text-[11px] text-ink-3 space-y-0.5">
          {(issue.date || issue.ringCH) && (
            <div>{issue.date && `📅 ${issue.date}`}{issue.date && issue.ringCH && " · "}{issue.ringCH}</div>
          )}
          {issue.detail && <div className="text-ink-2">{issue.detail}</div>}
        </div>
      )}

      <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-line/60">
        <button onClick={() => onEdit(issue)} title="แก้ไข" className="p-1.5 rounded-input text-ink-3 hover:bg-cyan-tint hover:text-navy transition-colors"><Pencil size={14} /></button>
        {isClosed ? (
          <button onClick={() => onReopenIssue(issue.id)} title="เปิดใหม่" className="p-1.5 rounded-input text-ink-3 hover:bg-cyan-tint hover:text-navy transition-colors"><RotateCcw size={14} /></button>
        ) : (
          <button onClick={() => onCloseIssue(issue.id)} title="ปิด (แก้แล้ว)" className="p-1.5 rounded-input text-ink-3 hover:bg-code-a/10 hover:text-code-a transition-colors"><Check size={14} /></button>
        )}
        <button onClick={() => onDeleteIssue(issue.id)} title="ลบ" className="p-1.5 rounded-input text-ink-3 hover:bg-code-d/10 hover:text-code-d transition-colors ml-auto"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
