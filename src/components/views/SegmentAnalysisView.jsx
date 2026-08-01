import React, { useState, useMemo, useEffect } from "react";
import {
  TrendingUp, Settings, Plus, Save, Trash2, X, Maximize2, Loader2, Printer
} from "lucide-react";
import { filterByState } from "../../hooks/useGlobalFilter";
import { formatDisplayDate, formatDisplayTime } from "../../utils/formatters";
import { getRingNumeric } from "../../utils/helpers";
import { PROJECT_DEADLINE } from "../../utils/constants";
import { computePaceStats } from "../../utils/paceStats";
import { chartColors, axisTick, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line, LabelList
} from "recharts";
import { fitAndPrint } from "../../utils/printFit";
import { buildMutationEnvelope } from "../../offline/mutationEnvelope";
import { planConfigFor } from "../../utils/planConfig";

export default function SegmentAnalysisView({ segmentRecords = [], projectInfo, machine = "TBM1", filterState = {}, readOnly = false, onMutate, syncMeta, planConfig: planConfigProp }) {
  const filteredSegments = useMemo(() => filterByState(segmentRecords, filterState), [segmentRecords, filterState]);

  // ── ตัวช่วยแสดงผล (display only) ──
  const beShort = (ymd) => {
    if (!ymd) return "—";
    const [y, m] = ymd.split("-").map(Number);
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${months[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
  };
  const fmtDelta = (days) => {
    if (days === null || days === undefined) return "—";
    if (Math.abs(days) < 15) return "ทันพอดี";
    const months = Math.round(Math.abs(days) / 30.44);
    const word = days > 0 ? "ช้า" : "เร็ว";
    if (months >= 12) return `${word} ${Math.round(months / 12)} ปี`;
    return `${word} ${months} เดือน`;
  };
  const labelNonZero = (v) => (v > 0 ? v : "");

  // ── Line show/hide toggle (กดที่ legend) ──
  const [hiddenSeries, setHiddenSeries] = useState({});
  const toggleSeries = (k) => setHiddenSeries((s) => ({ ...s, [k]: !s[k] }));

  // ── Print State ──
  const [printingChartId, setPrintingChartId] = useState("all");

  const handlePrintSpecificChart = (chartId) => {
    setPrintingChartId(chartId);
    setTimeout(() => {
      fitAndPrint(document.querySelector(".print-target"), { orientation: "landscape", onePage: true });
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

  // ── Pace stats (เรท/คาดเสร็จ) — ช่วงคิดตาม filter ──
  const { filterStart, filterEnd } = useMemo(() => {
    if (segFilterMode === "daily") return { filterStart: segFilterDate, filterEnd: segFilterDate };
    if (segFilterMode === "monthly") {
      const [y, mo] = segFilterMonth.split("-").map(Number);
      const last = new Date(y, mo, 0).getDate();
      return { filterStart: `${segFilterMonth}-01`, filterEnd: `${segFilterMonth}-${String(last).padStart(2, "0")}` };
    }
    if (segFilterMode === "range") return { filterStart: segRangeStart || null, filterEnd: segRangeEnd || null };
    return { filterStart: null, filterEnd: null }; // all
  }, [segFilterMode, segFilterDate, segFilterMonth, segRangeStart, segRangeEnd]);

  const paceStats = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
    return computePaceStats({ segmentRecords, today, filterStart, filterEnd });
  }, [segmentRecords, filterStart, filterEnd]);

  const windowLabel = segFilterMode === "all" ? "ทั้งโครงการ"
    : segFilterMode === "daily" ? "วันที่เลือก"
    : segFilterMode === "monthly" ? "เดือนที่เลือก" : "ช่วงที่เลือก";

  // ── Expand State ──
  const [expandedChart, setExpandedChart] = useState(null);

  // ── Plan Config ──
  const [showPlanModal, setShowPlanModal] = useState(false);
  // The config comes down as a prop now. `tbmPlanConfig` was one localStorage key for both machines,
  // so App wrote whichever machine was active into it and switching back showed the other machine's
  // plan under these rings; the snapshot has stored it per machine all along.
  const [planConfig, setPlanConfig] = useState(() => planConfigFor(planConfigProp));
  // The first render is the cached snapshot and the server answer lands a moment later, so a
  // `useState` initialiser alone would leave the crew editing the stale plan. Not while the modal is
  // open: a refresh mid-edit would otherwise discard what they had typed.
  useEffect(() => {
    if (!showPlanModal) setPlanConfig(planConfigFor(planConfigProp));
    // eslint-disable-next-line
  }, [planConfigProp]);

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
      // planConfig ALONE. The one-shot write sent distPlanConfig with it to stop GAS overwriting the
      // one this view was not editing; each is its own record with its own version now, and the sync
      // path writes exactly the key the envelope names — so sending the other would be this view
      // saving a config it never showed.
      if (onMutate) {
        await onMutate(buildMutationEnvelope({
          entityType: "planConfig", operation: "update", machine, recordId: machine,
          payload: { planConfig }, syncMeta,
        }));
      }
      setShowPlanModal(false);
    } catch (e) {
      console.error("Failed to save plan config", e);
      alert("บันทึกลงคิวไม่สำเร็จ — ข้อมูลนี้ยังไม่ถูกเก็บไว้ที่ใด: " + (e && e.message ? e.message : e));
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

  // วันเยอะ (>31) → ซ่อนตัวเลขบนแท่ง/เส้นอัตโนมัติ ให้อ่านง่าย
  const manyBars = segChartData.length > 31;
  // Actual Acc: แสดงเลขเฉพาะจุดสุดท้าย (ยอดล่าสุด) แทนทุกจุด
  const renderActualEndLabel = (props) => {
    const { x, y, value, index } = props;
    if (index !== segChartData.length - 1 || value == null) return null;
    return <text x={x} y={y - 8} fill={chartColors.actual} fontSize={11} fontWeight={900} textAnchor="middle">{value}</text>;
  };

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

      {/* ═══ Schedule / Pace Hero Panel ═══ */}
      {paceStats.targetRings > 0 && (() => {
        const p = paceStats;
        const donePct = p.targetRings > 0 ? Math.round((p.doneRings / p.targetRings) * 100) : 0;
        const ok = !p.behind;
        const tone = ok ? "text-sgreen-dark" : "text-code-d";
        const statusText = !p.finishWindow
          ? "ยังประเมินไม่ได้ — ไม่มีงานในช่วงที่เลือก"
          : p.behind ? `${fmtDelta(p.deltaWindowDays)} · ต้องเร่ง`
          : `คาดเสร็จทันกำหนด · ${fmtDelta(p.deltaWindowDays)}`;
        return (
          <div className={`bg-surface rounded-card border shadow-card overflow-hidden ${ok ? "border-sgreen-med/30" : "border-code-d/30"}`}>
            {/* header: status pill + deadline */}
            <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5">
              <span className={`inline-flex items-center gap-2 text-[13px] font-bold px-3 py-1 rounded-full ${ok ? "bg-sgreen-med/10 text-sgreen-dark" : "bg-code-d/10 text-code-d"}`}>
                <TrendingUp size={15} /> {statusText}
              </span>
              <span className="text-[13px] text-ink-2 font-semibold">กำหนดเสร็จ <span className="text-ink font-bold">{beShort(PROJECT_DEADLINE)}</span></span>
            </div>
            {/* progress bar */}
            <div className="px-5 pb-4">
              <div className="flex justify-between text-xs font-bold text-ink-2 mb-1.5"><span>ความคืบหน้า</span><span className="font-mono">{p.doneRings.toLocaleString()} / {p.targetRings.toLocaleString()} ริง · {donePct}%</span></div>
              <div className="h-2 bg-surface-alt rounded-full overflow-hidden"><div className="h-full bg-navy rounded-full transition-all" style={{ width: `${Math.min(100, donePct)}%` }}></div></div>
            </div>
            {/* metrics */}
            <div className="grid grid-cols-3 border-t border-line divide-x divide-line">
              <div className="px-5 py-3.5">
                <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wide">ต้องเร่งเป็น</div>
                <div className="text-[28px] leading-none font-bold text-navy font-mono mt-1.5">{p.requiredRate !== null ? p.requiredRate.toFixed(1) : "—"}</div>
                <div className="text-xs font-semibold text-ink-2 mt-1.5">ริง/วัน · ให้ทันกำหนด</div>
              </div>
              <div className="px-5 py-3.5">
                <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wide">เรทช่วงที่เลือก</div>
                <div className="text-[28px] leading-none font-bold text-navy font-mono mt-1.5">{p.workingRate.toFixed(1)}</div>
                <div className="text-xs font-semibold text-ink-2 mt-1.5">ริง/วันทำงาน · {windowLabel}</div>
              </div>
              <div className={`px-5 py-3.5 ${ok ? "bg-sgreen-med/5" : "bg-code-d/5"}`}>
                <div className={`text-[11px] font-bold uppercase tracking-wide ${tone}`}>คาดเสร็จ</div>
                <div className={`text-[28px] leading-none font-bold font-mono mt-1.5 ${tone}`}>{p.finishWindow ? beShort(p.finishWindow) : "—"}</div>
                <div className={`text-xs font-semibold mt-1.5 ${tone}`}>{p.finishWindow ? fmtDelta(p.deltaWindowDays) : "ยังประเมินไม่ได้"}</div>
              </div>
            </div>
          </div>
        );
      })()}

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

          <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-semibold bg-surface-alt p-3 rounded-input border border-line shadow-card shrink-0 items-center justify-between sm:justify-end w-full lg:w-auto">
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-badge shadow-sm" style={{ backgroundColor: chartColors.dayShift }}></span>Day Shift</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-badge shadow-sm" style={{ backgroundColor: chartColors.nightShift }}></span>Night Shift</div>
            {segFilterMode !== "daily" && <>
              <div className="w-px h-6 bg-line mx-1 hidden sm:block"></div>
              <button type="button" onClick={() => toggleSeries('plan')} title="กดเพื่อซ่อน/แสดงเส้น" className={`flex items-center gap-2 transition-opacity hover:opacity-70 ${hiddenSeries.plan ? 'opacity-30 line-through' : ''}`}><span className="w-5 h-1 rounded-full shadow-sm" style={{ backgroundColor: chartColors.axis }}></span>Plan รายวัน</button>
              <button type="button" onClick={() => toggleSeries('ma7')} title="กดเพื่อซ่อน/แสดงเส้น" className={`flex items-center gap-2 transition-opacity hover:opacity-70 ${hiddenSeries.ma7 ? 'opacity-30 line-through' : ''}`}><span className="w-5 h-1 rounded-full shadow-sm" style={{ backgroundColor: chartColors.paid }}></span>MA 7 วัน</button>
              <button type="button" onClick={() => toggleSeries('planAcc')} title="กดเพื่อซ่อน/แสดงเส้น" className={`flex items-center gap-2 transition-opacity hover:opacity-70 ${hiddenSeries.planAcc ? 'opacity-30 line-through' : ''}`}><span className="w-5 h-1 rounded-full shadow-sm" style={{ backgroundColor: chartColors.planned }}></span>Plan Acc.</button>
              <button type="button" onClick={() => toggleSeries('actualAcc')} title="กดเพื่อซ่อน/แสดงเส้น" className={`flex items-center gap-2 transition-opacity hover:opacity-70 ${hiddenSeries.actualAcc ? 'opacity-30 line-through' : ''}`}><span className="w-5 h-1.5 rounded-full shadow-sm" style={{ backgroundColor: chartColors.actual }}></span>Actual Acc.</button>
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
                {segFilterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="plan" stroke={chartColors.axis} strokeWidth={2} dot={segChartData.length <= 24 ? { r: 0 } : { r: 2 }} name="Plan Daily" hide={!!hiddenSeries.plan} isAnimationActive={printingChartId === "all"} />}
                <Bar yAxisId="left" dataKey="dayRings" stackId="a" fill={chartColors.dayShift} name="Perm. D/S" radius={[0, 0, 0, 0]} maxBarSize={40} isAnimationActive={printingChartId === "all"}>
                  {!manyBars && <LabelList dataKey="dayRings" position="center" formatter={labelNonZero} fill="#fff" fontSize={11} fontWeight={800} />}
                </Bar>
                <Bar yAxisId="left" dataKey="nightRings" stackId="a" fill={chartColors.nightShift} name="Perm. N/S" radius={[0, 0, 0, 0]} maxBarSize={40} isAnimationActive={printingChartId === "all"}>
                  {!manyBars && <LabelList dataKey="nightRings" position="center" formatter={labelNonZero} fill="#fff" fontSize={11} fontWeight={800} />}
                </Bar>
                <Bar yAxisId="left" dataKey="tempRings" stackId="a" fill={chartColors.temporary} name="Temporary" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={printingChartId === "all"} />
                {segFilterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="ma7" stroke={chartColors.paid} strokeWidth={2} strokeDasharray="5 3" dot={false} name="MA 7 วัน" hide={!!hiddenSeries.ma7} isAnimationActive={printingChartId === "all"} />}
                {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="planAcc" stroke={chartColors.planned} strokeWidth={2} dot={segChartData.length === 1 ? { r: 3, fill: chartColors.planned } : { r: 2, fill: chartColors.planned }} name="Plan Acc." hide={!!hiddenSeries.planAcc} isAnimationActive={printingChartId === "all"} />}
                {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="actualAcc" stroke={chartColors.actual} strokeWidth={3} dot={segChartData.length === 1 ? { r: 4, fill: chartColors.actual } : { r: 3, fill: chartColors.actual }} name="Actual Acc." label={renderActualEndLabel} hide={!!hiddenSeries.actualAcc} isAnimationActive={printingChartId === "all"} />}
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
                      <button type="button" onClick={() => toggleSeries('plan')} className={`flex items-center gap-1.5 sm:gap-2 ml-0 sm:ml-4 transition-opacity hover:opacity-70 ${hiddenSeries.plan ? 'opacity-30 line-through' : ''}`}><span className="w-5 h-1 md:w-6 md:h-1 rounded-full" style={{ backgroundColor: chartColors.axis }}></span>Plan Daily</button>
                      <button type="button" onClick={() => toggleSeries('ma7')} className={`flex items-center gap-1.5 sm:gap-2 transition-opacity hover:opacity-70 ${hiddenSeries.ma7 ? 'opacity-30 line-through' : ''}`}><span className="w-5 h-1 md:w-6 md:h-1 rounded-full" style={{ backgroundColor: chartColors.paid }}></span>MA 7 วัน</button>
                      <button type="button" onClick={() => toggleSeries('planAcc')} className={`flex items-center gap-1.5 sm:gap-2 transition-opacity hover:opacity-70 ${hiddenSeries.planAcc ? 'opacity-30 line-through' : ''}`}><span className="w-5 h-1 md:w-6 md:h-1 rounded-full" style={{ backgroundColor: chartColors.planned }}></span>Plan Acc.</button>
                      <button type="button" onClick={() => toggleSeries('actualAcc')} className={`flex items-center gap-1.5 sm:gap-2 transition-opacity hover:opacity-70 ${hiddenSeries.actualAcc ? 'opacity-30 line-through' : ''}`}><span className="w-5 h-1.5 md:w-6 md:h-1.5 rounded-full" style={{ backgroundColor: chartColors.actual }}></span>Actual Acc.</button>
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
                        {segFilterMode !== "daily" && <Line yAxisId="left" type="monotone" dataKey="plan" stroke={chartColors.axis} strokeWidth={2} dot={segChartData.length <= 24 ? { r: 0 } : { r: 2 }} name="Plan Daily" hide={!!hiddenSeries.plan} />}
                        <Bar yAxisId="left" dataKey="dayRings" stackId="a" fill={chartColors.dayShift} name="Perm. D/S" radius={[0, 0, 0, 0]} maxBarSize={40}>
                          {!manyBars && <LabelList dataKey="dayRings" position="center" formatter={labelNonZero} fill="#fff" fontSize={11} fontWeight={800} />}
                        </Bar>
                        <Bar yAxisId="left" dataKey="nightRings" stackId="a" fill={chartColors.nightShift} name="Perm. N/S" radius={[0, 0, 0, 0]} maxBarSize={40}>
                          {!manyBars && <LabelList dataKey="nightRings" position="center" formatter={labelNonZero} fill="#fff" fontSize={11} fontWeight={800} />}
                        </Bar>
                        <Bar yAxisId="left" dataKey="tempRings" stackId="a" fill={chartColors.temporary} name="Temporary" radius={[4, 4, 0, 0]} maxBarSize={40} />
                        {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="planAcc" stroke={chartColors.planned} strokeWidth={2} dot={segChartData.length === 1 ? { r: 3, fill: chartColors.planned } : { r: 2, fill: chartColors.planned }} name="Plan Acc." hide={!!hiddenSeries.planAcc} />}
                        {segFilterMode !== "daily" && <Line yAxisId="right" type="monotone" dataKey="actualAcc" stroke={chartColors.actual} strokeWidth={3} dot={segChartData.length === 1 ? { r: 4, fill: chartColors.actual } : { r: 3, fill: chartColors.actual }} name="Actual Acc." label={renderActualEndLabel} hide={!!hiddenSeries.actualAcc} />}
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
