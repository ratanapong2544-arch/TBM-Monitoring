import React from "react";
export default function StatCard({ label, value, subtext, color = "text-navy", icon: Icon }) {
  return (
    <div className="bg-surface p-4 rounded-card border border-line shadow-card relative overflow-hidden flex flex-col justify-between">
      {Icon && <div className={`absolute -right-3 -top-3 opacity-[0.06] ${color}`}><Icon size={72} /></div>}
      <div className="relative z-10">
        <div className="text-[11px] text-ink-2 uppercase font-semibold tracking-wide mb-1.5">{label}</div>
        <div className="text-2xl font-semibold text-ink tracking-tight font-mono">{value}</div>
      </div>
      {subtext && <div className="text-[11px] font-medium mt-3 pt-2 border-t border-line-divider text-ink-2 relative z-10">{subtext}</div>}
    </div>
  );
}
