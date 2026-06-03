import React from "react";
import { NAV_GROUPS } from "./navModel";
import Badge from "./Badge";
import { Layers } from "lucide-react";

export default function Sidebar({ active = {}, onNavigate, liveStatus }) {
  return (
    <aside className="hidden lg:flex flex-col w-60 bg-navy-dark min-h-screen shrink-0 print:hidden">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
        <div className="w-8 h-8 rounded-md bg-navy flex items-center justify-center text-white shrink-0 border border-white/15">
          <Layers size={18} strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-white font-semibold text-sm tracking-tight">TBM1 System</div>
          <div className="text-cyan-tint/55 text-[10px] font-medium">Tunnel Monitoring</div>
        </div>
      </div>

      {/* Live status */}
      {liveStatus && (
        <div className="px-5 py-3 border-b border-white/10">
          <div className="text-[10px] text-cyan-tint/60 uppercase font-semibold tracking-wide mb-1">TBM Status</div>
          <Badge code={liveStatus.code || "neutral"} className="text-[10px]">
            {liveStatus.label || liveStatus}
          </Badge>
        </div>
      )}

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-cyan-tint/70">
              {group.label}
            </div>
            {group.items.map((item) => {
              const activeMatch =
                active.tab === item.tab &&
                (item.module ? active.module === item.module : true);
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors relative ${
                    activeMatch
                      ? "bg-navy text-white border-l-2 border-sgreen-med"
                      : "text-cyan-tint/80 hover:bg-white/5 hover:text-white border-l-2 border-transparent"
                  }`}
                >
                  <item.icon size={16} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
