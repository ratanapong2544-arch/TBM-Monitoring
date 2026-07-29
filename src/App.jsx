import React, { useState, useEffect, useMemo, useRef } from "react";
import { Loader2, AlertCircle, Activity, Clock } from "lucide-react";

import { GAS_URL } from "./utils/constants";
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
import { normalizeServerData } from "./offline/normalizeServerData";

import { Shell, NAV_GROUPS } from "./ui-ux-pro-max";
import "./styles/globals.css";

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
  const [machineProgress, setMachineProgress] = useState(null);
  const [routeProjectTotal, setRouteProjectTotal] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const reqSeqRef = useRef(0); // S5: กัน fetch race (response เครื่องเก่าทับ state เครื่องใหม่)

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

  useEffect(() => {
    const seq = ++reqSeqRef.current; // S5: token ของ request นี้
    setSegmentRecords([]); setGroutRecords([]); setSecondaryGroutRecords([]); setShiftReports([]);
    const fetchData = async () => {
      if (GAS_URL !== "YOUR_WEB_APP_URL_HERE" && GAS_URL.startsWith("http")) {
        try {
          const response = await fetch(`${GAS_URL}?action=getData&machine=${activeMachine}`, { redirect: "follow" });
          const textData = await response.text();
          if (reqSeqRef.current !== seq) return; // สลับเครื่องไปแล้ว → ทิ้ง response เก่า (กัน race)
          if (textData.trim().startsWith("<")) throw new Error("Received HTML error.");
          const result = JSON.parse(textData);
          if (result.status === "success") {
            const data = normalizeServerData(result, activeMachine);
            setSegmentRecords(data.segments);
            setGroutRecords(data.grouts);

            // F1: secondary grout (dataset แยก) — parse positions เหมือน primary, ไม่มี ratio
            setSecondaryGroutRecords(data.secondaryGrouts);

            setShiftReports(data.shiftReports);
            if (Array.isArray(result.issues)) { setIssues(data.issues); persistIssues(data.issues); }
            if (Array.isArray(result.dailyReports) && result.dailyReports.length) { setDailyReports(data.dailyReports); persistDailyReports(data.dailyReports); }
            if (Array.isArray(result.prepTasks) && result.prepTasks.length) {
              const byM = {};
              data.prepTasks.forEach((t) => { const m = t.machine || "TBM1"; (byM[m] = byM[m] || []).push(t); });
              Object.keys(byM).forEach((m) => savePrepTasks(m, byM[m]));
            }
            
            if (data.planConfig) {
              try {
                localStorage.setItem("tbmPlanConfig", JSON.stringify(data.planConfig));
              } catch(e) { console.error("Parse planConfig error", e); }
            }
            if (data.distPlanConfig) {
              try {
                localStorage.setItem("tbmDistancePlanConfig", JSON.stringify(data.distPlanConfig));
              } catch(e) { console.error("Parse distPlanConfig error", e); }
            }
            // F3: route configs (ทั้ง 2 เครื่อง) → localStorage เพื่อให้ RouteScheduleView โหลด; progress/total → state
            if (data.routeConfigs && typeof data.routeConfigs === "object") {
              try {
                if (data.routeConfigs.TBM1) localStorage.setItem("tbmRouteConfig", JSON.stringify(data.routeConfigs.TBM1));
                if (data.routeConfigs.TBM2) localStorage.setItem("tbmRouteConfig__TBM2", JSON.stringify(data.routeConfigs.TBM2));
              } catch (e) { /* ignore */ }
            }
            setMachineProgress(data.machineProgress);
            setRouteProjectTotal(data.routeProjectTotal);
            // Instrument module: project-wide (ไม่ขึ้นกับ activeMachine) → set เสมอเมื่อ GAS ส่งมา
            if (Array.isArray(result.instLocations))   { setInstLocations(data.instLocations); persistCache(STORE.locations, data.instLocations); }
            if (Array.isArray(result.instInstruments)) { setInstInstruments(data.instInstruments); persistCache(STORE.instruments, data.instInstruments); }
            if (Array.isArray(result.instThresholds))  { setInstThresholds(data.instThresholds); persistCache(STORE.thresholds, data.instThresholds); }
            if (Array.isArray(result.instReadings))    { setInstReadings(data.instReadings); persistCache(STORE.readings, data.instReadings); }
            if (Array.isArray(result.instSchedules))   { setInstSchedules(data.instSchedules); persistCache(STORE.schedules, data.instSchedules); }
          }
        } catch (error) { setLoadError("ไม่สามารถดึงข้อมูลได้: " + error.message); }
      }
      setIsLoadingMain(false);
    };
    fetchData();
  }, [activeMachine]);

  const handleProjectInfoChange = (e) => setProjectInfo({ ...projectInfo, [e.target.name]: e.target.value });

  const handleNavigate = (item) => {
    setActiveTab(item.tab);
    if (item.module) setCurrentModule(item.module);
    setMoreOpen(false);
  };

  const activeSegments     = segmentRecords;
  const currentRingNum = activeSegments.reduce((mx, s) => Math.max(mx, getRingNumeric(s.ringNo) || 0), 0);
  const activeGrouts       = groutRecords;
  const activeSecondaryGrouts = secondaryGroutRecords;
  const activeShiftReports = shiftReports;
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
      segmentRecords={segmentRecords}
      groutRecords={groutRecords}
      shiftReports={shiftReports}
      activeMachine={activeMachine}
      onMachineChange={setActiveMachine}
      currentRingNum={currentRingNum}
      globalFilter={dashFilter}
      isViewer={isViewer}
    >
      {loadError && <div className="mb-6 bg-code-d/10 border border-code-d/30 text-code-d p-4 rounded-card text-center no-print font-semibold">{loadError}</div>}
      {activeTab === "overview" && <OverviewView segmentRecords={activeSegments} groutRecords={activeGrouts} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} activeMachine={activeMachine} onMachineChange={setActiveMachine} />}
      {activeTab === "record" && currentModule === "grout" && <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} groutRecords={groutRecords} setGroutRecords={setGroutRecords} secondaryGroutRecords={secondaryGroutRecords} setSecondaryGroutRecords={setSecondaryGroutRecords} segmentRecords={segmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} machine={activeMachine} />}
      {activeTab === "record" && currentModule === "segment" && <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} segmentRecords={segmentRecords} setSegmentRecords={setSegmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} machine={activeMachine} />}
      {activeTab === "dashboard" && <ExecutiveDashboardView segmentRecords={activeSegments} groutRecords={activeGrouts} shiftReports={activeShiftReports} dailyReports={activeDailyReports} machine={activeMachine} onNavigate={handleNavigate} filterState={dashFilter.state} readOnly={isViewer} />}
      {activeTab === "analysis" && currentModule === "segment" && <SegmentAnalysisView segmentRecords={activeSegments} projectInfo={projectInfo} machine={activeMachine} filterState={dashFilter.state} readOnly={isViewer} />}
      {activeTab === "analysis" && currentModule === "grout" && <GroutAnalysisView groutRecords={activeGrouts} secondaryGroutRecords={activeSecondaryGrouts} readOnly={isViewer} />}
      {activeTab === "analysis" && currentModule === "route" && <RouteScheduleView segmentRecords={activeSegments} projectInfo={projectInfo} machine={activeMachine} machineProgress={machineProgress} routeProjectTotal={routeProjectTotal} filterState={dashFilter.state} readOnly={isViewer} />}
      {activeTab === "head_level" && <HeadLevelView segmentRecords={activeSegments} machine={activeMachine} readOnly={isViewer} />}
      {activeTab === "performance" && <PerformanceView segmentRecords={activeSegments} shiftReports={activeShiftReports} filterState={dashFilter.state} />}
      {activeTab === "prep_gantt" && <PrepGanttView machine={activeMachine} readOnly={isViewer} />}
      {activeTab === "datalog" && currentModule === "grout" && <GroutDashboardView groutRecords={groutRecords} setGroutRecords={setGroutRecords} secondaryGroutRecords={secondaryGroutRecords} setSecondaryGroutRecords={setSecondaryGroutRecords} segmentRecords={segmentRecords} machine={activeMachine} readOnly={isViewer} />}
      {activeTab === "datalog" && currentModule === "segment" && <SegmentDashboardView segmentRecords={segmentRecords} setSegmentRecords={setSegmentRecords} machine={activeMachine} />}
      {activeTab === "report" && <ReportView segmentRecords={activeSegments} groutRecords={activeGrouts} projectInfo={projectInfo} shiftReports={activeShiftReports} onCreateDaily={(draft) => { setPendingRecordForm(draft); setActiveTab("record_daily"); }} />}
      {activeTab === "shift_report" && <ShiftReportView projectInfo={projectInfo} segmentRecords={segmentRecords} shiftReports={shiftReports} setShiftReports={setShiftReports} machine={activeMachine} readOnly={isViewer} />}
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
