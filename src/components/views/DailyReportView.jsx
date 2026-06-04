import React from "react";
export default function DailyReportView({ dailyReports = [], onSave, onDelete }) {
  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in">
      <div className="bg-surface rounded-card border border-line shadow-card p-6 text-ink-3 text-sm">
        Daily Report — {dailyReports.length} รายการ (UI ใส่ใน Task 3)
      </div>
    </div>
  );
}
