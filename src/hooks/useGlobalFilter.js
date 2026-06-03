import { useState, useMemo } from "react";
import { formatDisplayDate } from "../utils/formatters";

export function getWeekString(dateObj) {
  const d = new Date(dateObj);
  if (isNaN(d.getTime())) return "";
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export default function useGlobalFilter(segmentRecords = [], groutRecords = []) {
  const [mode, setMode] = useState("all");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [week, setWeek] = useState(() => getWeekString(new Date()));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  const passes = (r) => {
    if (mode === "all") return true;
    const dStr = r.date ? formatDisplayDate(r.date) : "";
    if (!dStr) return false;
    if (mode === "daily") return dStr === date;
    if (mode === "weekly") return getWeekString(r.date) === week;
    if (mode === "monthly") return dStr.startsWith(month);
    if (mode === "range") {
      if (rangeStart && dStr < rangeStart) return false;
      if (rangeEnd && dStr > rangeEnd) return false;
      return true;
    }
    return true;
  };

  const filteredSegments = useMemo(
    () => (mode === "all" ? segmentRecords : segmentRecords.filter(passes)),
    [segmentRecords, mode, date, week, month, rangeStart, rangeEnd]
  );
  const filteredGrout = useMemo(
    () => (mode === "all" ? groutRecords : groutRecords.filter(passes)),
    [groutRecords, mode, date, week, month, rangeStart, rangeEnd]
  );

  return {
    state: { mode, date, week, month, rangeStart, rangeEnd },
    setters: { setMode, setDate, setWeek, setMonth, setRangeStart, setRangeEnd },
    filteredSegments,
    filteredGrout,
  };
}
