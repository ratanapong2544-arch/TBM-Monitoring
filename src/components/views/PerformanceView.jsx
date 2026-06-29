import React, { useMemo } from "react";
import { Gauge, Clock, AlertTriangle, Wrench, Activity, Timer, Layers, Zap } from "lucide-react";
import { filterByState } from "../../hooks/useGlobalFilter";
import SectionHeader from "../common/SectionHeader";
import StatCard from "../common/StatCard";
import { formatDisplayTime, formatDisplayDate } from "../../utils/formatters";
import { getRingNumeric, shiftEventMinutes, getLogicalShiftDate } from "../../utils/helpers";
import { chartColors, axisTick, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import { computeMuckImpact } from "../../utils/muckStats";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend, LabelList,
} from "recharts";

const SHIFT_MINUTES = 720;
const RECENT_RINGS = 20;
const CYCLE_MAX_MIN = 1440;

const CAT = {
  // Operating (Excavation + Segment Erection) is NOT summed from events — those categories
  // aren't persisted in saved events; Operating is derived from segment timestamps below.
  support: ["Locomotive / Rail System", "Survey", "Other 1", "Other 2"],
  delay: ["Power Supply", "TBM Equipment", "Clean Area", "Muck Full", "Other 3"],
  maintenance: ["Cleaning Belt conveyor", "Service / Maintenance", "Other 4"],
};

const fmt1 = (v) => Number(v || 0).toFixed(1);

