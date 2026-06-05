import React, { useState } from "react";
import IssueCard from "./IssueCard";
import { splitAndSort } from "../../utils/issues";

export default function IssuesList({ issues, onEdit, onCloseIssue, onReopenIssue, onDeleteIssue, currentRingNum = 0, alwaysShowActions = false }) {
  const { open, closed } = splitAndSort(issues);
  const [showClosed, setShowClosed] = useState(false);
  const cardProps = { onEdit, onCloseIssue, onReopenIssue, onDeleteIssue, currentRingNum, alwaysShowActions };

  return (
    <div className="space-y-2">
      {open.length === 0 && (
        <p className="text-center text-ink-3 text-base py-6">ไม่มีปัญหาค้างอยู่ 👍</p>
      )}
      {open.map((i) => <IssueCard key={i.id} issue={i} {...cardProps} />)}

      {closed.length > 0 && (
        <>
          <button
            onClick={() => setShowClosed((s) => !s)}
            className="w-full text-center text-sm text-ink-3 hover:text-ink border-t border-line/60 pt-2 mt-2 transition-colors"
          >
            {showClosed ? "▾ ซ่อนที่ปิดแล้ว" : `▸ ดูที่ปิดแล้ว (${closed.length})`}
          </button>
          {showClosed && closed.map((i) => <IssueCard key={i.id} issue={i} {...cardProps} />)}
        </>
      )}
    </div>
  );
}
