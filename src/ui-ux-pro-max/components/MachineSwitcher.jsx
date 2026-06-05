import React from "react";
import { MACHINES } from "../../utils/dailyReports";

// SP-A global machine switcher (TBM1/TBM2). size: "lg" (Home) | "sm" (TopBar)
export default function MachineSwitcher({ value, onChange, size = "sm" }) {
  const lg = size === "lg";
  return (
    <div className={`inline-flex bg-surface-alt border border-line rounded-input p-1 ${lg ? "gap-1" : "gap-0.5"}`}>
      {MACHINES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`font-semibold rounded-input transition-colors ${lg ? "px-5 py-2 text-sm" : "px-2.5 py-1 text-xs"} ${
            value === m ? "bg-navy text-white shadow-sm" : "text-ink-2 hover:bg-surface"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
