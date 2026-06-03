import React, { useMemo } from "react";
import { Gauge, Clock, AlertTriangle, Wrench, Activity, Timer, Layers, Zap } from "lucide-react";
import useGlobalFilter from "../../hooks/useGlobalFilter";
import GlobalFilterBar from "../common/GlobalFilterBar";
import SectionHeader from "../common/SectionHeader";
import StatCard from "../common/StatCard";
import { formatDisplayTime } from "../../utils/formatters";
import { getRingNumeric, shiftEventMinutes } from "../../utils/helpers";
import { chartColors, axisTick, tooltipStyle } from "../../ui-ux-pro-max/chartTheme";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend, LabelList,
} from "recharts";

const SHIFT_MINUTES = 720;
const RECENT_RINGS = 20;
const CYCLE_MAX_MIN = 1440;

const CAT = {
  operating: ["Excavation", "Segment Erection"],
  support: ["Locomotive / Rail System", "Survey", "Other 1", "Other 2"],
  delay: ["Power Supply", "TBM Equipment", "Clean Area", "Muck Full", "Other 3"],
  maintenance: ["Cleaning Belt conveyor", "Service / Maintenance", "Other 4"],
};

const fmt1 = (v) => Number(v || 0).toFixed(1);

export default function PerformanceView({ segmentRecords = [], shiftReports = [] }) {
  const { state: gfState, setters: gfSetters, filteredSegments, filteredShiftReports } =
    useGlobalFilter(segmentRecords, [], shiftReports);

  const util = useMemo(() => {
    const catMin = {};
    let shifts = 0;
    filteredShiftReports.forEach((r) => {
      shifts += 1;
      const events = r.events || {};
      Object.keys(events).forEach((cat) => {
        const arr = Array.isArray(events[cat]) ? events[cat] : [];
        const mins = arr.reduce((s, ev) => s + shiftEventMinutes(ev.start, ev.end, r.shift), 0);
        catMin[cat] = (catMin[cat] || 0) + mins;
      });
    });
    const sumGroup = (keys) => keys.reduce((s, k) => s + (catMin[k] || 0), 0);
    const operating = sumGroup(CAT.operating);
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
    };
  }, [filteredShiftReports]);

  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in space-y-6">
      <GlobalFilterBar state={gfState} setters={gfSetters} title="Performance Filter" subtitle="กรองช่วงเวลา (ใช้ฟิลเตอร์เดียวกับทั้งระบบ)" />

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
                    <Bar yAxisId="l" dataKey="hours" fill={chartColors.delay} radius={[4, 4, 0, 0]} maxBarSize={48} name="ชั่วโมง" />
                    <Line yAxisId="r" type="monotone" dataKey="cumPct" stroke={chartColors.planned} strokeWidth={2} dot={{ r: 3, fill: chartColors.planned }} name="สะสม %" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Cycle Time" subtitle="รอบเวลาการทำงานต่อวง" icon={Clock} />
        <div className="bg-surface rounded-card p-6 shadow-card border border-line text-ink-3 text-sm">
          (Section 2 — ใส่ใน Task 5) · segments ในช่วง: {filteredSegments.length}
        </div>
      </section>
    </div>
  );
}
