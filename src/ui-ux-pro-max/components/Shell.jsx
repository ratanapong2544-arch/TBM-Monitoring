import React, { useState } from "react";
import { Eye } from "lucide-react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TopBarFilter from "./TopBarFilter";
import BottomNav from "./BottomNav";
import MoreSheet from "./MoreSheet";
import { NAV_GROUPS, MOBILE_PRIMARY, viewerGroups } from "./navModel";
import IssuesRail from "../../components/issues/IssuesRail";
import IssuesSheet from "../../components/issues/IssuesSheet";
import IssuesBell from "../../components/issues/IssuesBell";
import DashboardHeaderActions from "../../components/dashboard/DashboardHeaderActions";
import IssueFormModal from "../../components/issues/IssueFormModal";
import { openCount } from "../../utils/issues";

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
const ISSUE_TABS = ["overview", "dashboard"];

export default function Shell({
  active = {},
  onNavigate,
  title,
  liveStatus,
  projectInfo,
  onProjectChange,
  moreOpen,
  setMoreOpen,
  issues = [],
  onSaveIssue,
  onSetIssueStatus,
  onDeleteIssue,
  segmentRecords = [],
  groutRecords = [],
  shiftReports = [],
  activeMachine,
  onMachineChange,
  currentRingNum,
  globalFilter,
  isViewer = false,
  children,
}) {
  const showIssues = !isViewer && ISSUE_TABS.includes(active.tab);
  const showFilter =
    active.tab === "dashboard" ||
    active.tab === "performance" ||
    (active.tab === "analysis" && (active.module === "segment" || active.module === "route"));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modal, setModal] = useState({ open: false, editing: null });

  const openAdd = () => { setSheetOpen(false); setModal({ open: true, editing: null }); };
  const openEdit = (issue) => { setSheetOpen(false); setModal({ open: true, editing: issue }); };
  const submitIssue = (form) => { onSaveIssue(form); setModal({ open: false, editing: null }); };
  const closeIssue = (id) => onSetIssueStatus(id, "closed");
  const reopenIssue = (id) => onSetIssueStatus(id, "open");

  const mobileItems = isViewer
    ? Object.values(viewerGroups()[0].items.reduce((m, it) => { if (!m[it.tab]) m[it.tab] = it; return m; }, {}))
    : MOBILE_ITEMS;

  const railProps = {
    issues,
    onAdd: openAdd,
    onEdit: openEdit,
    onCloseIssue: closeIssue,
    onReopenIssue: reopenIssue,
    onDeleteIssue,
    currentRingNum,
  };

  return (
    <div className="flex min-h-screen bg-surface-page font-sans">
      <Sidebar active={active} onNavigate={onNavigate} liveStatus={liveStatus} machine={activeMachine} isViewer={isViewer} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={title}
          liveStatus={liveStatus}
          projectInfo={projectInfo}
          onProjectChange={onProjectChange}
          compact={false}
          machine={activeMachine}
          onMachineChange={onMachineChange}
          rightSlot={
            <div className="flex items-center gap-2">
              {isViewer && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy bg-cyan-tint border border-line px-2 py-1 rounded-badge whitespace-nowrap">
                  <Eye size={13} /> Viewer
                </span>
              )}
              {showFilter && globalFilter && <TopBarFilter state={globalFilter.state} setters={globalFilter.setters} />}
              {active.tab === "dashboard" && <DashboardHeaderActions segmentRecords={segmentRecords} groutRecords={groutRecords} shiftReports={shiftReports} isViewer={isViewer} />}
              {showIssues && <IssuesBell count={openCount(issues)} onClick={() => setSheetOpen(true)} />}
            </div>
          }
        />

        <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
          {showIssues ? (
            <div className="flex w-full print:block">
              <div className="flex-1 min-w-0 px-4 sm:px-6 py-6 print:p-0 print:m-0">
                <div className="max-w-[1200px] mx-auto w-full print:max-w-none">{children}</div>
              </div>
              <IssuesRail {...railProps} />
            </div>
          ) : (
            <div className="px-4 sm:px-6 py-6 w-full print:p-0 print:m-0">{children}</div>
          )}
        </main>
      </div>

      <BottomNav items={mobileItems} activeTab={active.tab} onNavigate={onNavigate} onMore={isViewer ? undefined : () => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onNavigate={onNavigate} />

      {showIssues && (
        <>
          <IssuesSheet open={sheetOpen} onDismiss={() => setSheetOpen(false)} {...railProps} />
          <IssueFormModal open={modal.open} initial={modal.editing} onSubmit={submitIssue} onClose={() => setModal({ open: false, editing: null })} currentRingNum={currentRingNum} defaultMachine={activeMachine} />
        </>
      )}
    </div>
  );
}
