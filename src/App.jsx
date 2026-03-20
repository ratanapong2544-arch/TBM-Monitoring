import React, { useState, useEffect, useMemo } from "react";
import { Layers, MapPin, Home, PlusCircle, LayoutDashboard, Clock, FileText, Loader2, AlertCircle, Activity } from "lucide-react";

import { GAS_URL } from "./utils/constants";
import { formatDisplayTime, formatDisplayDate } from "./utils/formatters";
import { safeParseJSON } from "./utils/helpers";

import OverviewView from "./components/views/OverviewView";
import GroutRecordView from "./components/views/GroutRecordView";
import SegmentRecordView from "./components/views/SegmentRecordView";
import GroutDashboardView from "./components/views/GroutDashboardView";
import SegmentDashboardView from "./components/views/SegmentDashboardView";
import ReportView from "./components/views/ReportView";
import ShiftReportView from "./components/views/ShiftReportView";

import "./styles/globals.css";

const PrimaryGroutApp = () => {
  const [currentModule, setCurrentModule] = useState("segment");
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoadingMain, setIsLoadingMain] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [projectInfo, setProjectInfo] = useState({ date: new Date().toISOString().split("T")[0], shift: "Day", location: "อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2", tbmNo: "TBM1" });
  const [groutRecords, setGroutRecords] = useState([]);
  const [segmentRecords, setSegmentRecords] = useState([]);
  const [shiftReports, setShiftReports] = useState([]);

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
          }
        } catch (error) { setLoadError("ไม่สามารถดึงข้อมูลได้: " + error.message); }
      }
      setIsLoadingMain(false);
    };
    fetchData();
  }, []);

  const handleProjectInfoChange = (e) => setProjectInfo({ ...projectInfo, [e.target.name]: e.target.value });

  const liveHeaderStatus = useMemo(() => {
    if (segmentRecords.length === 0) return null;
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    const deduped = Array.from(map.values());
    const lastSeg = deduped[deduped.length - 1];

    if (lastSeg.status === "In Progress") {
      if (lastSeg.excavStartTime && !lastSeg.excavEndTime) return { text: `กำลังขุดเจาะ ${lastSeg.ringNo}`, color: "bg-amber-500", icon: <AlertCircle size={12} /> };
      if (lastSeg.excavEndTime && !lastSeg.installStartTime) return { text: `ขุดเสร็จ รอประกอบ ${lastSeg.ringNo}`, color: "bg-slate-500", icon: <Clock size={12} /> };
      if (lastSeg.installStartTime && !lastSeg.installEndTime) return { text: `กำลังประกอบ ${lastSeg.ringNo}`, color: "bg-emerald-500", icon: <Activity size={12} /> };
      return { text: `กำลังทำงาน ${lastSeg.ringNo}`, color: "bg-blue-500", icon: <Activity size={12} /> };
    }
    return null;
  }, [segmentRecords]);

  if (isLoadingMain) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <Loader2 className="animate-spin w-12 h-12 mb-5 text-blue-600" />
      <div className="font-black text-slate-800 text-lg tracking-tight">Connecting to Server...</div>
      <p className="text-slate-400 text-sm mt-2 font-medium">กำลังเตรียมข้อมูล TBM System</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/80 font-sans text-slate-800 selection:bg-blue-100 overflow-x-hidden print:overflow-visible print:bg-white print:min-h-0 print:block">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm transition-all no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`p-2.5 sm:p-3 rounded-2xl text-white shadow-lg transition-colors bg-gradient-to-br from-slate-800 to-slate-900`}><Layers size={20} className="sm:w-6 sm:h-6" strokeWidth={2.5} /></div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">TBM1 System</h1>
                {liveHeaderStatus && <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold text-white shadow-sm animate-pulse ${liveHeaderStatus.color}`}>{liveHeaderStatus.icon} {liveHeaderStatus.text}</div>}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-500 font-semibold mt-0.5"><MapPin size={12} /><input type="text" name="location" value={projectInfo.location} onChange={handleProjectInfoChange} list="locations-list" className="bg-transparent border-none p-0 focus:ring-0 w-48 sm:w-72 outline-none cursor-pointer placeholder-slate-400 font-medium" placeholder="สถานที่..." /><datalist id="locations-list"><option value="อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2" /></datalist></div>
            </div>
          </div>
          {activeTab !== "overview" && activeTab !== "shift_report" && (
            <div className="flex bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200 w-full md:w-auto">
              <button onClick={() => { setCurrentModule("segment"); setActiveTab("record"); }} className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black transition-all ${currentModule === "segment" ? "bg-white text-emerald-600 shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-800"}`}>Segment</button>
              <button onClick={() => { setCurrentModule("grout"); setActiveTab("record"); }} className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black transition-all ${currentModule === "grout" ? "bg-white text-blue-600 shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-800"}`}>Grout</button>
            </div>
          )}
        </div>
      </header>

      <main className="px-3 sm:px-6 py-6 sm:py-10 max-w-7xl mx-auto print:p-0 print:m-0">
        {loadError && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-5 rounded-2xl text-center no-print font-bold shadow-sm">{loadError}</div>}
        {activeTab === "overview" && <OverviewView segmentRecords={segmentRecords} groutRecords={groutRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} />}
        {activeTab === "record" && currentModule === "grout" && <GroutRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} groutRecords={groutRecords} setGroutRecords={setGroutRecords} segmentRecords={segmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} />}
        {activeTab === "record" && currentModule === "segment" && <SegmentRecordView projectInfo={projectInfo} handleProjectInfoChange={handleProjectInfoChange} segmentRecords={segmentRecords} setSegmentRecords={setSegmentRecords} setCurrentModule={setCurrentModule} setActiveTab={setActiveTab} />}
        {activeTab === "dashboard" && currentModule === "grout" && <GroutDashboardView groutRecords={groutRecords} setGroutRecords={setGroutRecords} segmentRecords={segmentRecords} />}
        {activeTab === "dashboard" && currentModule === "segment" && <SegmentDashboardView segmentRecords={segmentRecords} setSegmentRecords={setSegmentRecords} />}
        {activeTab === "report" && <ReportView segmentRecords={segmentRecords} groutRecords={groutRecords} projectInfo={projectInfo} shiftReports={shiftReports} />}
        {activeTab === "shift_report" && <ShiftReportView projectInfo={projectInfo} segmentRecords={segmentRecords} shiftReports={shiftReports} setShiftReports={setShiftReports} />}
      </main>

      <nav className="fixed bottom-6 sm:bottom-8 left-1/2 transform -translate-x-1/2 z-40 no-print w-[95%] sm:w-auto max-w-2xl">
        <div className="flex items-center justify-between sm:justify-center gap-1 sm:gap-2 bg-slate-900/95 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] p-2 rounded-full overflow-x-auto hide-scrollbar">
          <button onClick={() => setActiveTab("overview")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "overview" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}><Home size={18} /> <span className="hidden sm:inline tracking-wide">Home</span></button>
          <div className="w-px h-8 bg-white/20 mx-1"></div>
          <button onClick={() => setActiveTab("record")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "record" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}><PlusCircle size={18} /> <span className="hidden sm:inline tracking-wide">Record</span><span className="sm:hidden">Rec</span></button>
          <button onClick={() => setActiveTab("dashboard")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "dashboard" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}><LayoutDashboard size={18} /> <span className="hidden sm:inline tracking-wide">Dash</span></button>
          <div className="w-px h-8 bg-white/20 mx-1"></div>
          <button onClick={() => setActiveTab("shift_report")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "shift_report" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}><Clock size={18} /> <span className="hidden sm:inline tracking-wide">Shift Report</span><span className="sm:hidden">Shift</span></button>
          <button onClick={() => setActiveTab("report")} className={`flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full text-xs font-bold transition-all ${activeTab === "report" ? "bg-white text-slate-900 shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/10"}`}><FileText size={18} /> <span className="hidden sm:inline tracking-wide">Stats</span><span className="sm:hidden">Stats</span></button>
        </div>
      </nav>
    </div>
  );
};

export default PrimaryGroutApp;
