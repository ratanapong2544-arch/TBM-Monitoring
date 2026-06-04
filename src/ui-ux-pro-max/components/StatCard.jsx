import React from "react";
export default function StatCard({ label, value, subtext, color = "text-navy", valueColor = "text-ink", icon: Icon, featured = false }) {
  if (featured) {
    // การ์ดเด่น (primary) — พื้น navy เต็มใบ ตัวอักษรขาว เลขใหญ่กว่า เพื่อให้เป็นจุดโฟกัสหลัก
    return (
      <div className="bg-navy-dark border border-navy rounded-card shadow-modal p-5 flex flex-col relative overflow-hidden">
        <div className="flex items-center gap-3 mb-3">
          {Icon && (
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-white">
              <Icon size={18} />
            </div>
          )}
          <div className="text-[11px] text-cyan-tint/80 uppercase font-semibold tracking-wider leading-tight">{label}</div>
        </div>
        <div className="text-4xl sm:text-5xl font-bold tracking-tight font-mono text-white">{value}</div>
        {subtext && <div className="text-[11px] font-medium mt-2 text-cyan-tint/70">{subtext}</div>}
      </div>
    );
  }
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
