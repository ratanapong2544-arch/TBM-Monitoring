import React from "react";

// แถบแท็บ Dashboard แนวนอน (มือถือเท่านั้น) — ให้เห็นทุกหน้า dashboard โดยไม่ต้องเปิดเมนู More
export default function MobileDashboardTabs({ items = [], activeTab, activeModule, onNavigate }) {
  if (!items.length) return null;
  return (
    <div className="lg:hidden border-b border-line bg-surface overflow-x-auto print:hidden">
      <div className="flex gap-2 px-4 py-2 min-w-max">
        {items.map((it) => {
          const active = activeTab === it.tab && (!it.module || it.module === activeModule);
          return (
            <button
              key={it.id}
              onClick={() => onNavigate(it)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                active
                  ? "bg-navy text-white border-navy"
                  : "bg-surface text-ink-2 border-line hover:bg-cyan-tint hover:text-navy"
              }`}
            >
              <it.icon size={14} className="shrink-0" />
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
