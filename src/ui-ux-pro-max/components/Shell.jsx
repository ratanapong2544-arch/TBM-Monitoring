import React from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import MoreSheet from "./MoreSheet";
import { NAV_GROUPS, MOBILE_PRIMARY } from "./navModel";

// Build the mobile bottom-bar items from MOBILE_PRIMARY tabs
// (first unique-tab items only)
function buildMobileItems() {
  const seen = new Set();
  const items = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (MOBILE_PRIMARY.includes(item.tab) && !seen.has(item.tab)) {
        seen.add(item.tab);
        items.push(item);
      }
    }
  }
  return items;
}

const MOBILE_ITEMS = buildMobileItems();

export default function Shell({
  active = {},
  onNavigate,
  title,
  liveStatus,
  projectInfo,
  onProjectChange,
  moreOpen,
  setMoreOpen,
  children,
}) {
  return (
    <div className="flex min-h-screen bg-surface-page font-sans">
      {/* Desktop Sidebar */}
      <Sidebar active={active} onNavigate={onNavigate} liveStatus={liveStatus} />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TopBar — desktop shows full, mobile shows compact */}
        <TopBar
          title={title}
          liveStatus={liveStatus}
          projectInfo={projectInfo}
          onProjectChange={onProjectChange}
          compact={false}
        />

        {/* Page content */}
        <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="px-4 sm:px-6 py-6 w-full print:p-0 print:m-0">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav
        items={MOBILE_ITEMS}
        activeTab={active.tab}
        onNavigate={onNavigate}
        onMore={() => setMoreOpen(true)}
      />

      {/* Mobile More sheet */}
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
}
