import React from "react";
export default function SegmentedToggle({ value, onChange, options }) {
  return (
    <div className="flex bg-surface-alt border border-line rounded-input p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`flex-1 px-4 py-2 rounded-[5px] text-xs font-semibold transition-colors ${value === o.value ? "bg-navy text-white shadow-card" : "text-ink-2 hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
