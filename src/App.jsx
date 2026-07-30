import React, { useState, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, Activity, Clock } from "lucide-react";

import { formatDisplayDate } from "./utils/formatters";
import { offsetRingNo, getRingNumeric } from "./utils/helpers";

import OverviewView from "./components/views/OverviewView";
import GroutRecordView from "./components/views/GroutRecordView";
import SegmentRecordView from "./components/views/SegmentRecordView";
import GroutDashboardView from "./components/views/GroutDashboardView";
import SegmentDashboardView from "./components/views/SegmentDashboardView";
import ExecutiveDashboardView from "./components/views/ExecutiveDashboardView";
import ReportView from "./components/views/ReportView";
import ShiftReportView from "./components/views/ShiftReportView";
import SegmentAnalysisView from "./components/views/SegmentAnalysisView";
import GroutAnalysisView from "./components/views/GroutAnalysisView";
import RouteScheduleView from "./components/views/RouteScheduleView";
import HeadLevelView from "./components/views/HeadLevelView";
import PerformanceView from "./components/views/PerformanceView";
import DailyReportView from "./components/views/DailyReportView";
import RecordDailyView from "./components/views/RecordDailyView";
import PrepGanttView from "./components/views/PrepGanttView";
import InstrumentDashboardView from "./components/views/InstrumentDashboardView";
import InstrumentLocationView from "./components/views/InstrumentLocationView";
import InstrumentScheduleView from "./components/views/InstrumentScheduleView";
import { STORE, loadCache, persistCache, makeInstId } from "./utils/instruments";
import { markMeasurementDone, markMeasurementNA, cancelMeasurement } from "./utils/instrumentSchedule";
import { useFilterState } from "./hooks/useGlobalFilter";
import { loadIssues, persistIssues, upsertIssue, setIssueStatus, removeIssue, forMachine } from "./utils/issues";
import { loadDailyReports, persistDailyReports, upsertDailyReport, removeDailyReport, normalize } from "./utils/dailyReports";
import { apiCall } from "./utils/api";
import { getMachineConfig } from "./utils/machineConfig";
import { savePrepTasks } from "./utils/prepGantt";
import { isViewerMode, VIEWER_TABS } from "./utils/viewerMode";
import { useOfflineData } from "./offline/useOfflineData";

import { Shell, NAV_GROUPS } from "./ui-ux-pro-max";
import "./styles/globals.css";

// stable empty array so the machine-switch gate does not remount every consumer each render
const EMPTY_ROWS = [];

