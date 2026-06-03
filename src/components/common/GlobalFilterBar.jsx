import React from "react";
import { Settings } from "lucide-react";

const MODES = [["all", "ทั้งหมด (All)"], ["daily", "รายวัน (Daily)"], ["weekly", "รายสัปดาห์ (Weekly)"], ["monthly", "รายเดือน (Monthly)"], ["range", "กำหนดช่วง (Range)"]];

export default function GlobalFilterBar({ state, setters, title = "Global Dashboard Filter", subtitle = "กรองข้อมูลภาพรวมทั้งหน้าหลัก" }) {
  const { mode, date, week, month, rangeStart, rangeEnd } = state;
  const { setMode, setDate, setWeek, setMonth, setRangeStart, setRangeEnd } = setters;
  return (
    <div className="bg-surface rounded-card p-5 shadow-card border border-line flex flex-col md:flex-row gap-4 items-start md:items-center justify-between print:hidden">
      <div className="flex items-center gap-3">
        <div className="bg-navy-dark text-white p-2.5 rounded-input shadow-card"><Settings size={20} /></div>
        <div>
          <h3 className="text-lg font-semibold text-ink tracking-tight">{title}</h3>
          <p className="text-xs font-semibold text-ink-3">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col xl:flex-row gap-3 w-full md:w-auto overflow-hidden">
        <div className="flex bg-surface-alt border border-line rounded-input p-1 shadow-card overflow-x-auto w-full xl:w-auto shrink-0">
          {MODES.map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} className={`px-4 py-2 text-xs rounded-input font-semibold transition whitespace-nowrap ${mode === m ? "bg-navy-dark text-white shadow" : "text-ink-2 hover:bg-surface"}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {mode === "daily" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink bg-surface" />}
          {mode === "weekly" && <input type="week" value={week} onChange={(e) => setWeek(e.target.value)} className="px-3 py-2 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink bg-surface" />}
          {mode === "monthly" && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink bg-surface" />}
          {mode === "range" && (
            <div className="flex items-center gap-2 bg-surface border border-line rounded-input px-2">
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="py-2 flex-1 w-[120px] text-xs font-semibold bg-transparent outline-none text-ink" />
              <span className="text-ink-3">-</span>
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="py-2 flex-1 w-[120px] text-xs font-semibold bg-transparent outline-none text-ink" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
