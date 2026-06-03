import React from "react";
export default function BottomNav({ items, activeTab, onNavigate, onMore }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-navy-dark border-t border-white/10 print:hidden"
         style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex justify-around items-stretch">
        {items.map((it) => (
          <button key={it.id} onClick={() => onNavigate(it)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 min-h-[48px] text-[10px] font-semibold ${activeTab === it.tab ? "text-white" : "text-cyan-tint/70"}`}>
            <it.icon size={20} /> <span className="leading-none">{it.short || it.label}</span>
          </button>
        ))}
        <button onClick={onMore} className="flex-1 flex flex-col items-center gap-0.5 py-2.5 min-h-[48px] text-[10px] font-semibold text-cyan-tint/70">⋯ More</button>
      </div>
    </nav>
  );
}
