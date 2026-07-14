import React, { useState } from "react";
import { NAV_GROUPS, viewerGroups } from "./navModel";
import CutterHeadMark from "./CutterHeadMark";

// สีจุดสถานะ — ต้องสว่างพออ่านบนพื้น navy
const STATUS_DOT = {
  a: "bg-sgreen-med", b: "bg-code-b", c: "bg-code-c", d: "bg-code-d",
  info: "bg-cyan", neutral: "bg-cyan-tint",
};

export default function Sidebar({ active = {}, onNavigate, liveStatus, machine, isViewer = false }) {
  const [logoOk, setLogoOk] = useState(true); // ใช้รูปจริงจาก public/ ถ้ามี, ไม่งั้น fallback เป็น emblem
  return (
    <aside className="hidden lg:flex flex-col w-60 bg-navy-dark h-screen sticky top-0 shrink-0 print:hidden">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
        <div className="w-8 h-8 rounded-md bg-navy flex items-center justify-center shrink-0 border border-white/15">
          <CutterHeadMark size={20} tone="brand" />
        </div>
        <div className="leading-tight">
          <div className="text-white font-semibold text-sm tracking-tight">Tunnel Monitoring System</div>
          <div className="text-cyan-tint/55 text-[10px] font-medium">อุโมงค์ระบายน้ำคลองเปรมประชากร</div>
        </div>
      </div>

      {/* Live status */}
      {liveStatus && (
        <div className="px-5 py-3 border-b border-white/10">
          <div className="text-[10px] text-cyan-tint/60 uppercase font-semibold tracking-wide mb-1.5">TBM Status</div>
          <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-input bg-white/10 border border-white/15">
            <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${STATUS_DOT[liveStatus.code] || STATUS_DOT.neutral}`}></span>
            <span className="text-[11px] font-semibold text-white leading-snug">{liveStatus.label || liveStatus}</span>
          </div>
        </div>
      )}

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {(isViewer ? viewerGroups() : NAV_GROUPS).map((group) => (
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

      {/* Developer credit — TEAM Group */}
      <div className="mt-auto px-5 py-4 border-t border-white/10">
        <div className="text-cyan-tint/45 text-[9px] font-semibold uppercase tracking-[0.15em] mb-2">Developed by</div>
        {logoOk ? (
          /* รูปโลโก้จริง — เซฟไว้ที่ public/team-group-logo.png (วางบนการ์ดขาวให้โลโก้ navy เด่น) */
          <div className="bg-white rounded-md px-3 py-2 inline-flex items-center max-w-full">
            <img src="/team-group-logo.png" alt="TEAM GROUP" className="h-8 w-auto object-contain" onError={() => setLogoOk(false)} />
          </div>
        ) : (
          /* fallback: emblem + wordmark (ถ้ายังไม่ได้วางไฟล์รูป) */
          <div className="flex items-center gap-2.5">
            <svg width="34" height="34" viewBox="0 0 48 48" className="shrink-0" role="img" aria-label="TEAM GROUP">
              <rect x="1.5" y="1.5" width="45" height="45" rx="6" fill="#ffffff" />
              <g stroke="#15407c" fill="none" strokeLinecap="round">
                <rect x="6.5" y="6.5" width="35" height="35" rx="2.5" strokeWidth="2" />
                <path strokeWidth="1.5" d="M24 6.5 V41.5 M6.5 24 H41.5
                  M6.5 6.5 L24 24 M24 6.5 L6.5 24
                  M24 6.5 L41.5 24 M41.5 6.5 L24 24
                  M6.5 24 L24 41.5 M24 24 L6.5 41.5
                  M24 24 L41.5 41.5 M41.5 24 L24 41.5" />
              </g>
            </svg>
            <div className="leading-none">
              <div className="text-white font-bold text-[15px] tracking-tight">TEAM<span className="font-medium text-cyan-tint/85"> GROUP</span></div>
              <div className="text-cyan-tint/50 text-[8px] font-medium mt-1 leading-tight">Development for Sustainable Growth</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