export default function PerformanceView({ segmentRecords = [], shiftReports = [], filterState = {} }) {
  const filteredSegments = useMemo(() => filterByState(segmentRecords, filterState), [segmentRecords, filterState]);
  const filteredShiftReports = useMemo(() => filterByState(shiftReports, filterState), [shiftReports, filterState]);

  const util = useMemo(() => {
    // Operating (Excavation + Segment Erection) from SEGMENT timestamps, attributed per shift.
    // Shift-report events do NOT persist these — they are auto-derived from segments at display
    // time (mirror ShiftReportView). So we recompute per (logical date + shift) here.
    const fdt = formatDisplayTime;
    const shiftFor = (timeStr, explicitShift, recShift) => {
      if (explicitShift) return explicitShift;
      if (timeStr) { const h = Number(timeStr.split(":")[0]); if (!isNaN(h)) return h >= 7 && h < 19 ? "Day" : "Night"; }
      return recShift;
    };
    // Per-event minutes via shiftEventMinutes (clamps to the shift window [0,720]) so Operating
    // matches the auto-derived Excavation/Erection totals shown in ShiftReportView.
    const shiftOp = {};
    const segMap = new Map();
    filteredSegments.forEach((r) => segMap.set(r.ringNo, r));
    Array.from(segMap.values()).forEach((rec) => {
      const exStart = fdt(rec.excavStartTime), exEnd = fdt(rec.excavEndTime);
      if (exStart && exEnd) {
        const exShift = shiftFor(exStart, rec.excavShift, rec.shift);
        const exDate = getLogicalShiftDate(exStart, exShift, rec.date, rec.shift);
        shiftOp[`${exDate}__${exShift}`] = (shiftOp[`${exDate}__${exShift}`] || 0) + shiftEventMinutes(exStart, exEnd, exShift);
      }
      // honor legacy install field aliases (startTime/endTime), like ShiftReportView
      const inStart = fdt(rec.installStartTime || rec.startTime), inEnd = fdt(rec.installEndTime || rec.endTime);
      if (inStart && inEnd) {
        const inShift = shiftFor(inStart, rec.installShift, rec.shift);
        const inDate = getLogicalShiftDate(inStart, inShift, rec.date, rec.shift);
        shiftOp[`${inDate}__${inShift}`] = (shiftOp[`${inDate}__${inShift}`] || 0) + shiftEventMinutes(inStart, inEnd, inShift);
      }
    });

    const catMin = {};
    let shifts = 0;
    let operating = 0;
    filteredShiftReports.forEach((r) => {
      shifts += 1;
      const events = r.events || {};
      Object.keys(events).forEach((cat) => {
        const arr = Array.isArray(events[cat]) ? events[cat] : [];
        const mins = arr.reduce((s, ev) => s + shiftEventMinutes(ev.start, ev.end, r.shift), 0);
        catMin[cat] = (catMin[cat] || 0) + mins;
      });
      operating += Math.min(SHIFT_MINUTES, shiftOp[`${formatDisplayDate(r.date)}__${r.shift}`] || 0);
    });
    const sumGroup = (keys) => keys.reduce((s, k) => s + (catMin[k] || 0), 0);
    const support = sumGroup(CAT.support);
    const delay = sumGroup(CAT.delay);
    const maintenance = sumGroup(CAT.maintenance);
    const available = SHIFT_MINUTES * shifts;
    const idle = Math.max(0, available - (operating + support + delay + maintenance));
    const utilizationPct = available > 0 ? (operating / available) * 100 : null;

    const delayItems = CAT.delay
      .map((k) => ({ name: k, minutes: catMin[k] || 0 }))
      .filter((d) => d.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    const delayTotal = delayItems.reduce((s, d) => s + d.minutes, 0);
    let cum = 0;
    const pareto = delayItems.map((d) => {
      cum += d.minutes;
      return { name: d.name, hours: +(d.minutes / 60).toFixed(2), cumPct: delayTotal > 0 ? +((cum / delayTotal) * 100).toFixed(1) : 0 };
    });

    const donut = [
      { name: "Operating", value: operating, color: chartColors.planned },
      { name: "Support", value: support, color: chartColors.paid },
      { name: "Delay", value: delay, color: chartColors.delay },
      { name: "Maintenance", value: maintenance, color: chartColors.dayShift },
      { name: "Idle", value: idle, color: chartColors.temporary },
    ].filter((d) => d.value > 0);

    return {
      shifts, operating, delay, maintenance, available, utilizationPct, pareto, donut,
      delayHours: delay / 60, maintHours: maintenance / 60,
      avgOperatingPerShift: shifts > 0 ? operating / shifts / 60 : 0,
      catMin, delayItems,
    };
  }, [filteredShiftReports, filteredSegments]);

  const cycle = useMemo(() => {
    const durMin = (a, b) => {
      const p = (t) => {
        if (!t) return null;
        const [h, m] = formatDisplayTime(t).split(":").map(Number);
        return isNaN(h) || isNaN(m) ? null : h * 60 + m;
      };
      let A = p(a);
      let B = p(b);
      if (A === null || B === null) return null;
      if (B < A) B += 24 * 60;
      return B - A;
    };
    const map = new Map();
    filteredSegments.forEach((r) => map.set(r.ringNo, r));
    const rows = [];
    let skipped = 0;
    Array.from(map.values()).forEach((r) => {
      const ex = durMin(r.excavStartTime, r.excavEndTime);
      const er = durMin(r.installStartTime, r.installEndTime);
      const wt0 = durMin(r.excavEndTime, r.installStartTime);
      if (ex === null || er === null || wt0 === null) { skipped += 1; return; }
      const wt = Math.max(0, wt0);
      const total = ex + wt + er;
      if (total > CYCLE_MAX_MIN) { skipped += 1; return; }
      rows.push({ ringNo: String(r.ringNo), num: getRingNumeric(r.ringNo), excav: ex, wait: wt, erect: er, total });
    });
    rows.sort((a, b) => a.num - b.num);
    const recent = rows.slice(-RECENT_RINGS).map((d) => ({
      ringNo: d.ringNo,
      excavH: +(d.excav / 60).toFixed(2),
      waitH: +(d.wait / 60).toFixed(2),
      erectH: +(d.erect / 60).toFixed(2),
      totalH: +(d.total / 60).toFixed(2),
    }));
    const n = rows.length;
    const avg = (sel) => (n > 0 ? rows.reduce((s, d) => s + sel(d), 0) / n / 60 : 0);
    let fastest = null;
    rows.forEach((d) => { if (!fastest || d.total < fastest.total) fastest = d; });
    return {
      recent, skipped, count: n,
      avgCycle: avg((d) => d.total), avgExcav: avg((d) => d.excav), avgErect: avg((d) => d.erect),
      fastestH: fastest ? +(fastest.total / 60).toFixed(1) : 0, fastestRing: fastest ? fastest.ringNo : "-",
    };
  }, [filteredSegments]);

  const muck = useMemo(
    () => computeMuckImpact({ catMin: util.catMin, delayItems: util.delayItems, avgCycleHours: cycle.avgCycle }),
    [util, cycle]
  );

  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in space-y-6">
      {muck.isTopCause && (
        <div className="rounded-card border px-4 py-3 flex items-center gap-2 shadow-card" style={{ background: "#faf4ec", borderColor: "#ead9c6" }}>
          <AlertTriangle size={18} style={{ color: chartColors.muck }} />
          <span className="text-sm font-bold" style={{ color: chartColors.muck }}>
            สาเหตุความล่าช้าอันดับ 1: ขนดิน (Muck Full) — เสีย {fmt1(muck.muckHours)} ชม. คิดเป็น {fmt1(muck.muckShare * 100)}% ของเวลา Delay ทั้งหมด
          </span>
        </div>
      )}
      {muck.hasData && (
        <div className="rounded-card border p-4 flex items-center gap-4 shadow-card" style={{ background: "#faf4ec", borderColor: "#ead9c6" }}>
          <span className="text-3xl" role="img" aria-label="muck">🪨</span>
          <div className="flex-1">
            <div className="text-xs font-bold" style={{ color: "#8a6a45" }}>
              เวลาเสียจากขนดิน (Muck Full){muck.equivRings !== null ? ` · ≈ ขุดได้อีก ${muck.equivRings} ริง` : ""}
            </div>
            <div className="mt-0.5">
              <span className="text-2xl font-bold font-mono" style={{ color: chartColors.muck }}>{fmt1(muck.muckHours)} ชม.</span>
              <span className="text-sm font-semibold text-ink-3"> · {fmt1(muck.muckShare * 100)}% ของเวลา Delay ทั้งหมด</span>
            </div>
          </div>
        </div>
      )}
      <section className="space-y-4">
        <SectionHeader title="Utilization & Downtime" subtitle="การใช้งานเครื่อง & เวลาสูญเสีย" icon={Gauge} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Utilization" value={util.utilizationPct === null ? "—" : `${fmt1(util.utilizationPct)}%`} subtext="ขุด+ประกอบ ÷ เวลาทั้งหมด" color="text-sgreen-dark" valueColor="text-sgreen-dark" icon={Gauge} />
          <StatCard label="Delay รวม" value={`${fmt1(util.delayHours)} ชม.`} subtext={`${util.available > 0 ? fmt1((util.delay / util.available) * 100) : 0}% ของเวลาทั้งหมด`} color="text-code-d" valueColor="text-code-d" icon={AlertTriangle} />
          <StatCard label="Maintenance" value={`${fmt1(util.maintHours)} ชม.`} subtext={`${util.available > 0 ? fmt1((util.maintenance / util.available) * 100) : 0}% ของเวลาทั้งหมด`} color="text-code-c" valueColor="text-code-c" icon={Wrench} />
          <StatCard label="เฉลี่ย Operating/กะ" value={`${fmt1(util.avgOperatingPerShift)} ชม.`} subtext={`จาก ${util.shifts} กะ (กะละ 12 ชม.)`} color="text-navy" valueColor="text-navy" icon={Activity} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface rounded-card p-6 shadow-card border border-line">
            <h3 className="font-semibold text-ink text-base mb-1">สัดส่วนการใช้เวลา</h3>
            <p className="text-xs text-ink-3 font-semibold mb-4">Time Breakdown — รวมทุกกะในช่วงที่เลือก</p>
            {util.donut.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-ink-3 text-sm">ยังไม่มีข้อมูล Shift Report ในช่วงนี้</div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-44 h-44 shrink-0 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={util.donut} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value" stroke="none">
                        {util.donut.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} formatter={(v) => [`${fmt1(v / 60)} ชม.`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-semibold font-mono text-sgreen-dark">{util.utilizationPct === null ? "—" : `${Math.round(util.utilizationPct)}%`}</span>
                    <span className="text-[10px] font-semibold text-ink-3 uppercase">Operating</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2 w-full">
                  {util.donut.map((d, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <span className="w-3 h-3 rounded-badge shrink-0" style={{ backgroundColor: d.color }}></span>
                      <span className="text-ink-2 font-semibold flex-1">{d.name === "Operating" ? "Operating (ขุด+ประกอบ)" : d.name === "Idle" ? "Idle / ไม่ได้บันทึก" : d.name}</span>
                      <span className="font-semibold font-mono text-ink">{util.available > 0 ? Math.round((d.value / util.available) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-surface rounded-card p-6 shadow-card border border-line">
            <h3 className="font-semibold text-ink text-base mb-1">Downtime Pareto — สาเหตุเวลาสูญเสีย</h3>
            <p className="text-xs text-ink-3 font-semibold mb-4">กลุ่ม Delay เรียงมาก→น้อย + เส้นสะสม %</p>
            {util.pareto.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-ink-3 text-sm">ไม่มี Delay ที่บันทึกในช่วงนี้ 🎉</div>
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={util.pareto} margin={{ top: 16, right: 16, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                    <XAxis dataKey="name" tick={axisTick} angle={-30} textAnchor="end" height={60} interval={0} stroke={chartColors.axis} />
                    <YAxis yAxisId="l" tick={axisTick} axisLine={false} tickLine={false} label={{ value: "ชม.", angle: -90, position: "insideLeft", fill: chartColors.axisLabel, fontSize: 11 }} />
                    <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip {...tooltipStyle} />
                    <Bar yAxisId="l" dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={48} name="ชั่วโมง">
                      {util.pareto.map((entry, i) => (
                        <Cell key={i} fill={entry.name === "Muck Full" ? chartColors.muck : chartColors.delay} />
                      ))}
                    </Bar>
                    <Line yAxisId="r" type="monotone" dataKey="cumPct" stroke={chartColors.planned} strokeWidth={2} dot={{ r: 3, fill: chartColors.planned }} name="สะสม %" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Cycle Time" subtitle="รอบเวลาการทำงานต่อ ring" icon={Clock} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="avg Cycle/ring" value={`${fmt1(cycle.avgCycle)} ชม.`} subtext="ขุด+รอ+ประกอบ" color="text-navy" valueColor="text-navy" icon={Clock} />
          <StatCard label="avg ขุด" value={`${fmt1(cycle.avgExcav)} ชม.`} subtext="Excavation" color="text-navy" valueColor="text-navy" icon={Timer} />
          <StatCard label="avg ประกอบ" value={`${fmt1(cycle.avgErect)} ชม.`} subtext="Segment Erection" color="text-cyan-med" valueColor="text-cyan-med" icon={Layers} />
          <StatCard label="เร็วสุด" value={`${fmt1(cycle.fastestH)} ชม.`} subtext={`ring ${cycle.fastestRing}`} color="text-sgreen-dark" valueColor="text-sgreen-dark" icon={Zap} />
        </div>
        <div className="bg-surface rounded-card p-6 shadow-card border border-line">
          <h3 className="font-semibold text-ink text-base">Cycle Time ต่อ ring (ย้อนหลัง {RECENT_RINGS} rings)</h3>
          <p className="text-xs text-ink-3 font-semibold mb-4">แต่ละแท่ง = 1 ring · ซ้อน ขุด → รอ → ประกอบ{cycle.skipped > 0 ? ` · ข้าม ${cycle.skipped} rings (เวลาไม่ครบ)` : ""}</p>
          {cycle.recent.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-ink-3 text-sm">ยังไม่มี ring ที่เวลาครบในช่วงนี้</div>
          ) : (
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cycle.recent} margin={{ top: 20, right: 16, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                  <XAxis dataKey="ringNo" tick={axisTick} angle={-45} textAnchor="end" height={56} interval={0} stroke={chartColors.axis} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} label={{ value: "ชั่วโมง", angle: -90, position: "insideLeft", fill: chartColors.axisLabel, fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v} ชม.`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                  <Bar dataKey="excavH" stackId="c" fill={chartColors.planned} name="ขุด" maxBarSize={40} />
                  <Bar dataKey="waitH" stackId="c" fill={chartColors.dayShift} name="รอ/regrip" maxBarSize={40} />
                  <Bar dataKey="erectH" stackId="c" fill={chartColors.paid} name="ประกอบ" radius={[3, 3, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="totalH" position="top" style={{ fontSize: 10, fontWeight: 700, fill: chartColors.axisLabel }} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
