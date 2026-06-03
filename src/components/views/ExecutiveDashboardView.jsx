import React, { useState, useMemo } from "react";
import { TrendingUp, Layers, Activity, MapPin, Droplet, BarChart3, Printer } from "lucide-react";
import StatCard from "../common/StatCard";
import SectionHeader from "../common/SectionHeader";
import GlobalFilterBar from "../common/GlobalFilterBar";
import useGlobalFilter from "../../hooks/useGlobalFilter";
import { formatDisplayDate } from "../../utils/formatters";
import { getRingNumeric, calculateSoilVolume } from "../../utils/helpers";
import { TOTAL_ROUTE_DISTANCE } from "../../utils/constants";
import { chartColors, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

const ExecutiveDashboardView = ({ segmentRecords, groutRecords }) => {
  const { state: gfState, setters: gfSetters, filteredSegments, filteredGrout } = useGlobalFilter(segmentRecords, groutRecords);

  const [printingChartId, setPrintingChartId] = useState("all");

  const handlePrintSpecificChart = (chartId) => {
    setPrintingChartId(chartId);
    // หน่วงเวลาให้ Recharts.ResponsiveContainer ได้คำนวณ width ตามหน้าจอแบบเต็มที่ก่อนจะ Print
    setTimeout(() => {
      window.print();
      setPrintingChartId("all");
    }, 600);
  };

  const getPrintClass = (id) => {
    return printingChartId === "all" ? "" : (printingChartId === id ? "print-target" : "print:hidden");
  };

  // ══════════════════════════════════════════════
  // HELPER: Smart deduplicate — เลือก Completed ก่อน, ถ้าไม่มีใช้แถวสุดท้าย
  // ══════════════════════════════════════════════
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

  // ══════════════════════════════════════════════
  // SECTION: Overall KPI Stats (all data)
  // ══════════════════════════════════════════════

  const overallStats = useMemo(() => {
    // Deduplicate ทุก records ก่อน (เลือก Completed ก่อน In Progress)
    const allDeduped = deduplicateRecords(filteredSegments);

    const permRings = allDeduped.filter(r => r.installType !== "Temporary");
    const tempRings = allDeduped.filter(r => r.installType === "Temporary");

    // คำนวณระยะทางรวมจากทุก ring ถาวรจริงๆ ตามฐานข้อมูล
    const totalDistance = permRings.reduce((sum, r) => sum + parseFloat(r.length || 0), 0);
    const totalSoilVol = permRings.reduce((sum, r) => sum + parseFloat(r.soilVolume || calculateSoilVolume(r.length)), 0);

    const dates = [...new Set(permRings.map(r => formatDisplayDate(r.date)))];
    const avgRings = dates.length > 0 ? (permRings.length / dates.length).toFixed(1) : 0;
    const avgDist = dates.length > 0 ? (totalDistance / dates.length).toFixed(1) : 0;

    let currentCH = "-";
    if (permRings.length > 0) {
      const withCH = permRings.filter(r => r.finishCH);
      if (withCH.length > 0) currentCH = withCH[withCH.length - 1].finishCH;
    }

    // Grout stats
    const groutAvgVol = filteredGrout.length > 0
      ? (filteredGrout.reduce((acc, r) => acc + Number(r.total || 0), 0) / filteredGrout.length).toFixed(2)
      : "0.00";
    const groutAvgRatio = filteredGrout.length > 0
      ? (filteredGrout.reduce((acc, r) => acc + Number(r.ratio || 0), 0) / filteredGrout.length).toFixed(1)
      : "0.0";
    const uniqueGroutedRings = new Set(filteredGrout.map(r => r.ringNo)).size;
    const latestGroutRing = filteredGrout.length > 0 ? String(filteredGrout[filteredGrout.length - 1].ringNo) : "-";

    return {
      permRings: permRings.length, tempRings: tempRings.length,
      totalRings: permRings.length + tempRings.length,
      totalDistance, totalSoilVol, avgRings, avgDist, currentCH,
      groutAvgVol, groutAvgRatio, uniqueGroutedRings, latestGroutRing
    };
  }, [filteredSegments, filteredGrout]);

  // Plan variance: planned distance accumulated to current month (from tbmDistancePlanConfig)
  // vs actual. Mirrors the Route page's monthly plan accumulation. null when no plan set.
  const planVariance = useMemo(() => {
    let cfg = { ranges: [] };
    try { const s = localStorage.getItem("tbmDistancePlanConfig"); if (s) { const p = JSON.parse(s); cfg = { ...cfg, ...p, ranges: p.ranges || [] }; } } catch (e) {}
    if (!cfg.ranges || cfg.ranges.length === 0) return null;
    const nowTH = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const currentMonth = `${nowTH.getFullYear()}-${String(nowTH.getMonth() + 1).padStart(2, "0")}`;
    let cur = "2024-11", planAcc = 0, loop = 0;
    while (cur <= currentMonth && loop < 200) {
      let mPlan = 0;
      for (const r of cfg.ranges) {
        if ((!r.startMonth || cur >= r.startMonth) && (!r.endMonth || cur <= r.endMonth)) {
          mPlan = (r.mode === "distance")
            ? (parseFloat(r.distancePerMonth) || 0)
            : (parseFloat(r.ringsPerDay) || 0) * (parseFloat(r.avgLength) || 1.2) * 30;
          break;
        }
      }
      planAcc += mPlan;
      if (planAcc > TOTAL_ROUTE_DISTANCE) planAcc = TOTAL_ROUTE_DISTANCE;
      const [y, m] = cur.split("-"); let ny = +y, nm = +m + 1; if (nm > 12) { nm = 1; ny++; } cur = `${ny}-${String(nm).padStart(2, "0")}`; loop++;
    }
    if (planAcc <= 0) return null;
    const actual = overallStats.totalDistance;
    return { planToNow: planAcc, variance: actual - planAcc, behind: actual - planAcc < 0 };
  }, [overallStats.totalDistance]);

  // ══════════════════════════════════════════════
  // SECTION: Grout Pending
  // ══════════════════════════════════════════════

  const groutPending = useMemo(() => {
    const completedSegs = filteredSegments.filter(s => s.status === "Completed");
    const latestSeg = completedSegs.length > 0 ? String(completedSegs[completedSegs.length - 1].ringNo) : "-";
    const latestGrout = filteredGrout.length > 0 ? String(filteredGrout[filteredGrout.length - 1].ringNo) : "-";
    let pending = 0;
    if (latestSeg !== "-" && latestGrout !== "-") {
      pending = Math.max(0, getRingNumeric(latestSeg) - getRingNumeric(latestGrout));
    }
    return { pending, latestSeg, latestGrout };
  }, [filteredSegments, filteredGrout]);

  // ══════════════════════════════════════════════
  // SECTION: Day vs Night
  // ══════════════════════════════════════════════

  const shiftComparison = useMemo(() => {
    // Deduplicate ก่อนนับ เพื่อไม่ให้ ring ซ้ำนับ 2 รอบ
    const allDeduped = deduplicateRecords(filteredSegments);
    const permDeduped = allDeduped.filter(r => r.installType !== "Temporary");
    const dayCount = permDeduped.filter(r => (r.installShift || r.shift) === "Day").length;
    const nightCount = permDeduped.filter(r => (r.installShift || r.shift) === "Night").length;
    return [
      { name: "Day Shift", value: dayCount, color: chartColors.dayShift },
      { name: "Night Shift", value: nightCount, color: chartColors.nightShift }
    ];
  }, [filteredSegments]);

  return (
    <div className="max-w-full mx-auto space-y-8 sm:space-y-10 animate-fade-in pb-24 print:max-w-full print:w-full print:m-0 print:p-0 print:space-y-0 print:block">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { background: white !important; }
        }

        ${printingChartId !== "all" ? `
          body { overflow: hidden !important; }

          /* ขยาย Container เป้าหมายให้เต็มหน้าจอทันทีที่มีการคลิกปริ้น (บนหน้าจอจริง)
             เพื่อให้ Recharts.ResponsiveContainer จับขนาด Width 100% ก่อนส่งคำสั่งพิมพ์ */
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

          /* เมื่อบราวเซอร์เข้าสู่หน้า Preveiw Print แล้ว ให้ปรับเป็น Static เหมือนหน้าพิมพ์ปกติ */
          @media print {
            .print-target {
              position: static !important;
              padding: 0 !important;
            }
          }
        ` : ""}
      `}</style>

      {/* ═══ GLOBAL FILTER BAR ═══ */}
      <GlobalFilterBar state={gfState} setters={gfSetters} title="Global Dashboard Filter" subtitle="กรองข้อมูลภาพรวมทั้งหน้าหลัก" />

      <section className="space-y-6">
      <SectionHeader title="ภาพรวมโครงการ" subtitle="Project Overview" icon={BarChart3} />

      {/* ═══ SECTION 2: KPI Summary Cards ═══ */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${printingChartId !== 'all' ? 'print:hidden' : ''}`}>
        <StatCard label="Permanent Rings" value={overallStats.permRings} subtext={`+ ${overallStats.tempRings} Temp. (Total: ${overallStats.totalRings})`} color="text-sgreen-dark" icon={Layers} />
        <StatCard label="Total Distance" value={`${Number(overallStats.totalDistance || 0).toFixed(2)} m`} subtext={`ดินขุดรวม: ${Number(overallStats.totalSoilVol || 0).toFixed(2)} m³${planVariance ? (planVariance.behind ? ` · ⚠ ช้ากว่าแผน ${Math.abs(planVariance.variance).toLocaleString(undefined, { maximumFractionDigits: 1 })} ม.` : ` · นำแผน +${planVariance.variance.toLocaleString(undefined, { maximumFractionDigits: 1 })} ม.`) : ""}`} color="text-navy" icon={TrendingUp} />
        <StatCard label="Daily Average" value={`${overallStats.avgRings} Rings`} subtext={`~ ${overallStats.avgDist} m / day`} color="text-code-c" icon={Activity} />
        <StatCard label="Current Position" value={overallStats.currentCH} subtext="Latest Finish CH." color="text-cyan-med" icon={MapPin} />
        <StatCard label="Grout Avg Volume" value={`${overallStats.groutAvgVol} m³`} subtext={`ล่าสุด: ${overallStats.latestGroutRing} (${overallStats.uniqueGroutedRings} วง)`} color="text-cyan-med" icon={Droplet} />
        <StatCard
          label="Grout Avg Ratio"
          value={`${overallStats.groutAvgRatio}%`}
          valueColor={Number(overallStats.groutAvgRatio) > 150 ? "text-code-c" : Number(overallStats.groutAvgRatio) >= 100 ? "text-sgreen-dark" : "text-code-d"}
          color={Number(overallStats.groutAvgRatio) >= 100 ? "text-sgreen-dark" : "text-code-d"}
          icon={BarChart3}
          subtext="อัตราส่วนน้ำยาเฉลี่ยทุกวง"
        />
      </div>

      {/* ═══ SECTION 5: Grout Pending & Section 6: Shift Comparison ═══ */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${printingChartId !== 'all' && printingChartId !== 'pie' ? 'print:hidden' : ''}`}>
        {/* Grout Pending */}
        <div className={`rounded-card p-6 shadow-card border relative overflow-hidden ${printingChartId !== 'all' ? 'print:hidden' : ''} ${groutPending.pending > 0 ? "bg-code-d/10 border-code-d/30" : "bg-sgreen-med/10 border-sgreen-med/30"}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink text-base flex items-center gap-2"><Droplet size={20} className={groutPending.pending > 0 ? "text-code-d" : "text-sgreen-dark"} /> Grout Status</h3>
            <span className={`text-3xl font-semibold font-mono ${groutPending.pending > 0 ? "text-code-d" : "text-sgreen-dark"}`}>
              {groutPending.pending > 0 ? `${groutPending.pending} วงค้าง` : "ครบถ้วน ✓"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-surface/80 p-3 rounded-input border border-line">
              <div className="text-xs font-semibold text-ink-3 uppercase mb-1">Segment ล่าสุด</div>
              <div className="font-semibold font-mono text-ink text-lg">{groutPending.latestSeg}</div>
            </div>
            <div className="bg-surface/80 p-3 rounded-input border border-line">
              <div className="text-xs font-semibold text-ink-3 uppercase mb-1">Grout ล่าสุด</div>
              <div className="font-semibold font-mono text-ink text-lg">{groutPending.latestGrout}</div>
            </div>
          </div>
        </div>

        {/* Day vs Night */}
        <div className={`bg-surface rounded-card p-6 shadow-card border border-line relative ${getPrintClass('pie')}`}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-ink text-base">Day vs Night Shift</h3>
            <button onClick={() => handlePrintSpecificChart('pie')} className="p-1.5 text-ink-3 hover:text-navy bg-surface-alt hover:bg-cyan-tint rounded-input transition-colors border border-line shadow-card print:hidden" title="Print Chart"><Printer size={16} /></button>
          </div>
          <div className="flex items-center gap-4 print:items-center print:justify-center">
            <div className="w-32 h-32 sm:w-36 sm:h-36 shrink-0 print:w-[350px] print:h-[350px] transition-all">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={shiftComparison} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={4} dataKey="value" stroke="none" isAnimationActive={printingChartId === "all"}>
                    {shiftComparison.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {shiftComparison.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-badge shrink-0" style={{ backgroundColor: s.color }}></span>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-ink-2">{s.name}</div>
                    <div className="text-xl font-semibold font-mono text-ink">{s.value} <span className="text-xs font-semibold text-ink-3">Rings</span></div>
                  </div>
                  <div className="text-sm font-semibold font-mono text-ink-3">
                    {(shiftComparison[0].value + shiftComparison[1].value) > 0
                      ? ((s.value / (shiftComparison[0].value + shiftComparison[1].value)) * 100).toFixed(0) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      </section>

    </div>
  );
};

export default ExecutiveDashboardView;
