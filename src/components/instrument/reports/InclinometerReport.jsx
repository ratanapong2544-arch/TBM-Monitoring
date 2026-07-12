// Task 6.3 — Inclinometer report: Time History (A/B max-per-day) + Depth Profile (latest reading,
// A vs B) + threshold reference lines + raw data tables (one per axis). Ported from
// reports/InclinometerReport.tsx, adapted: A/B axis shown together in one chart each (no A/B
// sub-tab — scope cut) and Depth Profile uses the latest reading only instead of a 17-date overlay,
// so the 2-axis chart stays readable (see task-6-report.md).
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import ChartFrame from "./shared/ChartFrame";
import RawDataTable from "./shared/RawDataTable";
import ContextStrip from "./shared/ContextStrip";
import EmptyState from "./shared/EmptyState";
import { formatShortDate, formatSignedNumber, maxAbsOf, symmetricDomain, thresholdColors } from "./shared/chartUtils";
import { axisTick, gridProps, tooltipStyle } from "../../../ui-ux-pro-max/chartTheme";
import { parseProfile, parseThresholds, resolveThreshold } from "../../../utils/instrumentData";

const AXIS_COLORS = { a: "#0284c7", b: "#7c3aed" };

function depthTable(rowsAsc, axisKey) {
  const parsed = rowsAsc.map((r) => parseProfile(r.profileJson));
  const depths = parsed.length ? parsed[parsed.length - 1].map((p) => p.depth) : [];
  return depths.map((depth, i) => ({
    label: depth.toFixed(2),
    values: parsed.map((points) => points[i]?.[axisKey] ?? null),
  }));
}

export default function InclinometerReport({ instruments = [], readings = [], thresholds = [] }) {
  const inst = instruments[0];
  const rows = inst
    ? readings.filter((r) => String(r.instrumentId) === String(inst.id)).sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];
  if (!inst || !rows.length) return <EmptyState />;

  const latest = rows[rows.length - 1];
  const latestPoints = parseProfile(latest.profileJson);
  const th = parseThresholds(latest.profileJson) || resolveThreshold(thresholds, inst);

  const dates = rows.map((r) => r.date);
  const dateLabels = dates.map(formatShortDate);
  const timeHistory = rows.map((r) => {
    const points = parseProfile(r.profileJson);
    return { dateLabel: formatShortDate(r.date), a: maxAbsOf(points.map((p) => p.a)), b: maxAbsOf(points.map((p) => p.b)) };
  });

  const historyValues = timeHistory.flatMap((p) => [p.a, p.b]);
  const bandVals = th ? [th.action, -th.action] : [];
  const historyDomain = symmetricDomain(historyValues.concat(bandVals), th?.action || 1, 0.2);
  const depths = latestPoints.map((p) => p.depth);
  const depthDomain = depths.length ? [Math.min(...depths), Math.max(...depths)] : [0, 1];
  const profileValues = latestPoints.flatMap((p) => [p.a, p.b]);
  const profileDomain = symmetricDomain(profileValues.concat(bandVals), th?.action || 1, 0.2);
  const peak = maxAbsOf(latestPoints.flatMap((p) => [p.a, p.b]));

  return (
    <section className="space-y-4">
      <ContextStrip reading={latest} extra={peak != null ? `Max ${formatSignedNumber(peak)} mm` : null} />

      <ChartFrame
        title="Time History — A/B Axis"
        subtitle={th ? `Max deflection (mm) per day, by axis. Threshold: alert ±${th.alert} / alarm ±${th.alarm} / action ±${th.action} mm.` : "Max deflection (mm) per day, by axis."}
        height={340}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeHistory} margin={{ top: 12, right: 16, bottom: 40, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="dateLabel" tick={axisTick} angle={-35} textAnchor="end" height={56} interval={0} axisLine={false} tickLine={false} />
            <YAxis domain={historyDomain} tick={axisTick} axisLine={false} tickLine={false} width={48}
              label={{ value: "Deflection (mm)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569" } }} />
            <Tooltip {...tooltipStyle} />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            {th && <ReferenceLine y={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {th && <ReferenceLine y={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {th && <ReferenceLine y={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="a" name="A-axis" stroke={AXIS_COLORS.a} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls />
            <Line type="monotone" dataKey="b" name="B-axis" stroke={AXIS_COLORS.b} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Depth Profile — A/B Axis (latest reading)"
        subtitle={`${formatShortDate(latest.date)} · lateral deflection by depth (0 m = top).`}
        height={640}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart layout="vertical" data={latestPoints} margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" domain={profileDomain} tick={axisTick} axisLine={false} tickLine={false}
              label={{ value: "Deflection (mm)", position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "#475569" } }} />
            <YAxis type="number" dataKey="depth" domain={depthDomain} reversed tick={axisTick} axisLine={false} tickLine={false} width={40}
              label={{ value: "Depth (m)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569" } }} />
            <Tooltip {...tooltipStyle} labelFormatter={(d) => `Depth ${d} m`} />
            <ReferenceLine x={0} stroke="#94a3b8" />
            {th && <ReferenceLine x={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="a" name="A-axis" stroke={AXIS_COLORS.a} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line type="monotone" dataKey="b" name="B-axis" stroke={AXIS_COLORS.b} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <RawDataTable title="Lateral deflection (mm) — A-axis" rowLabel="Depth (m)" columnLabels={dateLabels}
          rows={depthTable(rows, "a")} digits={2} unit="mm" maxHeight={420} highlightColumn={formatShortDate(latest.date)} />
        <RawDataTable title="Lateral deflection (mm) — B-axis" rowLabel="Depth (m)" columnLabels={dateLabels}
          rows={depthTable(rows, "b")} digits={2} unit="mm" maxHeight={420} highlightColumn={formatShortDate(latest.date)} />
      </div>
    </section>
  );
}
