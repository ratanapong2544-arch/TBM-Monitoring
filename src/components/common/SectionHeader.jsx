import React from "react";

export default function SectionHeader({ title, subtitle, icon: Icon }) {
  return (
    <div className="flex items-center gap-2.5 mb-4 print:hidden">
      {Icon && (
        <div className="bg-surface-alt border border-line text-navy p-1.5 rounded-input shrink-0">
          <Icon size={16} />
        </div>
      )}
      <div className="shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-2 leading-tight">{title}</h2>
        {subtitle && <p className="text-[11px] text-ink-3 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 h-px bg-line ml-1"></div>
    </div>
  );
}
