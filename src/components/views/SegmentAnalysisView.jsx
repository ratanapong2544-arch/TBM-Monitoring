import React, { useState, useMemo } from "react";
import {
  TrendingUp, Settings, Plus, Save, Trash2, X, Maximize2, Loader2, Printer
} from "lucide-react";
import { filterByState } from "../../hooks/useGlobalFilter";
import { formatDisplayDate, formatDisplayTime } from "../../utils/formatters";
import { getRingNumeric } from "../../utils/helpers";
import { TOTAL_ROUTE_DISTANCE } from "../../utils/constants";
import { apiCall } from "../../utils/api";
import { chartColors, axisTick, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line
} from "recharts";

export default function SegmentAnalysisView({ segmentRecords = [], projectInfo, machine = "TBM1", filterState = {}, readOnly = false }) {
  const filteredSegments = useMemo(() => filterByState(segmentRecords, filterState), [segmentRecords, filterState]);

  const paceStats = useMemo(() => {
    const map = new Map();
    segmentRecords.forEach((r) => { if (r.installType !== "Temporary") map.set(r.ringNo, r); });
    const perm = Array.from(map.values());
    const doneRings = perm.length;
    const totalDist = perm.reduce((s, r) => s + parseFloat(r.length || 0), 0);
    const avgLen = doneRings > 0 ? totalDist / doneRings : 1.4;
    const targetRings = Math.round(TOTAL_ROUTE_DISTANCE / avgLen);
    const remainingRings = Math.max(0, targetRings - doneRings);
    const dates = [...new Set(perm.map((r) => formatDisplayDate(r.date)))];
    const currentPerDay = dates.length > 0 ? doneRings / dates.length : 0;
    const nowTH = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const daysLeft = Math.max(0, Math.ceil((new Date("2028-09-30") - nowTH) / 86400000));
    const requiredPerDay = daysLeft > 0 ? remainingRings / daysLeft : 0;
    return { doneRings, targetRings, remainingRings, currentPerDay, requiredPerDay, behind: requiredPerDay > currentPerDay };
  }, [segmentRecords]);

  // ── Print State ──
  const [printingChartId, setPrintingChartId] = useState("all");

  const handlePrintSpecificChart = (chartId) => {
    setPrintingChartId(chartId);
    setTimeout(() => {
      window.print();
      setPrintingChartId("all");
    }, 600);
  };

  const getPrintClass = (id) => {
    return printingChartId === "all" ? "" : (printingChartId === id ? "print-target" : "print:hidden");
  };

  // ── Seg Filter State ──
  const [segFilterMode, setSegFilterMode] = useState("all");
  const [segFilterDate, setSegFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [segFilterMonth, setSegFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [segRangeStart, setSegRangeStart] = useState("");
  const [segRangeEnd, setSegRangeEnd] = useState("");
  const [segFilterShift, setSegFilterShift] = useState("All");

  // ── Expand State ──
  const [expandedChart, setExpandedChart] = useState(null);

  // ── Plan Config ──
  const [showPlanModal, setShowPlanModal] = useState(false);
  const defaultPlanConfig = { basePlanAcc: 0, baseActualAcc: 0, ranges: [] };
  const [planConfig, setPlanConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("tbmPlanConfig");
      if (saved) { const parsed = JSON.parse(saved); return { ...defaultPlanConfig, ...parsed, ranges: parsed.ranges || [] }; }
    } catch (e) { }
    return defaultPlanConfig;
  });

  const [isSavingPlan, setIsSavingPlan] = useState(false);

  const getPlanForDate = (dateStr, config) => {
    if (!config || !config.ranges || config.ranges.length === 0) return 0;
    for (let range of config.ranges) {
      if ((!range.start || dateStr >= range.start) && (!range.end || dateStr <= range.end)) {
        return parseFloat(range.dailyPlan) || 0;
      }
    }
    return 0;
  };

  const handleSavePlanSettings = async () => {
    if (readOnly) return;
    setIsSavingPlan(true);
    try {
      localStorage.setItem("tbmPlanConfig", JSON.stringify(planConfig));
      // ส่งทั้งคู่เหมือนเดิม (กัน GAS เขียนทับ distPlanConfig ฝั่ง server) — ดึง distance plan จาก localStorage
      const distPlanConfig = JSON.parse(localStorage.getItem("tbmDistancePlanConfig") || "null") || { ranges: [] };
      await apiCall("savePlanConfig", { machine, planConfig, distPlanConfig });
      setShowPlanModal(false);
    } catch (e) {
      console.error("Failed to save plan config", e);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลไปยัง Server");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const addPlanRange = () => setPlanConfig({ ...planConfig, ranges: [...(planConfig.ranges || []), { start: "", end: "", dailyPlan: 0 }] });
  const removePlanRange = (index) => { const r = [...(planConfig.ranges || [])]; r.splice(index, 1); setPlanConfig({ ...planConfig, ranges: r }); };

  // ── Deduplicate Helper ──
  const deduplicateRecords = (records) => {
    const map = new Map();
    records.forEach(r => {
      const key = r.ringNo;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, r);
      } else {
        if (existing.status === "In Progress" && r.status !== "In Progress") {
          map.set(key, r);
        } else if (existing.status === r.status) {
          map.set(key, r);
        }
      }
    });
    return Array.from(map.values());
  };

  // ── Base Segment Records Memo ──
  const baseSegmentRecords = useMemo(() => {
    let recordsToFilter = filteredSegments;
    if (segFilterShift !== "All") {
      recordsToFilter = filteredSegments.filter(rec => rec.shift === segFilterShift || rec.installShift === segFilterShift || rec.excavShift === segFilterShift);
    }
    return recordsToFilter.filter(rec => {
      const dDate = formatDisplayDate(rec.date);
      if (segFilterMode === "all") return true;
      if (segFilterMode === "daily") return dDate === segFilterDate;
      if (segFilterMode === "monthly") return dDate.startsWith(segFilterMonth);
      if (segFilterMode === "range") {
        if (segRangeStart && dDate < segRangeStart) return false;
        if (segRangeEnd && dDate > segRangeEnd) return false;
        return true;
      }
      return true;
    }).sort((a, b) => {
      const numA = getRingNumeric(a.ringNo);
      const numB = getRingNumeric(b.ringNo);
      if (numA !== numB) return numA - numB;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [filteredSegments, segFilterMode, segFilterDate, segFilterMonth, segRangeStart, segRangeEnd, segFilterShift]);

  const segChartData = useMemo(() => {
    const dedupedBase = deduplicateRecords(baseSegmentRecords);
    const datesMap = new Map();
    const completedPerms = dedupedBase.filter(r => r.installType !== "Temporary");
    const tempRecords = dedupedBase.filter(r => r.installType === "Temporary");

    completedPerms.forEach(rec => {
      const dDate = formatDisplayDate(rec.date);
      if (!datesMap.has(dDate)) datesMap.set(dDate, { date: dDate, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0 });
      const d = datesMap.get(dDate);
      if (rec.shift === "Day" || rec.installShift === "Day") d.dayRings++; else d.nightRings++;
      d.totalRings++;
    });
    tempRecords.forEach(rec => {
      const dDate = formatDisplayDate(rec.date);
      if (!datesMap.has(dDate)) datesMap.set(dDate, { date: dDate, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0 });
      datesMap.get(dDate).tempRings++;
    });

    const sorted = Array.from(datesMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    let runningActual = parseFloat(planConfig.baseActualAcc) || 0;
    let runningPlan = parseFloat(planConfig.basePlanAcc) || 0;
    let prevDate = null;

    if (segFilterMode === "daily") {
      let baselineAcc = parseFloat(planConfig.baseActualAcc) || 0;
      const dedupedAll = deduplicateRecords(baseSegmentRecords);
      const sortedDates = [...new Set(dedupedAll.map(r => formatDisplayDate(r.date)))].sort();
      for (const d of sortedDates) {
        if (d < segFilterDate) {
          baselineAcc += dedupedAll.filter(r => formatDisplayDate(r.date) === d && r.installType !== "Temporary").length;
        }
      }
      const dayDeduped = deduplicateRecords(baseSegmentRecords.filter(r => formatDisplayDate(r.date) === segFilterDate));
      const currentDayPlan = getPlanForDate(segFilterDate, planConfig);
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({ displayDate: `${String(i).padStart(2, "0")}:00`, dayRings: 0, nightRings: 0, tempRings: 0, totalRings: 0, plan: currentDayPlan / 24 }));
      dayDeduped.forEach(rec => {
        const timeToUse = rec.installStartTime || rec.startTime;
        if (timeToUse) {
          const hour = parseInt(formatDisplayTime(timeToUse).split(":")[0], 10);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            if (rec.installType === "Temporary") hourlyData[hour].tempRings++;
            else {
              if (rec.shift === "Day" || rec.installShift === "Day") hourlyData[hour].dayRings++;
              else hourlyData[hour].nightRings++;
              hourlyData[hour].totalRings++;
            }
          }
        }
      });
      let curAcc = baselineAcc;
      return hourlyData.map(h => { curAcc += h.totalRings; return { ...h, actualAcc: curAcc }; });
    }

    const rows = sorted.map(day => {
      runningActual += day.dayRings + day.nightRings;
      if (prevDate) {
        let tempD = new Date(prevDate); tempD.setDate(tempD.getDate() + 1);
        let endD = new Date(day.date);
        while (tempD <= endD) { runningPlan += getPlanForDate(tempD.toISOString().split("T")[0], planConfig); tempD.setDate(tempD.getDate() + 1); }
      } else { runningPlan += getPlanForDate(day.date, planConfig); }
      prevDate = day.date;
      return {
        ...day, plan: getPlanForDate(day.date, planConfig),
        displayDate: new Date(day.date).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }),
        actualAcc: runningActual, planAcc: Math.round(runningPlan * 10) / 10
      };
    });
    return rows.map((row, i) => {
      const win = rows.slice(Math.max(0, i - 6), i + 1);
      const ma = win.reduce((s, r) => s + (r.dayRings + r.nightRings), 0) / win.length;
      return { ...row, ma7: Math.round(ma * 10) / 10 };
    });
  }, [baseSegmentRecords, planConfig, segFilterMode, segFilterDate, getPlanForDate]);

  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in space-y-6">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { background: white !important; }
        }

        ${printingChartId !== "all" ? `
          body { overflow: hidden !important; }

          .print-target {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            min-height: 100vh !important;
            height: auto !important;
            margin: 0 !important;
            padding: 20px !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            z-index: 99999 !important;
            max-width: none !important;
          }

          .print-target * {
            max-width: none !important;
          }

          @media print {
            .print-target {
              position: static !important;
              padding: 0 !important;
            }
          }
        ` : ""}
      `}</style>

      {/* ═══ Required-Rate Banner ═══ */}
      {paceStats.targetRings > 0 && (
        <div className={`rounded-card border p-4 shadow-card flex items-center gap-3 ${paceStats.behind ? "bg-code-d/10 border-code-d/30" : "bg-sgreen-med/10 border-sgreen-med/30"}`}>
          <TrendingUp size={22} className={paceStats.behind ? "text-code-d" : "text-sgreen-dark"} />
          <div className="text-sm leading-snug">
            <span className="font-semibold text-ink">เพื่อทันกำหนด ก.ย. 71 ต้องเร่งเป็น </span>
            <span className={`font-mono font-bold ${paceStats.behind ? "text-code-d" : "text-sgreen-dark"}`}>{paceStats.requiredPerDay.toFixed(1)} วง/วัน</span>
            <span className="text-ink-2"> (ปัจจุบันเฉลี่ย <span className="font-mono font-semibold text-ink">{paceStats.currentPerDay.toFixed(1)}</span> วง/วัน · เหลือ ~{paceStats.remainingRings.toLocaleString()} วง)</span>
          </div>
        </div>
      )}

      {/* ═══ SECTION 3: Segment Installation Trend ═══ */}
      <div className={`bg-surface rounded-card shadow-card border border-line p-5 sm:p-8 overflow-hidden ${getPrintClass('segment')}`}>

        {/* Header - Title & Legend */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4 border-b border-line pb-5">
          <div className="flex flex-col gap-1 w-full lg:w-auto">
            <h2 className="text-xl sm:text-2xl font-semibold text-navy-dark tracking-tight flex items-center gap-2">
              <TrendingUp className="text-sgreen-dark" size={28} /> รายงานความก้าวหน้างานขุดเจาะอุโมงค์ {projectInfo?.tbmNo || "TBM"} (Rings/Day)
            </h2>
            <p className="text-sm text-ink-2 font-medium ml-9">{projectInfo?.tbmNo || "TBM"} Segment Installation Tracking (Ring Progress)</p>
          </div>

          <div className="flex gap-4 text-xs font-semibold bg-surface-alt p-3 rounded-input border border-line shadow-card shrink-0 items-center justify-between sm:justify-end w-full lg:w-auto">
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-badge shadow-sm" style={{ backgroundColor: chartColors.dayShift }}></span>Day Shift</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-badge shadow-sm" style={{ backgroundColor: chartColors.nightShift }}></span>Night Shift</div>
            {segFilterMode !== "daily" && <>
              <div className="w-px h-6 bg-line mx-1 hidden sm:block"></div>
              <div className="flex items-center gap-2"><span className="w-5 h-1 rounded-full shadow-sm" style={{ backgroundColor: chartColors.planned }}></span>Plan Acc.</div>
              <div className="flex items-center gap-2"><span className="w-5 h-1.5 rounded-full shadow-sm" style={{ backgroundColor: chartColors.actual }}></span>Actual Acc.</div>
            </>}
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
          <div className="flex items-center bg-surface-alt border border-line rounded-input p-1 shadow-card shrink-0 print:hidden">
            {!readOnly && (
              <button onClick={() => handlePrintSpecificChart('segment')} className="px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-ink-2 hover:text-navy hover:bg-surface rounded-input transition-colors bg-surface border border-line shadow-card" title="Print Chart"><Printer size={16} /> ปริ้นกราฟ</button>
            )}
            {!readOnly && <div className="w-px h-5 bg-line mx-2 hidden sm:block"></div>}
            <button onClick={() => setExpandedChart('segment')} className="px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-ink-2 hover:text-navy hover:bg-surface rounded-input transition-colors border border-transparent" title="Expand Chart"><Maximize2 size={16} /> ขยายจอภาพ</button>
            {!readOnly && <div className="w-px h-5 bg-line mx-2 hidden sm:block"></div>}
            {!readOnly && (
              <button onClick={() => setShowPlanModal(true)} className="px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-ink-2 hover:text-sgreen-dark hover:bg-surface rounded-input transition-colors border border-transparent" title="Plan Settings"><Settings size={16} /> ตั้งค่าแผนงาน</button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full lg:w-auto bg-surface-alt p-2 rounded-input border border-line shrink-0 print:hidden">
            <div className="flex bg-surface rounded-input p-1 border border-line shadow-card w-full sm:w-auto overflow-x-auto">
              {["all", "daily", "monthly", "range"].map(m => (
                <button key={m} onClick={() => setSegFilterMode(m)} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${segFilterMode === m ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>{m === "all" ? "All" : m === "daily" ? "Daily" : m === "monthly" ? "Monthly" : "Range"}</button>
              ))}
            </div>
            {segFilterMode === "daily" && <input type="date" value={segFilterDate} onChange={e => setSegFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink w-full sm:w-auto bg-surface" />}
            {segFilterMode === "monthly" && <input type="month" value={segFilterMonth} onChange={e => setSegFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink w-full sm:w-auto bg-surface" />}
            {segFilterMode === "range" && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input type="date" value={segRangeStart} onChange={e => setSegRangeStart(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink bg-surface" />
                <span className="text-ink-3">-</span>
                <input type="date" value={segRangeEnd} onChange={e => setSegRangeEnd(e.target.value)} className="px-2 py-1.5 flex-1 sm:flex-none sm:w-[120px] text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink bg-surface" />
              </div>
            )}
            <div className="w-px h-6 bg-line hidden sm:block"></div>
            <select value={segFilterShift} onChange={e => setSegFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink bg-surface cursor-pointer w-full sm:w-auto">
              <option value="All">All Shifts</option><option value="Day">Day Shift</option><option value="Night">Night Shift</option>
            </select>
          </div>
        </div>

        <div className="h-[350px] sm:h-[500px] w-full">
          <div className="w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={segChartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="displayDate" tick={axisTick} angle={-45} textAnchor="end" height={80} stroke={chartColors.axis} label={{ value: "วันที่ (Date)", position: "insideBottom", offset: -20, fill: chartColors.axisLabel, fontSize: 12, fontWeight: "bold" }} />
                <YAxis yAxisId="left" domain={[0, segFilterMode === "daily" ? "auto" : 10]} tick={axisTick} axisLine={{ stroke: chartColors.axis }} tickLine={false} label={{ value: 'อัตราการขุดเจาะ (Rings / Day)', angle: -90, position: 'insideLeft', offset: -5, fill: chartColors.axisLabel, fontSize: 11, fontWeight: 'bold' }} />
                {segFilterMode !== "daily" && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={axisTick} axisLine={{ stroke: chartColors.axis }} tickLine={false} label={{ value: 'สะสม (Cumulative Rings)', angle: 90, position: 'insideRight', offset: -5, fill: chartColors.axisLabel, fontSize: 11, fontWeight: 'bold' }} />}
                <Tooltip {...tooltipStyle} />
                {segFilterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="plan" stroke={chartColors.axis} strokeWidth={2} dot={segChartData.length <= 24 ? { r: 0 } : { r: 2 }} name="Plan Daily" isAnimationActive={printingChartId === "all"} />}
                <Bar yAxisId="left" dataKey="dayRings" stackId="a" fill={chartColors.dayShift} name="Perm. D/S" radius={[0, 0, 0, 0]} maxBarSize={40} isAnimationActive={printingChartId === "all"} />
                <Bar yAxisId="left" dataKey="nightRings" stackId="a" fill={chartColors.nightShift} name="Perm. N/S" radius={[0, 0, 0, 0]} maxBarSize={40} isAnimationActive={printingChartId === "all"} />
                <Bar yAxisId="left" dataKey="tempRings" stackId="a" fill={chartColors.temporary} name="Temporary" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={printingChartId === "all"} />
                {segFilterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="ma7" stroke={chartColors.paid} strokeWidth={2} strokeDasharray="5 3" dot={false} name="MA 7 วัน" isAnimationActive={printingChartId === "all"} />}
                {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="planAcc" stroke={chartColors.planned} strokeWidth={2} dot={segChartData.length === 1 ? { r: 3, fill: chartColors.planned } : { r: 2, fill: chartColors.planned }} name="Plan Acc." isAnimationActive={printingChartId === "all"} />}
                {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="actualAcc" stroke={chartColors.actual} strokeWidth={3} dot={segChartData.length === 1 ? { r: 4, fill: chartColors.actual } : { r: 3, fill: chartColors.actual }} name="Actual Acc." label={{ position: "top", fill: chartColors.actual, fontSize: 10, fontWeight: "900" }} isAnimationActive={printingChartId === "all"} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══ Plan Settings Modal ═══ */}
      {showPlanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-dark/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full max-w-lg shadow-modal overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-navy-dark px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Settings size={20} /> ตั้งค่าแผนงาน (Plan Settings)</h3>
              <button onClick={() => setShowPlanModal(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-cyan-tint p-4 rounded-input border border-line">
                <h4 className="font-semibold text-navy mb-3 text-sm">ตั้งค่าพื้นฐาน (Baseline)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-ink-2 block mb-1">Baseline Actual (Rings)</label>
                    <input type="number" value={planConfig.baseActualAcc} onChange={e => setPlanConfig({ ...planConfig, baseActualAcc: Number(e.target.value) })} className="w-full bg-surface border border-line rounded-input p-2 outline-none focus:border-navy font-mono text-sm text-ink" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink-2 block mb-1">Baseline Plan (Rings)</label>
                    <input type="number" value={planConfig.basePlanAcc} onChange={e => setPlanConfig({ ...planConfig, basePlanAcc: Number(e.target.value) })} className="w-full bg-surface border border-line rounded-input p-2 outline-none focus:border-navy font-mono text-sm text-ink" />
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold text-ink text-sm">ช่วงเวลาแผนงาน (Plan Ranges)</h4>
                  <button onClick={addPlanRange} className="text-sgreen-dark hover:text-sgreen-med bg-surface-alt hover:bg-sgreen-med/10 px-2.5 py-1 rounded-input text-xs font-semibold flex items-center gap-1 transition-colors border border-line"><Plus size={14} /> เพิ่มช่วง</button>
                </div>
                <div className="space-y-3">
                  {(planConfig.ranges || []).map((range, index) => (
                    <div key={index} className="flex items-center gap-2 bg-surface-alt p-3 rounded-input border border-line">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-ink-3 block mb-1">เริ่ม</label>
                          <input type="date" value={range.start} onChange={e => { const nr = [...(planConfig.ranges || [])]; nr[index].start = e.target.value; setPlanConfig({ ...planConfig, ranges: nr }); }} className="w-full bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy text-ink" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-ink-3 block mb-1">สิ้นสุด</label>
                          <input type="date" value={range.end} onChange={e => { const nr = [...(planConfig.ranges || [])]; nr[index].end = e.target.value; setPlanConfig({ ...planConfig, ranges: nr }); }} className="w-full bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy text-ink" />
                        </div>
                      </div>
                      <div className="w-20 shrink-0">
                        <label className="text-[10px] font-semibold text-ink-3 block mb-1">Plan/Day</label>
                        <input type="number" step="0.5" value={range.dailyPlan} onChange={e => { const nr = [...(planConfig.ranges || [])]; nr[index].dailyPlan = Number(e.target.value); setPlanConfig({ ...planConfig, ranges: nr }); }} className="w-full bg-surface border border-line rounded-input p-1.5 text-xs outline-none focus:border-navy font-mono text-center font-semibold text-ink" />
                      </div>
                      <button onClick={() => removePlanRange(index)} className="p-1.5 text-code-d hover:text-code-d hover:bg-code-d/10 rounded-input mt-4 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {(planConfig.ranges || []).length === 0 && <div className="text-center p-4 text-xs text-ink-3 bg-surface-alt rounded-input border border-dashed border-line">ไม่พบช่วงเวลาแผนงาน (ใช้ Default 0 Ring/Day)</div>}
                </div>
              </div>
            </div>
            <div className="p-4 bg-surface-alt border-t border-line flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowPlanModal(false)} className="px-5 py-2.5 bg-surface text-ink-2 rounded-input text-sm font-semibold border border-line hover:bg-surface-alt shadow-card transition-colors" disabled={isSavingPlan}>ยกเลิก</button>
              <button onClick={handleSavePlanSettings} disabled={isSavingPlan} className="px-5 py-2.5 bg-sgreen-dark text-white rounded-input text-sm font-semibold shadow-hover hover:opacity-90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSavingPlan ? <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</> : <><Save size={16} /> บันทึกการตั้งค่า</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Chart Expansion Modal (segment only) ═══ */}
      {expandedChart === 'segment' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8 bg-navy-dark/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full h-full max-w-[1400px] max-h-[90vh] shadow-modal overflow-hidden flex flex-col">
            <div className="bg-navy-dark px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <TrendingUp size={20} /> Installation Trend
              </h3>
              <button onClick={() => setExpandedChart(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-4 sm:p-6 flex-1 overflow-hidden flex flex-col bg-surface-alt">
              <div className="flex-1 w-full h-full bg-surface rounded-input border border-line shadow-card p-4 sm:p-6">
                <div className="w-full h-full flex flex-col">
                  <div className="flex flex-wrap gap-4 sm:gap-6 justify-center items-center text-[10px] sm:text-xs font-semibold bg-surface-alt p-3 sm:px-6 rounded-input border border-line mb-4 shadow-card w-fit mx-auto shrink-0">
                    <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded-badge shadow-card" style={{ backgroundColor: chartColors.dayShift }}></span>Perm. D/S</div>
                    <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded-badge shadow-card" style={{ backgroundColor: chartColors.nightShift }}></span>Perm. N/S</div>
                    <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded-badge shadow-card" style={{ backgroundColor: chartColors.temporary }}></span>Temporary</div>
                    {segFilterMode !== "daily" && <>
                      <div className="flex items-center gap-1.5 sm:gap-2 ml-0 sm:ml-4"><span className="w-5 h-1 md:w-6 md:h-1 rounded-full" style={{ backgroundColor: chartColors.axis }}></span>Plan Daily</div>
                      <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-5 h-1 md:w-6 md:h-1 rounded-full" style={{ backgroundColor: chartColors.planned }}></span>Plan Acc.</div>
                      <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-5 h-1.5 md:w-6 md:h-1.5 rounded-full" style={{ backgroundColor: chartColors.actual }}></span>Actual Acc.</div>
                    </>}
                  </div>
                  <div className="flex-1 w-full min-h-[400px]">
                    <ResponsiveContainer>
                      <ComposedChart data={segChartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                        <XAxis dataKey="displayDate" tick={axisTick} angle={-45} textAnchor="end" height={60} />
                        <YAxis yAxisId="left" domain={[0, segFilterMode === "daily" ? "auto" : 10]} tick={axisTick} axisLine={false} tickLine={false} />
                        {segFilterMode !== "daily" && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={axisTick} axisLine={false} tickLine={false} />}
                        <Tooltip {...tooltipStyle} />
                        {segFilterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="plan" stroke={chartColors.axis} strokeWidth={2} dot={segChartData.length <= 24 ? { r: 0 } : { r: 2 }} name="Plan Daily" />}
                        <Bar yAxisId="left" dataKey="dayRings" stackId="a" fill={chartColors.dayShift} name="Perm. D/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                        <Bar yAxisId="left" dataKey="nightRings" stackId="a" fill={chartColors.nightShift} name="Perm. N/S" radius={[0, 0, 0, 0]} maxBarSize={40} />
                        <Bar yAxisId="left" dataKey="tempRings" stackId="a" fill={chartColors.temporary} name="Temporary" radius={[4, 4, 0, 0]} maxBarSize={40} />
                        {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="planAcc" stroke={chartColors.planned} strokeWidth={2} dot={segChartData.length === 1 ? { r: 3, fill: chartColors.planned } : { r: 2, fill: chartColors.planned }} name="Plan Acc." />}
                        {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="actualAcc" stroke={chartColors.actual} strokeWidth={3} dot={segChartData.length === 1 ? { r: 4, fill: chartColors.actual } : { r: 3, fill: chartColors.actual }} name="Actual Acc." label={{ position: "top", fill: chartColors.actual, fontSize: 10, fontWeight: "900" }} />}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
