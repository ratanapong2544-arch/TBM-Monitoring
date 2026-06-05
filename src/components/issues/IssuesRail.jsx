import React from "react";
import { Plus, AlertTriangle } from "lucide-react";
import IssuesList from "./IssuesList";
import { openCount } from "../../utils/issues";

export default function IssuesRail({ issues, onAdd, onEdit, onCloseIssue, onReopenIssue, onDeleteIssue }) {
  return (
    <aside className="hidden lg:flex flex-col w-[360px] flex-shrink-0 lg:sticky lg:top-[65px] lg:self-start lg:h-[calc(100vh-65px)] border-l border-line bg-surface px-4 py-6 print:hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-ink">
          <AlertTriangle size={16} className="text-code-c" /> ปัญหา / อุปสรรค
          <span className="text-ink-3 font-normal">({openCount(issues)})</span>
        </h2>
        <button onClick={onAdd} className="inline-flex items-center gap-1 bg-navy hover:bg-navy-deepest text-white text-xs font-semibold px-2.5 py-1.5 rounded-input transition-colors">
          <Plus size={14} /> เพิ่ม
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <IssuesList issues={issues} onEdit={onEdit} onCloseIssue={onCloseIssue} onReopenIssue={onReopenIssue} onDeleteIssue={onDeleteIssue} />
      </div>
    </aside>
  );
}
