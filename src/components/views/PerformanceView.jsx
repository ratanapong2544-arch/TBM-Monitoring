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

  return (
    <div className="max-w-full mx-auto pb-24 animate-fade-in space-y-6">
      <GlobalFilterBar state={gfState} setters={gfSetters} title="Performance Filter" subtitle="กรองช่วงเวลา (ใช้ฟิลเตอร์เดียวกับทั้งระบบ)" />

      <section className="space-y-4">
        <SectionHeader title="Utilization & Downtime" subtitle="การใช้งานเครื่อง & เวลาสูญเสีย" icon={Gauge} />
        <div className="bg-surface rounded-card p-6 shadow-card border border-line text-ink-3 text-sm">
          (Section 1 — ใส่ใน Task 4) · shifts ในช่วง: {filteredShiftReports.length}
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
