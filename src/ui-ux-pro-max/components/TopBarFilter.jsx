import React from "react";
import { Filter } from "lucide-react";

const MODES = [["all", "ทั้งหมด"], ["daily", "รายวัน"], ["weekly", "รายสัปดาห์"], ["monthly", "รายเดือน"], ["range", "กำหนดช่วง"]];

// Compact filter control for the app TopBar (one global filter across dashboard pages).
export default function TopBarFilter({ state, setters }) {
  const { mode, date, week, month, rangeStart, rangeEnd } = state;
  const { setMode, setDate, setWeek, setMonth, setRangeStart, setRangeEnd } = setters;
  const inp = "px-2 py-1 text-xs font-semibold border border-line rounded-input outline-none focus:border-navy bg-surface text-ink";
  return (
    <div className="flex items-center gap-1.5">
      <Filter size={14} className="text-navy shrink-0" />
      <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${inp} cursor-pointer font-semibold ${mode !== "all" ? "text-navy border-navy/40" : ""}`} title="กรองช่วงเวลา">
        {MODES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
      </select>
      {mode === "daily" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />}
      {mode === "weekly" && <input type="week" value={week} onChange={(e) => setWeek(e.target.value)} className={inp} />}
      {mode === "monthly" && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inp} />}
      {mode === "range" && (
        <>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className={inp} />
          <span className="text-ink-3 text-xs">-</span>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className={inp} />
        </>
      )}
    </div>
  );
}
