// Task 6.3 — shared "latest reading" info line used by all 4 report types
import { formatShortDate, stationLabelKm } from "./chartUtils";

export default function ContextStrip({ reading, extra }) {
  if (!reading) return null;
  return (
    <div className="rounded-input border border-line bg-surface-alt px-3 py-2 text-xs font-semibold text-ink-2">
      ล่าสุด {formatShortDate(reading.date)}
      {reading.tbmChainage != null && <> · TBM STA {stationLabelKm(reading.tbmChainage)}</>}
      {extra && <> · {extra}</>}
    </div>
  );
}
