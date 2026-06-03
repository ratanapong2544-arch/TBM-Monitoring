import React from "react";
import { NAV_GROUPS, MOBILE_MORE_TABS } from "./navModel";

export default function MoreSheet({ open, onClose, onNavigate }) {
  if (!open) return null;

  // Collect items whose tab is in MOBILE_MORE_TABS
  const moreGroups = NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => MOBILE_MORE_TABS.includes(it.tab)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="lg:hidden fixed inset-0 z-50 print:hidden" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-navy-dark/35" />

      {/* Panel */}
      <div
        className="absolute bottom-0 inset-x-0 bg-surface rounded-t-modal shadow-modal"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-line" />
        </div>

        <div className="px-5 pt-2 pb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-3">เพิ่มเติม</div>
          {moreGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-3 mb-2">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item); onClose(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-card text-sm font-medium text-ink hover:bg-cyan-tint transition-colors"
                  >
                    <item.icon size={18} className="text-navy shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
