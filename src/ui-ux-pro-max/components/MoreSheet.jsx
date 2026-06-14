import React, { useState } from "react";
import { NAV_GROUPS, MOBILE_MORE_TABS } from "./navModel";

export default function MoreSheet({ open, onClose, onNavigate }) {
  const [logoOk, setLogoOk] = useState(true); // รูปจริงจาก public/ ถ้ามี, ไม่งั้น fallback emblem
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

          {/* Developer credit — TEAM Group (mirror ของ footer ใน Sidebar เดสก์ท็อป ที่ซ่อนบนมือถือ) */}
          <div className="border-t border-line pt-4 mt-1">
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-ink-3 mb-2">Developed by</div>
            {logoOk ? (
              <div className="bg-white rounded-md px-3 py-2 inline-flex items-center border border-line">
                <img src="/team-group-logo.png" alt="TEAM GROUP" className="h-8 w-auto object-contain" onError={() => setLogoOk(false)} />
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <svg width="32" height="32" viewBox="0 0 48 48" className="shrink-0" role="img" aria-label="TEAM GROUP">
                  <rect x="1.5" y="1.5" width="45" height="45" rx="6" fill="#15407c" />
                  <g stroke="#ffffff" fill="none" strokeLinecap="round">
                    <rect x="6.5" y="6.5" width="35" height="35" rx="2.5" strokeWidth="2" />
                    <path strokeWidth="1.5" d="M24 6.5 V41.5 M6.5 24 H41.5
                      M6.5 6.5 L24 24 M24 6.5 L6.5 24
                      M24 6.5 L41.5 24 M41.5 6.5 L24 24
                      M6.5 24 L24 41.5 M24 24 L6.5 41.5
                      M24 24 L41.5 41.5 M41.5 24 L24 41.5" />
                  </g>
                </svg>
                <div className="leading-none">
                  <div className="text-ink font-bold text-[15px] tracking-tight">TEAM<span className="font-medium text-ink-2"> GROUP</span></div>
                  <div className="text-ink-3 text-[8px] font-medium mt-1 leading-tight">Development for Sustainable Growth</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
