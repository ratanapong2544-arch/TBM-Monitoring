import React from "react";
import { MapPin } from "lucide-react";
import Badge from "./Badge";
import MachineSwitcher from "./MachineSwitcher";

export default function TopBar({ title, liveStatus, projectInfo, onProjectChange, compact = false, rightSlot = null, machine, onMachineChange }) {
  // projectInfo may be the full object { location, date, shift, tbmNo } or a plain string
  const location =
    projectInfo && typeof projectInfo === "object" ? projectInfo.location ?? "" : projectInfo ?? "";

  return (
    <header className={`bg-surface border-b border-line flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-x-4 px-3 sm:px-5 print:hidden sticky top-0 z-40 ${compact ? "py-2.5" : "py-3"}`}>
      {onMachineChange && <div className="shrink-0"><MachineSwitcher value={machine} onChange={onMachineChange} size="sm" /></div>}
      {/* Page title + editable location */}
      <div className="flex-1 min-w-0">
        <h1 className={`font-semibold text-ink truncate ${compact ? "text-base" : "text-lg"}`}>
          {title || `${machine || "TBM"} Monitoring`}
        </h1>
        <div className="flex items-center gap-1 text-[11px] text-ink-3 mt-0.5">
          <MapPin size={12} className="shrink-0" />
          <input
            type="text"
            name="location"
            value={location}
            onChange={onProjectChange}
            list="tbm-locations"
            placeholder="สถานที่…"
            title="แก้ไขสถานที่โครงการ"
            className="bg-transparent border-none p-0 outline-none focus:ring-0 w-44 sm:w-80 max-w-full truncate cursor-pointer focus:cursor-text placeholder-ink-3 hover:text-ink focus:text-ink transition-colors"
          />
          <datalist id="tbm-locations">
            <option value="อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2" />
          </datalist>
        </div>
      </div>

      {/* Live status */}
      {liveStatus && (
        <div className="shrink-0">
          <Badge code={liveStatus.code || "neutral"}>{liveStatus.label || liveStatus}</Badge>
        </div>
      )}
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </header>
  );
}
