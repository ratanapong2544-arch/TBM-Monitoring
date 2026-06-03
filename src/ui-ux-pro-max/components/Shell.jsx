import React, { useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import MoreSheet from "./MoreSheet";
import { NAV_GROUPS, MOBILE_PRIMARY } from "./navModel";
import IssuesRail from "../../components/issues/IssuesRail";
import IssuesSheet from "../../components/issues/IssuesSheet";
import IssuesBell from "../../components/issues/IssuesBell";
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
  children,
}) {
  const showIssues = ISSUE_TABS.includes(active.tab);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modal, setModal] = useState({ open: false, editing: null });

  const openAdd = () => { setSheetOpen(false); setModal({ open: true, editing: null }); };
  const openEdit = (issue) => { setSheetOpen(false); setModal({ open: true, editing: issue }); };
  const submitIssue = (form) => { onSaveIssue(form); setModal({ open: false, editing: null }); };
  const closeIssue = (id) => onSetIssueStatus(id, "closed");
  const reopenIssue = (id) => onSetIssueStatus(id, "open");

  const railProps = {
    issues,
    onAdd: openAdd,
    onEdit: openEdit,
    onCloseIssue: closeIssue,
    onReopenIssue: reopenIssue,
    onDeleteIssue,
  };

  return (
    <div className="flex min-h-screen bg-surface-page font-sans">
      <Sidebar active={active} onNavigate={onNavigate} liveStatus={liveStatus} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={title}
          liveStatus={liveStatus}
          projectInfo={projectInfo}
          onProjectChange={onProjectChange}
          compact={false}
          rightSlot={showIssues ? <IssuesBell count={openCount(issues)} onClick={() => setSheetOpen(true)} /> : null}
        />

        <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
          {showIssues ? (
            <div className="flex max-w-[1280px] mx-auto print:max-w-none print:mx-0">
              <div className="flex-1 min-w-0 px-4 sm:px-6 py-6 w-full print:p-0 print:m-0">{children}</div>
              <IssuesRail {...railProps} />
            </div>
          ) : (
            <div className="px-4 sm:px-6 py-6 w-full print:p-0 print:m-0">{children}</div>
          )}
        </main>
      </div>

      <BottomNav items={MOBILE_ITEMS} activeTab={active.tab} onNavigate={onNavigate} onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onNavigate={onNavigate} />

      {showIssues && (
        <>
          <IssuesSheet open={sheetOpen} onDismiss={() => setSheetOpen(false)} {...railProps} />
          <IssueFormModal open={modal.open} initial={modal.editing} onSubmit={submitIssue} onClose={() => setModal({ open: false, editing: null })} />
        </>
      )}
    </div>
  );
}
