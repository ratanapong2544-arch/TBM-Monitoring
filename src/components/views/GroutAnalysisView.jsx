import React, { useState, useMemo } from "react";
import { Droplet, Printer, Maximize2, X, RefreshCw, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip,
  Area, Line, ReferenceLine, BarChart, Bar, Cell, LabelList
} from "recharts";
import { chartColors, axisTick, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import { getRingNumeric } from "../../utils/helpers";
import { THEORETICAL_VOL, VOL_120, VOL_150, VOL_80, VOL_50 } from "../../utils/constants";
import SectionHeader from "../common/SectionHeader";
import StatCard from "../common/StatCard";
import { fitAndPrint } from "../../utils/printFit";

export default function GroutAnalysisView({ groutRecords = [], readOnly = false }) {
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

  // ── Grout Filter State ──
  const [groutFilterMode, setGroutFilterMode] = useState("all");
  const [groutChartWindow, setGroutChartWindow] = useState(20);
  const [groutRangeStart, setGroutRangeStart] = useState("");
  const [groutRangeEnd, setGroutRangeEnd] = useState("");
  const [groutFilterDate, setGroutFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [groutFilterMonth, setGroutFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [groutFilterShift, setGroutFilterShift] = useState("All");

  // ── Expand State ──
  const [expandedChart, setExpandedChart] = useState(null);

  // ── groutChartData useMemo ──
  const groutChartData = useMemo(() => {
    let baseData = groutFilterShift === "All" ? groutRecords : groutRecords.filter(r => r.shift === groutFilterShift);
    baseData = baseData.map(r => ({ ...r, displayRing: r.groutPass === "Re-Grout" ? `${r.ringNo} (Re)` : r.ringNo, pressure: r.pressure ? Number(r.pressure) : null }));

    if (groutFilterMode === "all") return baseData;
    if (groutFilterMode === "range" && groutRangeStart && groutRangeEnd) {
      const sn = getRingNumeric(groutRangeStart), en = getRingNumeric(groutRangeEnd);
      return baseData.filter(r => { const n = getRingNumeric(r.ringNo); return n >= sn && n <= en; }).sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
    }
    if (groutFilterMode === "daily") return baseData.filter(r => r.date && r.date.startsWith(groutFilterDate));
    if (groutFilterMode === "monthly") return baseData.filter(r => r.date && r.date.startsWith(groutFilterMonth));
    // lastN
    const start = Math.max(0, baseData.length - groutChartWindow);
    return baseData.slice(start);
  }, [groutRecords, groutFilterMode, groutChartWindow, groutRangeStart, groutRangeEnd, groutFilterDate, groutFilterMonth, groutFilterShift]);

  const groutQuality = useMemo(() => {
    const ringMap = new Map();
    groutRecords.forEach((r) => ringMap.set(r.ringNo, r)); // latest record per ring
    const rings = Array.from(ringMap.values());
    const uniqueRings = rings.length;
    const reGroutCount = rings.filter((r) => r.groutPass === "Re-Grout").length;
    const reGroutRate = uniqueRings > 0 ? (reGroutCount / uniqueRings) * 100 : 0;
    const ratios = rings.map((r) => Number(r.ratio || 0)).filter((v) => v > 0);
    const avgRatio = ratios.length > 0 ? ratios.reduce((s, v) => s + v, 0) / ratios.length : 0;
    const belowSpec = rings.filter((r) => Number(r.ratio || 0) > 0 && Number(r.ratio) < 100).length;
    return { uniqueRings, reGroutCount, reGroutRate, avgRatio, belowSpec };
  }, [groutRecords]);

  const ratioBuckets = useMemo(() => {
    const defs = [
      { name: "<80%", min: 0, max: 80, color: chartColors.delay },
      { name: "80–100%", min: 80, max: 100, color: chartColors.dayShift },
      { name: "100–120%", min: 100, max: 120, color: chartColors.actual },
      { name: "120–150%", min: 120, max: 150, color: chartColors.paid },
      { name: ">150%", min: 150, max: Infinity, color: "#a855f7" },
    ];
    const counts = defs.map((d) => ({ name: d.name, count: 0, color: d.color }));
    const ringMap = new Map();
    groutRecords.forEach((r) => ringMap.set(r.ringNo, r));
    Array.from(ringMap.values()).forEach((r) => {
      const v = Number(r.ratio || 0);
      if (v <= 0) return;
      const idx = defs.findIndex((d) => v >= d.min && v < d.max);
      if (idx >= 0) counts[idx].count++;
    });
    return counts;
  }, [groutRecords]);

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

      <section className="space-y-6">
        <SectionHeader title="Grout" subtitle="Grouting Records" icon={Droplet} />

        {/* ═══ SECTION 4: Grout Volume Trend ═══ */}
        <div className={`bg-surface rounded-card shadow-card border border-line p-5 sm:p-8 ${getPrintClass('grout')}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-ink text-lg flex items-center gap-2"><Droplet className="text-navy" size={22} /> Grout Volume Trend</h3>
              <div className="flex items-center gap-2 print:hidden">
                {!readOnly && (<button onClick={() => handlePrintSpecificChart('grout')} className="p-1.5 text-ink-3 hover:text-navy bg-surface-alt hover:bg-cyan-tint rounded-input transition-colors border border-line shadow-card" title="Print Chart"><Printer size={16} /></button>)}
                <button onClick={() => setExpandedChart('grout')} className="p-1.5 text-ink-3 hover:text-navy bg-surface-alt hover:bg-cyan-tint rounded-input transition-colors border border-line shadow-card" title="Expand Chart"><Maximize2 size={16} /></button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full lg:w-auto bg-surface-alt p-2 rounded-input border border-line print:hidden">
              <div className="flex bg-surface rounded-input p-1 border border-line shadow-card w-full sm:w-auto overflow-x-auto">
                {["all", "lastN", "daily", "monthly", "range"].map(m => (
                  <button key={m} onClick={() => setGroutFilterMode(m)} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-input font-semibold transition whitespace-nowrap ${groutFilterMode === m ? "bg-navy text-white shadow" : "text-ink-2 hover:bg-surface-alt"}`}>{m === "all" ? "All" : m === "lastN" ? "Last N" : m === "daily" ? "Daily" : m === "monthly" ? "Monthly" : "Range"}</button>
                ))}
              </div>
              {groutFilterMode === "lastN" && (
                <div className="flex gap-1 w-full sm:w-auto overflow-x-auto">
                  {[10, 20, 50, 100].map(val => (
                    <button key={val} onClick={() => setGroutChartWindow(val)} className={`px-3 py-1.5 text-xs rounded-input font-semibold border transition whitespace-nowrap ${groutChartWindow === val ? "bg-cyan-tint border-navy text-navy" : "bg-surface border-line text-ink-2 hover:bg-surface-alt"}`}>Last {val}</button>
                  ))}
                </div>
              )}
              {groutFilterMode === "daily" && <input type="date" value={groutFilterDate} onChange={e => setGroutFilterDate(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink w-full sm:w-auto bg-surface" />}
              {groutFilterMode === "monthly" && <input type="month" value={groutFilterMonth} onChange={e => setGroutFilterMonth(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink w-full sm:w-auto bg-surface" />}
              {groutFilterMode === "range" && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input type="text" value={groutRangeStart} onChange={e => setGroutRangeStart(e.target.value)} placeholder="P1" className="px-2 py-1.5 w-full sm:w-16 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none uppercase text-ink text-center bg-surface" />
                  <span className="text-ink-3">-</span>
                  <input type="text" value={groutRangeEnd} onChange={e => setGroutRangeEnd(e.target.value)} placeholder="P10" className="px-2 py-1.5 w-full sm:w-16 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none uppercase text-ink text-center bg-surface" />
                </div>
              )}
              <div className="w-px h-6 bg-line hidden sm:block"></div>
              <select value={groutFilterShift} onChange={e => setGroutFilterShift(e.target.value)} className="px-3 py-1.5 text-xs font-semibold border border-line rounded-input focus:ring-1 focus:ring-navy outline-none text-ink bg-surface cursor-pointer w-full sm:w-auto">
                <option value="All">All Shifts</option><option value="Day">Day Shift</option><option value="Night">Night Shift</option>
              </select>
            </div>
          </div>

          {/* ── Pressure Chart (Top) ── */}
          <div className="w-full" style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={groutChartData} margin={{ top: 20, right: 25, left: -10, bottom: 0 }} syncId="groutSync">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="displayRing" tick={false} axisLine={false} tickLine={false} height={0} />
                <YAxis domain={[0, 'auto']} tick={axisTick} axisLine={false} tickLine={false} label={{ value: "Pressure (bar)", angle: -90, position: "insideLeft", offset: 15, style: { fontSize: 13, fill: chartColors.axisLabel, fontWeight: "bold" } }} />
                <Tooltip {...tooltipStyle} />
                <ReferenceLine y={3.5} stroke="#a855f7" strokeDasharray="8 4" strokeWidth={2} label={{ position: "insideTopLeft", value: "Baseline 3.5 bar", fill: "#a855f7", fontSize: 11, fontWeight: "bold" }} />
                <Line type="monotone" dataKey="pressure" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 4, fill: "#e11d48", stroke: "#fff", strokeWidth: 2 }} connectNulls={true} isAnimationActive={printingChartId === "all"} name="Pressure (bar)" label={{ position: "top", fill: "#e11d48", fontSize: 11, fontWeight: 800, formatter: val => val != null ? Number(val).toFixed(1) : '' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* ── Volume Chart (Bottom) ── */}
          <div className="w-full" style={{ height: 310 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={groutChartData} margin={{ top: 15, right: 25, left: -10, bottom: 5 }} syncId="groutSync">
                <defs>
                  <linearGradient id="execColorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.nightShift} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={chartColors.nightShift} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="displayRing" tick={axisTick} axisLine={false} tickLine={false} label={{ value: "Ring No.", position: "insideBottomRight", offset: -5, style: { fontSize: 12, fill: chartColors.axisLabel, fontWeight: "bold" } }} />
                <YAxis domain={[0, 6]} tick={axisTick} axisLine={false} tickLine={false} label={{ value: "Volume (m³)", angle: -90, position: "insideLeft", offset: 15, style: { fontSize: 13, fill: chartColors.nightShift, fontWeight: "bold" } }} />
                <Tooltip {...tooltipStyle} />
                <ReferenceLine y={THEORETICAL_VOL} stroke="#FB923C" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "100% (3.1)", fill: "#FB923C", fontSize: 11, fontWeight: "bold" }} />
                <ReferenceLine y={VOL_120} stroke="#4ADE80" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "120%", fill: "#4ADE80", fontSize: 11, fontWeight: "bold" }} />
                <ReferenceLine y={VOL_150} stroke="#F472B6" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "150%", fill: "#F472B6", fontSize: 11, fontWeight: "bold" }} />
                <ReferenceLine y={VOL_80} stroke="#EAB308" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "80%", fill: "#EAB308", fontSize: 11, fontWeight: "bold" }} />
                <ReferenceLine y={VOL_50} stroke="#EF4444" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "50%", fill: "#EF4444", fontSize: 11, fontWeight: "bold" }} />
                <Area type="monotone" dataKey="total" stroke={chartColors.nightShift} strokeWidth={3} fill="url(#execColorTotal)" dot={{ r: 4, fill: chartColors.nightShift, stroke: "#fff", strokeWidth: 2 }} label={{ position: "top", fill: chartColors.axisLabel, fontSize: 11, fontWeight: 700, formatter: val => Number(val || 0).toFixed(2) }} isAnimationActive={printingChartId === "all"} name="Grout Volume (m³)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── Grout Quality summary ── (ซ่อนตอนปริ้นกราฟเดี่ยว เพื่อให้ออกหน้าเดียว) */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${printingChartId !== "all" ? "print:hidden" : ""}`}>
        <StatCard label="Re-grout rate" value={`${groutQuality.reGroutRate.toFixed(1)}%`} subtext={`${groutQuality.reGroutCount} จาก ${groutQuality.uniqueRings} rings`} color="text-code-d" valueColor={groutQuality.reGroutRate > 10 ? "text-code-d" : "text-sgreen-dark"} icon={RefreshCw} />
        <StatCard label="เฉลี่ย Ratio" value={`${groutQuality.avgRatio.toFixed(1)}%`} subtext="อัตราส่วนน้ำยาเฉลี่ยทุก ring" color="text-navy" valueColor={groutQuality.avgRatio >= 100 ? "text-sgreen-dark" : "text-code-d"} icon={Droplet} />
        <StatCard label="Rings < 100%" value={`${groutQuality.belowSpec} rings`} subtext="ต่ำกว่าทฤษฎี (ควรตรวจ)" color="text-code-c" valueColor={groutQuality.belowSpec > 0 ? "text-code-c" : "text-sgreen-dark"} icon={BarChart3} />
      </div>

      {/* ── Ratio distribution histogram ── (ซ่อนตอนปริ้นกราฟเดี่ยว) */}
      <div className={`bg-surface rounded-card p-6 shadow-card border border-line ${printingChartId !== "all" ? "print:hidden" : ""}`}>
        <h3 className="font-semibold text-ink text-base mb-1">การกระจายของ Grout Ratio</h3>
        <p className="text-xs text-ink-3 font-semibold mb-4">จำนวน rings ในแต่ละช่วง % เทียบทฤษฎี (3.1 m³ = 100%)</p>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ratioBuckets} margin={{ top: 20, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
              <XAxis dataKey="name" tick={axisTick} stroke={chartColors.axis} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} label={{ value: "จำนวน rings", angle: -90, position: "insideLeft", fill: chartColors.axisLabel, fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {ratioBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 700, fill: chartColors.axisLabel }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ Chart Expansion Modal ═══ */}
      {expandedChart === 'grout' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8 bg-navy-dark/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-surface rounded-modal w-full h-full max-w-[1400px] max-h-[90vh] shadow-modal overflow-hidden flex flex-col">
            <div className="bg-navy-dark px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Droplet size={20} /> Grout Volume Trend
              </h3>
              <button onClick={() => setExpandedChart(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-4 sm:p-6 flex-1 overflow-hidden flex flex-col bg-surface-alt">
              <div className="flex-1 w-full h-full bg-surface rounded-input border border-line shadow-card p-4 sm:p-6">
                <div className="w-full h-full flex flex-col">
                  <div className="flex justify-center shrink-0 mb-4">
                    <div className="flex flex-wrap gap-4 sm:gap-6 items-center bg-surface-alt px-4 sm:px-6 py-3 rounded-input border border-line shadow-card">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-badge opacity-60" style={{ backgroundColor: chartColors.nightShift }}></span>
                        <span className="text-[10px] sm:text-xs font-semibold text-ink">Grout Volume</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-0 border-t-2 border-solid border-[#e11d48]"></span>
                        <span className="text-[10px] sm:text-xs font-semibold text-[#e11d48]">Pressure (bar)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-0 border-t-2 border-dashed border-[#a855f7]"></span>
                        <span className="text-[10px] sm:text-xs font-semibold text-[#a855f7]">Baseline 3.5 bar</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-0 border-t-2 border-dashed border-[#FB923C]"></span>
                        <span className="text-[10px] sm:text-xs font-semibold text-ink-2">Theoretical (100%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-0 border-t-2 border-dashed border-[#4ADE80]"></span>
                        <span className="text-[10px] sm:text-xs font-semibold text-ink-2">120%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-0 border-t-2 border-dashed border-[#F472B6]"></span>
                        <span className="text-[10px] sm:text-xs font-semibold text-ink-2">150%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-0 border-t-2 border-dashed border-[#EAB308]"></span>
                        <span className="text-[10px] sm:text-xs font-semibold text-ink-2">80%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-0 border-t-2 border-dashed border-[#EF4444]"></span>
                        <span className="text-[10px] sm:text-xs font-semibold text-ink-2">50%</span>
                      </div>
                    </div>
                  </div>
                  {/* ── Pressure Chart (Top) ── */}
                  <div className="w-full" style={{ height: 200 }}>
                    <ResponsiveContainer>
                      <ComposedChart data={groutChartData} margin={{ top: 20, right: 25, left: -10, bottom: 0 }} syncId="groutSyncPop">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                        <XAxis dataKey="displayRing" tick={false} axisLine={false} tickLine={false} height={0} />
                        <YAxis domain={[0, 'auto']} tick={axisTick} axisLine={false} tickLine={false} label={{ value: "Pressure (bar)", angle: -90, position: "insideLeft", offset: 15, style: { fontSize: 13, fill: chartColors.axisLabel, fontWeight: "bold" } }} />
                        <Tooltip {...tooltipStyle} />
                        <ReferenceLine y={3.5} stroke="#a855f7" strokeDasharray="8 4" strokeWidth={2} label={{ position: "insideTopLeft", value: "Baseline 3.5 bar", fill: "#a855f7", fontSize: 12, fontWeight: "bold" }} />
                        <Line type="monotone" dataKey="pressure" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 4, fill: "#e11d48", stroke: "#fff", strokeWidth: 2 }} connectNulls={true} name="Pressure (bar)" label={{ position: "top", fill: "#e11d48", fontSize: 11, fontWeight: 800, formatter: val => val != null ? Number(val).toFixed(1) : '' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {/* ── Volume Chart (Bottom) ── */}
                  <div className="flex-1 w-full min-h-[350px]">
                    <ResponsiveContainer>
                      <ComposedChart data={groutChartData} margin={{ top: 15, right: 25, left: -10, bottom: 5 }} syncId="groutSyncPop">
                        <defs>
                          <linearGradient id="execColorTotalPop" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartColors.nightShift} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={chartColors.nightShift} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                        <XAxis dataKey="displayRing" tick={axisTick} axisLine={false} tickLine={false} label={{ value: "Ring No.", position: "insideBottomRight", offset: -5, style: { fontSize: 12, fill: chartColors.axisLabel, fontWeight: "bold" } }} />
                        <YAxis domain={[0, 6]} tick={axisTick} axisLine={false} tickLine={false} label={{ value: "Volume (m³)", angle: -90, position: "insideLeft", offset: 15, style: { fontSize: 13, fill: chartColors.nightShift, fontWeight: "bold" } }} />
                        <Tooltip {...tooltipStyle} />
                        <ReferenceLine y={THEORETICAL_VOL} stroke="#FB923C" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "100% (3.1)", fill: "#FB923C", fontSize: 11, fontWeight: "bold" }} />
                        <ReferenceLine y={VOL_120} stroke="#4ADE80" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "120%", fill: "#4ADE80", fontSize: 11, fontWeight: "bold" }} />
                        <ReferenceLine y={VOL_150} stroke="#F472B6" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "150%", fill: "#F472B6", fontSize: 11, fontWeight: "bold" }} />
                        <ReferenceLine y={VOL_80} stroke="#EAB308" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "80%", fill: "#EAB308", fontSize: 11, fontWeight: "bold" }} />
                        <ReferenceLine y={VOL_50} stroke="#EF4444" strokeDasharray="5 5" label={{ position: "insideTopRight", value: "50%", fill: "#EF4444", fontSize: 11, fontWeight: "bold" }} />
                        <Area type="monotone" dataKey="total" stroke={chartColors.nightShift} strokeWidth={3} fill="url(#execColorTotalPop)" dot={{ r: 4, fill: chartColors.nightShift, stroke: "#fff", strokeWidth: 2 }} label={{ position: "top", fill: chartColors.axisLabel, fontSize: 11, fontWeight: 700, formatter: val => Number(val || 0).toFixed(2) }} name="Grout Volume (m³)" />
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
