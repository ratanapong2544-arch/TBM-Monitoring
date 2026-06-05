import React, { useState, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, Activity, Clock } from "lucide-react";

import { GAS_URL } from "./utils/constants";
import { formatDisplayTime, formatDisplayDate } from "./utils/formatters";
import { safeParseJSON, offsetRingNo } from "./utils/helpers";

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
import PerformanceView from "./components/views/PerformanceView";
import DailyReportView from "./components/views/DailyReportView";
import RecordDailyView from "./components/views/RecordDailyView";
import { loadIssues, persistIssues, upsertIssue, setIssueStatus, removeIssue } from "./utils/issues";
import { loadDailyReports, persistDailyReports, upsertDailyReport, removeDailyReport, normalize } from "./utils/dailyReports";
import { apiCall } from "./utils/api";
import { getMachineConfig } from "./utils/machineConfig";

import { Shell, NAV_GROUPS } from "./ui-ux-pro-max";
import "./styles/globals.css";

const PrimaryGroutApp = () => {
  const [currentModule, setCurrentModule] = useState("segment");
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoadingMain, setIsLoadingMain] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [projectInfo, setProjectInfo] = useState({ date: new Date().toISOString().split("T")[0], shift: "Day", location: "อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2", tbmNo: "TBM1" });
  const [activeMachine, setActiveMachine] = useState(() => localStorage.getItem("tbmActiveMachine") || "TBM1");
  useEffect(() => { try { localStorage.setItem("tbmActiveMachine", activeMachine); } catch (e) {} }, [activeMachine]);
  useEffect(() => { setProjectInfo((p) => ({ ...p, ...getMachineConfig(activeMachine) })); }, [activeMachine]);
  const [groutRecords, setGroutRecords] = useState([]);
  const [segmentRecords, setSegmentRecords] = useState([]);
  const [shiftReports, setShiftReports] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);

  const [issues, setIssues] = useState(loadIssues);
  useEffect(() => { persistIssues(issues); }, [issues]);

  const [dailyReports, setDailyReports] = useState(() => normalize(loadDailyReports()));
  const [pendingRecordForm, setPendingRecordForm] = useState(null);
  const handleSaveDailyReport = (report) => { const next = upsertDailyReport(dailyReports, report); setDailyReports(next); persistDailyReports(next); };
  const handleDeleteDailyReport = (id) => { const next = removeDailyReport(dailyReports, id); setDailyReports(next); persistDailyReports(next); };

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

  useEffect(() => {
    const fetchData = async () => {
      if (GAS_URL !== "YOUR_WEB_APP_URL_HERE" && GAS_URL.startsWith("http")) {
        try {
          const response = await fetch(`${GAS_URL}?action=getData`, { redirect: "follow" });
          const textData = await response.text();
          if (textData.trim().startsWith("<")) throw new Error("Received HTML error.");
          const result = JSON.parse(textData);
          if (result.status === "success") {
            const formattedSegments = (result.segments || []).map(r => ({ ...r, excavStartTime: formatDisplayTime(r.excavStartTime), excavEndTime: formatDisplayTime(r.excavEndTime), installStartTime: formatDisplayTime(r.installStartTime), installEndTime: formatDisplayTime(r.installEndTime), startTime: formatDisplayTime(r.startTime), endTime: formatDisplayTime(r.endTime) }));
            setSegmentRecords(formattedSegments);

            const parsePositions = (posStr) => {
              if (typeof posStr === "object" && posStr !== null) return posStr;
              if (!posStr || typeof posStr !== "string") return {};
              try { return JSON.parse(posStr); }
              catch (e) {
                const cleanStr = posStr.replace(/[{}]/g, '').trim();
                const pairs = cleanStr.split(',');
                const res = {};
                pairs.forEach(pair => {
                  let parts = pair.split('=');
                  if (parts.length !== 2) {
                    parts = pair.split(':');
                  }
                  if (parts.length === 2) {
                    const k = parts[0].trim().replace(/['"]/g, '');
                    const v = parts[1].trim().replace(/['"]/g, '').toLowerCase();
                    res[k] = (v === 'true');
                  }
                });
                return res;
              }
            };

            const parsedGrouts = (result.grouts || []).map((g) => {
              const parsedPos = parsePositions(g.positions);
              const primPos = parsePositions(g.primaryPositions);
              const secPos = parsePositions(g.secondaryPositions);

              const partA = g.partA !== undefined && g.partA !== "" ? g.partA : String((Number(g.primaryPartA || 0) + Number(g.secondaryPartA || 0)).toFixed(2));
              const partB = g.partB !== undefined && g.partB !== "" ? g.partB : String((Number(g.primaryPartB || 0) + Number(g.secondaryPartB || 0)).toFixed(2));

              return {
                ...g,
                positions: parsedPos,
                primaryPositions: primPos,
                secondaryPositions: secPos,
                primaryPartA: g.primaryPartA || "",
                primaryPartB: g.primaryPartB || "",
                secondaryPartA: g.secondaryPartA || "",
                secondaryPartB: g.secondaryPartB || "",
                partA: partA,
                partB: partB,
                total: Number(g.total || 0),
                ratio: Number(g.ratio || 0)
              };
            });
            setGroutRecords(parsedGrouts);
            const defaultManpower = { Engineer: '', Operator: '', Surveyor: '', Machanic: '', Electrician: '', Foreman: '', Worker: '', CraneOp: '' };
            const defaultResult = { startSta: '', finishSta: '', numberRing: '', totalDistance: '', progressRate: '' };
            const parsedShiftReports = (result.shiftReports || []).map(sr => ({ ...sr, events: safeParseJSON(sr.events, {}), manpower: safeParseJSON(sr.manpower, defaultManpower), result: safeParseJSON(sr.result, defaultResult) }));
            setShiftReports(parsedShiftReports);
            if (Array.isArray(result.issues)) { setIssues(result.issues); persistIssues(result.issues); }
            
            if (result.planConfig) {
              try {
                const pc = typeof result.planConfig === 'string' ? JSON.parse(result.planConfig) : result.planConfig;
                localStorage.setItem("tbmPlanConfig", JSON.stringify(pc));
              } catch(e) { console.error("Parse planConfig error", e); }
            }
            if (result.distPlanConfig) {
              try {
                const dpc = typeof result.distPlanConfig === 'string' ? JSON.parse(result.distPlanConfig) : result.distPlanConfig;
                localStorage.setItem("tbmDistancePlanConfig", JSON.stringify(dpc));
              } catch(e) { console.error("Parse distPlanConfig error", e); }
            }
          }
        } catch (error) { setLoadError("ไม่สามารถดึงข้อมูลได้: " + error.message); }
      }
      setIsLoadingMain(false);
    };
    fetchData();
  }, []);

  const handleProjectInfoChange = (e) => setProjectInfo({ ...projectInfo, [e.target.name]: e.target.value });

  const handleNavigate = (item) => {
    setActiveTab(item.tab);
    if (item.module) setCurrentModule(item.module);
    setMoreOpen(false);
  };

  const activeSegments     = activeMachine === "TBM1" ? segmentRecords : [];
  const activeGrouts       = activeMachine === "TBM1" ? groutRecords   : [];
  const activeShiftReports = activeMachine === "TBM1" ? shiftReports   : [];
  const activeDailyReports = dailyReports.filter((r) => (r.machine || "TBM1") === activeMachine);

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
    return { text: `เครื่องจักรจอดพัก · รอวง ${offsetRingNo(lastSeg.ringNo, 1)}`, color: "bg-slate-500", icon: <Clock size={12} /> };
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
      issues={issues}
      onSaveIssue={handleSaveIssue}
      onSetIssueStatus={handleSetIssueStatus}
      onDeleteIssue={handleDeleteIssue}
      segmentRecords={segmentRecords}
      groutRecords={groutRecords}
      shiftReports={shiftReports}
      activeMachine={activeMachine}
      onMachineChange={setActiveMachine}
    >
      {loadError && <div className="mb-6 bg-code-d/10 border border-code-d/30 text-code-d p-4 rounded-card text-center no-print font-semibold">{loadError}</div>}
      {activeTab === "overview" && <OverviewView segmentRecords={activeSegments} groutRecords={activeGrouts} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} activeMachine={activeMachine} onMachineChange={setActiveMachine} />}
      {activeTab === "record" && currentModule === "grout" && <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} groutRecords={groutRecords} setGroutRecords={setGroutRecords} segmentRecords={segmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} />}
      {activeTab === "record" && currentModule === "segment" && <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} segmentRecords={segmentRecords} setSegmentRecords={setSegmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} />}
      {activeTab === "dashboard" && <ExecutiveDashboardView segmentRecords={activeSegments} groutRecords={activeGrouts} shiftReports={activeShiftReports} />}
      {activeTab === "analysis" && currentModule === "segment" && <SegmentAnalysisView segmentRecords={activeSegments} projectInfo={projectInfo} />}
      {activeTab === "analysis" && currentModule === "grout" && <GroutAnalysisView groutRecords={activeGrouts} />}
      {activeTab === "analysis" && currentModule === "route" && <RouteScheduleView segmentRecords={activeSegments} projectInfo={projectInfo} />}
      {activeTab === "performance" && <PerformanceView segmentRecords={activeSegments} shiftReports={activeShiftReports} />}
      {activeTab === "datalog" && currentModule === "grout" && <GroutDashboardView groutRecords={groutRecords} setGroutRecords={setGroutRecords} segmentRecords={segmentRecords} />}
      {activeTab === "datalog" && currentModule === "segment" && <SegmentDashboardView segmentRecords={segmentRecords} setSegmentRecords={setSegmentRecords} />}
      {activeTab === "report" && <ReportView segmentRecords={activeSegments} groutRecords={activeGrouts} projectInfo={projectInfo} shiftReports={activeShiftReports} onCreateDaily={(draft) => { setPendingRecordForm(draft); setActiveTab("record_daily"); }} />}
      {activeTab === "shift_report" && <ShiftReportView projectInfo={projectInfo} segmentRecords={segmentRecords} shiftReports={shiftReports} setShiftReports={setShiftReports} />}
      {activeTab === "record_daily" && <RecordDailyView dailyReports={activeDailyReports} onSave={(form) => { handleSaveDailyReport(form); setActiveTab("daily_report"); }} pendingForm={pendingRecordForm} onConsumePendingForm={() => setPendingRecordForm(null)} activeMachine={activeMachine} />}
      {activeTab === "daily_report" && <DailyReportView dailyReports={activeDailyReports} onDelete={handleDeleteDailyReport} onEdit={(formReady) => { setPendingRecordForm(formReady); setActiveTab("record_daily"); }} onGoRecord={() => setActiveTab("record_daily")} />}
    </Shell>
  );
};

export default PrimaryGroutApp;
