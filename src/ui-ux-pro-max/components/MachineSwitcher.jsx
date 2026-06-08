import React from "react";
import { Layers } from "lucide-react";
import { MACHINES } from "../../utils/dailyReports";
import { getMachineConfig } from "../../utils/machineConfig";

// SP-A global machine switcher (TBM1/TBM2).
// size: "lg" (Home — prominent card selector) | "sm" (TopBar — compact pills)
export default function MachineSwitcher({ value, onChange, size = "sm" }) {
  if (size === "lg") {
    return (
      <div className="grid grid-cols-2 gap-3 w-full">
        {MACHINES.map((m) => {
          const cfg = getMachineConfig(m);
          const active = value === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              aria-pressed={active}
              className={`text-left rounded-card border p-4 transition-all ${
                active
                  ? "bg-navy border-navy text-white shadow-card"
                  : "bg-surface border-line text-ink hover:border-navy/40 hover:bg-cyan-tint/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers size={20} className={active ? "text-white" : "text-navy"} />
                <span className="text-xl font-bold tracking-wide">{m}</span>
                {active && (
                  <span className="ml-auto text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-badge">กำลังดู</span>
                )}
              </div>
              <div className={`text-xs mt-1.5 truncate ${active ? "text-white/80" : "text-ink-3"}`}>{cfg.location}</div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex bg-surface-alt border border-line rounded-input p-1 gap-0.5">
      {MACHINES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-input transition-colors px-2.5 py-1 text-xs font-semibold ${
            value === m ? "bg-navy text-white shadow-sm" : "text-ink-2 hover:bg-surface"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
