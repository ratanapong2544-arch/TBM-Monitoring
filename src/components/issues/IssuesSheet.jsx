import React from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import IssuesList from "./IssuesList";
import { openCount } from "../../utils/issues";

export default function IssuesSheet({ open, issues, onAdd, onEdit, onCloseIssue, onReopenIssue, onDeleteIssue, onDismiss, currentRingNum = 0 }) {
  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50 print:hidden" onClick={onDismiss}>
      <div className="absolute inset-0 bg-navy-dark/35" />
      <div className="absolute bottom-0 inset-x-0 bg-surface rounded-t-modal shadow-modal max-h-[80vh] flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-line" /></div>
        <div className="flex items-center justify-between px-5 py-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <AlertTriangle size={16} className="text-code-c" /> ปัญหา / อุปสรรค
            <span className="text-ink-3 font-normal">({openCount(issues)})</span>
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={onAdd} className="inline-flex items-center gap-1 bg-navy hover:bg-navy-deepest text-white text-xs font-semibold px-2.5 py-1.5 rounded-input"><Plus size={14} /> เพิ่ม</button>
            <button onClick={onDismiss} className="p-1.5 rounded-input text-ink-3 hover:bg-cyan-tint"><X size={18} /></button>
          </div>
        </div>
        <div className="px-5 pt-1 pb-5 overflow-y-auto">
          <IssuesList issues={issues} onEdit={onEdit} onCloseIssue={onCloseIssue} onReopenIssue={onReopenIssue} onDeleteIssue={onDeleteIssue} currentRingNum={currentRingNum} alwaysShowActions={true} />
        </div>
      </div>
    </div>
  );
}