const PrimaryGroutApp = () => {
  const [currentModule, setCurrentModule] = useState("segment");
  const [activeTab, setActiveTab] = useState(() => (isViewerMode() ? "dashboard" : "overview"));
  const [isLoadingMain, setIsLoadingMain] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [projectInfo, setProjectInfo] = useState({ date: new Date().toISOString().split("T")[0], shift: "Day", location: "อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2", tbmNo: "TBM1" });
  const [activeMachine, setActiveMachine] = useState(() => localStorage.getItem("tbmActiveMachine") || "TBM1");
  const isViewer = isViewerMode();
  useEffect(() => { try { localStorage.setItem("tbmActiveMachine", activeMachine); } catch (e) {} }, [activeMachine]);
  useEffect(() => { setProjectInfo((p) => ({ ...p, ...getMachineConfig(activeMachine) })); }, [activeMachine]);
  const [groutRecords, setGroutRecords] = useState([]);
  const [secondaryGroutRecords, setSecondaryGroutRecords] = useState([]);
  const [segmentRecords, setSegmentRecords] = useState([]);
  const [shiftReports, setShiftReports] = useState([]);
  // which machine the machine-scoped rows above currently hold (null until the first snapshot lands)
  const [rowsMachine, setRowsMachine] = useState(null);
  const [machineProgress, setMachineProgress] = useState(null);
  const [routeProjectTotal, setRouteProjectTotal] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const [instLocations, setInstLocations] = useState(() => loadCache(STORE.locations));
  const [instInstruments, setInstInstruments] = useState(() => loadCache(STORE.instruments));
  const [instThresholds, setInstThresholds] = useState(() => loadCache(STORE.thresholds));
  const [instReadings, setInstReadings] = useState(() => loadCache(STORE.readings));
  const [instSchedules, setInstSchedules] = useState(() => loadCache(STORE.schedules));
  const [selectedInstLocId, setSelectedInstLocId] = useState(null);

  const [issues, setIssues] = useState(loadIssues);
  useEffect(() => { persistIssues(issues); }, [issues]);
  useEffect(() => {
    if (isViewer && !VIEWER_TABS.includes(activeTab)) setActiveTab("dashboard");
  }, [isViewer, activeTab]);

  const [dailyReports, setDailyReports] = useState(() => normalize(loadDailyReports()));
  const [pendingRecordForm, setPendingRecordForm] = useState(null);
  const handleSaveDailyReport = (report) => {
    const next = upsertDailyReport(dailyReports, report);
    setDailyReports(next); persistDailyReports(next);
    const saved = report.id ? next.find((r) => r.id === report.id) : next.find((r) => !dailyReports.some((o) => o.id === r.id));
    if (saved) apiCall("saveDailyReport", { ...saved, machine: saved.machine || activeMachine }).catch((e) => console.warn("DailyReport sync (save) failed — kept locally:", e.message));
  };
  const handleDeleteDailyReport = (id) => {
    const next = removeDailyReport(dailyReports, id); setDailyReports(next); persistDailyReports(next);
    apiCall("deleteDailyReport", { id }).catch((e) => console.warn("DailyReport sync (delete) failed — kept locally:", e.message));
  };

  const syncIssueToServer = (issue) => {
    apiCall("saveIssue", issue).catch((e) => console.warn("Issue sync (save) failed — kept locally:", e.message));
  };

  const handleSaveIssue = (form) => {
    const next = upsertIssue(issues, form);
    setIssues(next);
    const saved = form.id ? next.find((i) => i.id === form.id) : next[0];
    if (saved) syncIssueToServer(saved);
  };
  const handleSetIssueStatus = (id, status) => {
    const next = setIssueStatus(issues, id, status);
    setIssues(next);
    const changed = next.find((i) => i.id === id);
    if (changed) syncIssueToServer(changed);
  };
  const handleDeleteIssue = (id) => {
    setIssues(removeIssue(issues, id));
    apiCall("deleteIssue", { id }).catch((e) => console.warn("Issue sync (delete) failed — kept locally:", e.message));
  };

  const handleSaveInstReading = (reading) => {
    const row = reading.id ? reading : { ...reading, id: makeInstId("rd"), enteredBy: "manual" };
    const next = reading.id ? instReadings.map((r) => (r.id === row.id ? row : r)) : [row, ...instReadings];
    setInstReadings(next); persistCache(STORE.readings, next);
    apiCall(reading.id ? "updateInstReading" : "addInstReading", row).catch((e) => console.warn("inst reading sync:", e.message));
  };
  // kind: "done" | "na" | "cancel" — default "done" เพื่อไม่ break v1 schedule view ที่เรียก
  // onMark({ ...s, isMeasured:true, measuredAt: today() }) แบบ 1 argument (toggle done เดิม)
  // R3 จะเพิ่ม modal เลือก done/NA/date เอง แล้วส่ง kind + measuredAtISO มาตรงๆ
  const handleMarkInstSchedule = (sched, kind = "done", measuredAtISO) => {
    const { next, changed } =
      kind === "na" ? markMeasurementNA(instSchedules, sched.id) :
      kind === "cancel" ? cancelMeasurement(instSchedules, sched.id) :
      markMeasurementDone(instSchedules, sched.id, measuredAtISO ?? sched.measuredAt);
    setInstSchedules(next); persistCache(STORE.schedules, next);
    changed.forEach((row) => {
      apiCall("saveInstSchedule", row).catch((e) => console.warn("inst schedule sync:", e.message));
    });
  };
  const handleUpdateInstrument = (ins) => {
    const next = instInstruments.map((i) => (i.id === ins.id ? ins : i));
    setInstInstruments(next); persistCache(STORE.instruments, next);
    apiCall("updateInstrument", ins).catch((e) => console.warn("inst update sync:", e.message));
  };

  // Offline-first hydration: the cached snapshot renders immediately, then the server refresh
  // replaces it. The repository owns the fetch, the race guard and the stale flag, so this effect
  // only mirrors `data` into the existing state contracts (write migration lands in Tasks 8-9).
  const offlineData = useOfflineData(activeMachine);

  useEffect(() => {
    const data = offlineData.data;
    if (!data || data.machine !== activeMachine) return;
    setSegmentRecords(data.segments);
    setGroutRecords(data.grouts);
    // F1: secondary grout (dataset แยก) — normalizer parse positions เหมือน primary, ไม่มี ratio
    setSecondaryGroutRecords(data.secondaryGrouts);
    setShiftReports(data.shiftReports);
    // the rows on screen now belong to this machine (see rowsReady below)
    setRowsMachine(activeMachine);
    // The localStorage-primary collections (issues, dailyReports, prepTasks, inst*, configs) are
    // only ever touched by a LIVE SERVER response. Two reasons, both proven to lose field data:
    //   1. an IndexedDB read always succeeds offline, and writes do not reach the queue until
    //      Tasks 8-9, so an offline-created record exists only in localStorage. Putting a cached
    //      snapshot into state is enough to destroy it, because state is what gets persisted —
    //      `useEffect(() => persistIssues(issues), [issues])` above, and every save handler
    //      rebuilds its next list from state.
    //   2. normalizeServerData maps an absent key to [], so an older GAS deployment or a partial
    //      doGet looks exactly like a real deletion. An empty collection is never written through;
    //      propagating a server-side deletion of the last record is Task 9's reconciliation job,
    //      which can compare both sides. Losing a field record outranks showing a stale one.
    // These collections are already seeded from localStorage at mount, so skipping a cache read
    // costs nothing.
    const serverAuthoritative = offlineData.source === "server";
    if (serverAuthoritative) {
      if (data.issues.length) { setIssues(data.issues); persistIssues(data.issues); }
      if (data.dailyReports.length) { setDailyReports(data.dailyReports); persistDailyReports(data.dailyReports); }
      if (data.prepTasks.length) {
        const byM = {};
        data.prepTasks.forEach((t) => { const m = t.machine || "TBM1"; (byM[m] = byM[m] || []).push(t); });
        // only machines the payload actually carries: a machine absent from it keeps its local tasks
        Object.keys(byM).forEach((m) => savePrepTasks(m, byM[m]));
      }
    }

    // configs are localStorage-primary too: an offline plan or route edit lives only there until
    // Tasks 8-9, so a cache read must not write over it
    if (serverAuthoritative) {
      if (data.planConfig) {
        try { localStorage.setItem("tbmPlanConfig", JSON.stringify(data.planConfig)); } catch (e) { console.error("Parse planConfig error", e); }
      }
      if (data.distPlanConfig) {
        try { localStorage.setItem("tbmDistancePlanConfig", JSON.stringify(data.distPlanConfig)); } catch (e) { console.error("Parse distPlanConfig error", e); }
      }
      // F3: route configs (ทั้ง 2 เครื่อง) → localStorage เพื่อให้ RouteScheduleView โหลด
      if (data.routeConfigs && typeof data.routeConfigs === "object") {
        try {
          if (data.routeConfigs.TBM1) localStorage.setItem("tbmRouteConfig", JSON.stringify(data.routeConfigs.TBM1));
          if (data.routeConfigs.TBM2) localStorage.setItem("tbmRouteConfig__TBM2", JSON.stringify(data.routeConfigs.TBM2));
        } catch (e) { /* ignore */ }
      }
    }
    if (data.machineProgress) setMachineProgress(data.machineProgress);
    if (data.routeProjectTotal != null) setRouteProjectTotal(data.routeProjectTotal);
    // Instrument module: project-wide (ไม่ขึ้นกับ activeMachine). Server-only, same rule as above.
    const mirrorInst = (rows, setter, store) => {
      if (!serverAuthoritative || !rows.length) return;
      setter(rows);
      persistCache(store, rows);
    };
    mirrorInst(data.instLocations, setInstLocations, STORE.locations);
    mirrorInst(data.instInstruments, setInstInstruments, STORE.instruments);
    mirrorInst(data.instThresholds, setInstThresholds, STORE.thresholds);
    mirrorInst(data.instReadings, setInstReadings, STORE.readings);
    mirrorInst(data.instSchedules, setInstSchedules, STORE.schedules);
  }, [offlineData.data, offlineData.source, activeMachine]);

  useEffect(() => {
    setIsLoadingMain(offlineData.loading);
    // Only block the app with an error when there is nothing to show. With cached data on screen a
    // failed refresh is the normal offline case and must not raise a full-width red banner.
    const hasData = offlineData.source !== "empty";
    setLoadError(offlineData.error && !hasData ? "ไม่สามารถดึงข้อมูลได้: " + offlineData.error.message : null);
  }, [offlineData.loading, offlineData.error, offlineData.source]);

  const handleProjectInfoChange = (e) => setProjectInfo({ ...projectInfo, [e.target.name]: e.target.value });

  const handleNavigate = (item) => {
    setActiveTab(item.tab);
    if (item.module) setCurrentModule(item.module);
    setMoreOpen(false);
  };

  // Machine-scoped rows are only exposed once they belong to the selected machine. Between a switch
  // and the new machine's snapshot resolving, the state still holds the previous machine's rows;
  // showing those under the new machine's label also let the record form prefill the next ring
  // number and chainage from the wrong machine's last ring.
  const rowsReady = rowsMachine === activeMachine;
  const activeSegments     = rowsReady ? segmentRecords : EMPTY_ROWS;
  const currentRingNum = activeSegments.reduce((mx, s) => Math.max(mx, getRingNumeric(s.ringNo) || 0), 0);
  const activeGrouts       = rowsReady ? groutRecords : EMPTY_ROWS;
  const activeSecondaryGrouts = rowsReady ? secondaryGroutRecords : EMPTY_ROWS;
  const activeShiftReports = rowsReady ? shiftReports : EMPTY_ROWS;
  const activeDailyReports = dailyReports.filter((r) => (r.machine || "TBM1") === activeMachine);
  const activeIssues = forMachine(issues, activeMachine);
  const dashFilter = useFilterState();

  const liveHeaderStatus = useMemo(() => {
    if (activeSegments.length === 0) return null;
    const map = new Map();
    activeSegments.forEach(rec => map.set(rec.ringNo, rec));
    const deduped = Array.from(map.values());
    const lastSeg = deduped[deduped.length - 1];

    if (lastSeg.status === "In Progress") {
      if (lastSeg.excavStartTime && !lastSeg.excavEndTime) return { text: `กำลังขุดเจาะ ${lastSeg.ringNo}`, color: "bg-amber-500", icon: <AlertCircle size={12} /> };
      if (lastSeg.excavEndTime && !lastSeg.installStartTime) return { text: `ขุดเสร็จ รอประกอบ ${lastSeg.ringNo}`, color: "bg-slate-500", icon: <Clock size={12} /> };
      if (lastSeg.installStartTime && !lastSeg.installEndTime) return { text: `กำลังประกอบ ${lastSeg.ringNo}`, color: "bg-emerald-500", icon: <Activity size={12} /> };
      return { text: `กำลังทำงาน ${lastSeg.ringNo}`, color: "bg-blue-500", icon: <Activity size={12} /> };
    }
    return { text: `เครื่องจักรจอดพัก · รอ ring ${offsetRingNo(lastSeg.ringNo, 1)}`, color: "bg-slate-500", icon: <Clock size={12} /> };
  }, [activeSegments]);

  // Derive page title from NAV_GROUPS based on activeTab + currentModule
  const pageTitle = useMemo(() => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.tab === activeTab && (item.module ? item.module === currentModule : !item.module || true)) {
          // Prefer exact module match when tab has module items
          if (item.module && item.module !== currentModule) continue;
          return item.label;
        }
      }
    }
    return `${activeMachine} Monitoring`;
  }, [activeTab, currentModule, activeMachine]);

  // Map liveHeaderStatus { text, color, icon } → Badge shape { code, label }
  const shellLiveStatus = useMemo(() => {
    if (!liveHeaderStatus) return null;
    const colorCodeMap = {
      "bg-amber-500": "b",
      "bg-slate-500": "neutral",
      "bg-emerald-500": "a",
      "bg-blue-500": "info",
    };
    return {
      code: colorCodeMap[liveHeaderStatus.color] || "neutral",
      label: liveHeaderStatus.text,
    };
  }, [liveHeaderStatus]);

  // Non-blocking snapshot state (design §7: keep the local snapshot visible and warn that it is
  // stale rather than blocking). Task 10 replaces this strip with the full Sync Center.
  const offlineNotice = useMemo(() => {
    // The rows for this machine are not on screen yet (first launch, or a machine switch whose
    // snapshot is still loading). Step 4 requires a `refreshing` signal here: the lists are empty
    // because we refuse to show another machine's rings, so say so rather than look like no data.
    if (!rowsReady) return { text: "กำลังโหลดข้อมูลของเครื่องนี้…", spinning: true };
    if (offlineData.refreshing) return { text: "กำลังอัปเดตข้อมูลจากเซิร์ฟเวอร์…", spinning: true };
    if (offlineData.cacheError) {
      return { text: "ข้อมูลล่าสุดแสดงอยู่ แต่บันทึกลงเครื่องไม่ได้ — ปิดแอพแล้วข้อมูลจะไม่อยู่", spinning: false };
    }
    if (offlineData.stale && offlineData.source !== "empty") {
      const at = offlineData.fetchedAt ? formatDisplayDate(offlineData.fetchedAt) : null;
      const saved = at ? `แสดงข้อมูลที่บันทึกไว้ (${at})` : "แสดงข้อมูลที่บันทึกไว้";
      // Only claim the device is offline when it is. A permission page, an HTTP 4xx or malformed
      // JSON all fail while online, and their diagnostic code belongs on screen.
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline) return { text: `ออฟไลน์ — ${saved}`, spinning: false };
      const code = offlineData.error && offlineData.error.code ? ` (${offlineData.error.code})` : "";
      return { text: `เชื่อมต่อเซิร์ฟเวอร์ไม่ได้${code} — ${saved}`, spinning: false };
    }
    return null;
  }, [rowsReady, offlineData.refreshing, offlineData.stale, offlineData.source, offlineData.fetchedAt, offlineData.cacheError, offlineData.error]);

  if (isLoadingMain) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-page font-sans">
      <Loader2 className="animate-spin w-12 h-12 mb-5 text-navy" />
      <div className="font-black text-navy text-lg tracking-tight">Connecting to Server...</div>
      <p className="text-ink-3 text-sm mt-2 font-medium">กำลังเตรียมข้อมูล TBM System</p>
    </div>
  );

  return (
    <Shell
      active={{ tab: activeTab, module: currentModule }}
      onNavigate={handleNavigate}
      title={pageTitle}
      liveStatus={shellLiveStatus}
      projectInfo={projectInfo}
      onProjectChange={handleProjectInfoChange}
      moreOpen={moreOpen}
      setMoreOpen={setMoreOpen}
      issues={activeIssues}
      onSaveIssue={handleSaveIssue}
      onSetIssueStatus={handleSetIssueStatus}
      onDeleteIssue={handleDeleteIssue}
      segmentRecords={activeSegments}
      groutRecords={activeGrouts}
      shiftReports={activeShiftReports}
      activeMachine={activeMachine}
      onMachineChange={setActiveMachine}
      currentRingNum={currentRingNum}
      globalFilter={dashFilter}
      isViewer={isViewer}
    >
      {loadError && <div className="mb-6 bg-code-d/10 border border-code-d/30 text-code-d p-4 rounded-card text-center no-print font-semibold">{loadError}</div>}
      {!loadError && offlineNotice && (
        <div className="mb-4 flex items-center justify-center gap-2 bg-code-b/10 border border-code-b/30 text-code-b px-4 py-2 rounded-card text-[13px] no-print font-semibold">
          {offlineNotice.spinning ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
          <span>{offlineNotice.text}</span>
        </div>
      )}
      {activeTab === "overview" && <OverviewView segmentRecords={activeSegments} groutRecords={activeGrouts} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} activeMachine={activeMachine} onMachineChange={setActiveMachine} />}
      {activeTab === "record" && currentModule === "grout" && <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} groutRecords={activeGrouts} setGroutRecords={setGroutRecords} secondaryGroutRecords={activeSecondaryGrouts} setSecondaryGroutRecords={setSecondaryGroutRecords} segmentRecords={activeSegments} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} machine={activeMachine} />}
      {activeTab === "record" && currentModule === "segment" && <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} segmentRecords={activeSegments} setSegmentRecords={setSegmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} machine={activeMachine} />}
      {activeTab === "dashboard" && <ExecutiveDashboardView segmentRecords={activeSegments} groutRecords={activeGrouts} shiftReports={activeShiftReports} dailyReports={activeDailyReports} machine={activeMachine} onNavigate={handleNavigate} filterState={dashFilter.state} readOnly={isViewer} />}
      {activeTab === "analysis" && currentModule === "segment" && <SegmentAnalysisView segmentRecords={activeSegments} projectInfo={projectInfo} machine={activeMachine} filterState={dashFilter.state} readOnly={isViewer} />}
      {activeTab === "analysis" && currentModule === "grout" && <GroutAnalysisView groutRecords={activeGrouts} secondaryGroutRecords={activeSecondaryGrouts} readOnly={isViewer} />}
      {activeTab === "analysis" && currentModule === "route" && <RouteScheduleView segmentRecords={activeSegments} projectInfo={projectInfo} machine={activeMachine} machineProgress={machineProgress} routeProjectTotal={routeProjectTotal} filterState={dashFilter.state} readOnly={isViewer} />}
      {activeTab === "head_level" && <HeadLevelView segmentRecords={activeSegments} machine={activeMachine} readOnly={isViewer} />}
      {activeTab === "performance" && <PerformanceView segmentRecords={activeSegments} shiftReports={activeShiftReports} filterState={dashFilter.state} />}
      {activeTab === "prep_gantt" && <PrepGanttView machine={activeMachine} readOnly={isViewer} />}
      {activeTab === "datalog" && currentModule === "grout" && <GroutDashboardView groutRecords={activeGrouts} setGroutRecords={setGroutRecords} secondaryGroutRecords={activeSecondaryGrouts} setSecondaryGroutRecords={setSecondaryGroutRecords} segmentRecords={activeSegments} machine={activeMachine} readOnly={isViewer} />}
      {activeTab === "datalog" && currentModule === "segment" && <SegmentDashboardView segmentRecords={activeSegments} setSegmentRecords={setSegmentRecords} machine={activeMachine} />}
      {activeTab === "report" && <ReportView segmentRecords={activeSegments} groutRecords={activeGrouts} projectInfo={projectInfo} shiftReports={activeShiftReports} onCreateDaily={(draft) => { setPendingRecordForm(draft); setActiveTab("record_daily"); }} />}
      {activeTab === "shift_report" && <ShiftReportView projectInfo={projectInfo} segmentRecords={activeSegments} shiftReports={activeShiftReports} setShiftReports={setShiftReports} machine={activeMachine} readOnly={isViewer} />}
      {activeTab === "record_daily" && <RecordDailyView dailyReports={activeDailyReports} onSave={(form) => { handleSaveDailyReport(form); setActiveTab("daily_report"); }} pendingForm={pendingRecordForm} onConsumePendingForm={() => setPendingRecordForm(null)} activeMachine={activeMachine} />}
      {activeTab === "daily_report" && <DailyReportView dailyReports={activeDailyReports} onDelete={handleDeleteDailyReport} onEdit={(formReady) => { setPendingRecordForm(formReady); setActiveTab("record_daily"); }} onGoRecord={() => setActiveTab("record_daily")} />}
      {activeTab === "inst_dashboard" && (
        <InstrumentDashboardView
          locations={instLocations} instruments={instInstruments} schedules={instSchedules}
          machineProgress={machineProgress} activeMachine={activeMachine}
          onOpenLocation={(id) => { setSelectedInstLocId(id); setActiveTab("inst_location"); }}
          onMark={isViewer ? null : handleMarkInstSchedule}
          readOnly={isViewer} />
      )}
      {activeTab === "inst_location" && (
        <InstrumentLocationView
          location={instLocations.find((l) => String(l.id) === String(selectedInstLocId)) || null}
          instruments={instInstruments.filter((i) => String(i.locationId) === String(selectedInstLocId))}
          allInstruments={instInstruments}
          readings={instReadings} thresholds={instThresholds}
          schedules={instSchedules} machineProgress={machineProgress} activeMachine={activeMachine}
          onMark={isViewer ? null : handleMarkInstSchedule}
          onBack={() => setActiveTab("inst_dashboard")} readOnly={isViewer} />
      )}
      {activeTab === "inst_schedule" && (
        <InstrumentScheduleView
          schedules={instSchedules} locations={instLocations} machineProgress={machineProgress} activeMachine={activeMachine}
          onMark={isViewer ? null : handleMarkInstSchedule} readOnly={isViewer} />
      )}
    </Shell>
  );
};

export default PrimaryGroutApp;
