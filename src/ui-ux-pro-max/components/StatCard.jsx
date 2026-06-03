import React from "react";
export default function StatCard({ label, value, subtext, color = "text-navy", valueColor = "text-ink", icon: Icon }) {
  return (
    <div className="bg-surface border border-line rounded-card shadow-hover hover:shadow-modal transition-shadow duration-200 p-5 flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        {Icon && (
          <div className={`w-10 h-10 rounded-full bg-cyan-tint flex items-center justify-center shrink-0 ${color}`}>
            <Icon size={18} />
          </div>
        )}
        <div className="text-[11px] text-ink-3 uppercase font-semibold tracking-wider leading-tight">{label}</div>
      </div>
      <div className={`text-3xl sm:text-4xl font-bold tracking-tight font-mono ${valueColor}`}>{value}</div>
      {subtext && <div className="text-[11px] font-medium mt-2 text-ink-3">{subtext}</div>}
    </div>
  );
}
