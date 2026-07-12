// Task R2b — Inclinometer report, full fidelity vs tunnel-monitoring/InclinometerReport.tsx.
// Restores what v1 (Task 6.3) cut: A/B secondary sub-tabs, dual-axis Time History (left =
// deflection, right = TBM Station, dashed station overlay) on a time-based X axis, and the
// 17-date Depth Profile overlay (was latest-reading-only). Ported faithfully, adapted to this
// app's real per-reading data model (profileJson points, no "highlightedDepths"/"maxMovement"
// preset — see pickHighlightedDepths/findPeakAcrossReadings in chartUtils.js) instead of the
// source's fixed report preset. See .superpowers/sdd/task-R2b-report.md for full notes.
import { useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import ChartFrame from "./shared/ChartFrame";
import RawDataTable from "./shared/RawDataTable";
import ReportShell from "./shared/ReportShell";
import SummaryStats from "./shared/SummaryStats";
import TabBar from "./shared/TabBar";
import EmptyState from "./shared/EmptyState";
import {
  depthSeriesPalette, findPeakAcrossReadings, formatDateTick, formatShortDate, formatSignedNumber,
  formatStation, getDateColor, parseDateToMs, pickHighlightedDepths, thresholdColors, weeklyTickTimestamps,
  STATION_Y_DOMAIN, STATION_Y_TICKS, TIME_HISTORY_Y_DOMAIN, TIME_HISTORY_Y_TICKS,
} from "./shared/chartUtils";
import { axisTick, chartColors, gridProps, tooltipStyle } from "../../../ui-ux-pro-max/chartTheme";
import { parseProfile, parseThresholds, resolveThreshold } from "../../../utils/instrumentData";

const AXIS_TABS = [
  { id: "a", label: "A-Axis", sublabel: "Lateral" },
  { id: "b", label: "B-Axis", sublabel: "Longitudinal" },
];
// a=cyan (doubles as the ReportShell badge below), b=violet — kept out of the slate/sky/blue
// family; navy itself is reserved for the station-overlay line so it reads as one system.
const AXIS_COLORS = { a: chartColors.paid, b: "#7c3aed" };

// Match source PDF scale: lateral deflection -50..+50 mm, depth 0..35 m (0 at top, per brief).
const PROFILE_X_DOMAIN = [-50, 50];
const PROFILE_X_TICKS = [-50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const DEPTH_Y_DOMAIN = [0, 35];
const DEPTH_Y_TICKS = Array.from({ length: 36 }, (_, i) => i);

/** Raw data table rows (one per depth, values across all dates) — unchanged from v1. */
function depthTable(rowsAsc, axisKey) {
  const parsed = rowsAsc.map((r) => parseProfile(r.profileJson));
  const depths = parsed.length ? parsed[parsed.length - 1].map((p) => p.depth) : [];
  return depths.map((depth, i) => ({
    label: depth.toFixed(2),
    values: parsed.map((points) => points[i]?.[axisKey] ?? null),
  }));
}

export default function InclinometerReport({ instruments = [], readings = [], thresholds = [] }) {
  const [axis, setAxis] = useState("a");

  const inst = instruments[0];
  const rows = inst
    ? readings.filter((r) => String(r.instrumentId) === String(inst.id)).sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];
  if (!inst || !rows.length) return <EmptyState />;

  const latest = rows[rows.length - 1];
  const th = parseThresholds(latest.profileJson) || resolveThreshold(thresholds, inst);

  const dates = rows.map((r) => r.date);
  const dateLabels = dates.map(formatShortDate);
  const parsedRows = rows.map((r) => ({ date: r.date, tbmChainage: r.tbmChainage, points: parseProfile(r.profileJson) }));
  const canonicalPoints = parsedRows[parsedRows.length - 1].points;

  const highlightDepths = pickHighlightedDepths(canonicalPoints.map((p) => p.depth), 6);
  const seriesKeys = highlightDepths.map((d) => `${d} m`);

  // All-time peak per axis (not just latest reading) — matches source's maxMovement semantics.
  const aPeak = findPeakAcrossReadings(parsedRows, (p) => p.a, (p) => p.depth);
  const bPeak = findPeakAcrossReadings(parsedRows, (p) => p.b, (p) => p.depth);
  const maxLine = [
    aPeak && `A-axis max ${formatSignedNumber(aPeak.value)} mm @ ${aPeak.meta} m on ${formatShortDate(aPeak.date)}`,
    bPeak && `B-axis max ${formatSignedNumber(bPeak.value)} mm @ ${bPeak.meta} m on ${formatShortDate(bPeak.date)}`,
  ].filter(Boolean).join(" · ") || null;

  // Time-based X axis spans the real reading dates (not the source's hardcoded PDF period).
  const startDate = rows[0].date;
  const endDate = rows[rows.length - 1].date;
  const dateDomain = [parseDateToMs(startDate), parseDateToMs(endDate)];
  const dateTicks = weeklyTickTimestamps(startDate, endDate, 10);

  const axisKey = axis;
  const axisLabel = axis === "a" ? "A-Axis" : "B-Axis";
  const axisColor = AXIS_COLORS[axisKey];
  const peak = axis === "a" ? aPeak : bPeak;

  const timeHistory = parsedRows.map(({ date, tbmChainage, points }) => {
    const row = { date, ts: parseDateToMs(date), station: tbmChainage ?? null };
    highlightDepths.forEach((d, i) => { row[seriesKeys[i]] = points.find((p) => p.depth === d)?.[axisKey] ?? null; });
    return row;
  });

  const depthProfile = canonicalPoints.map((cp) => {
    const row = { depth: cp.depth };
    parsedRows.forEach(({ date, points }) => { row[date] = points.find((p) => p.depth === cp.depth)?.[axisKey] ?? null; });
    return row;
  });

  const summarySeries = highlightDepths.map((d, i) => ({
    label: `${d} m`,
    color: depthSeriesPalette[i % depthSeriesPalette.length],
    unit: "mm",
    values: parsedRows.map(({ points }) => points.find((p) => p.depth === d)?.[axisKey] ?? null),
  }));

  return (
    <ReportShell
      code={inst.code || inst.id}
      typeLabel="Borehole Inclinometer"
      reportDate={latest.date}
      station={latest.tbmChainage}
      ring={null}
      maxLine={maxLine}
      badgeColor={chartColors.paid}
    >
      <section className="space-y-4">
        <TabBar tabs={AXIS_TABS} activeId={axis} onChange={setAxis} variant="secondary" />

        {peak && (
          <div
            className="rounded-input border px-3 py-2 text-xs font-semibold"
            style={{ borderColor: `${axisColor}4D`, backgroundColor: `${axisColor}14`, color: axisColor }}
          >
            Max {formatSignedNumber(peak.value)} mm @ {peak.meta} m on {formatShortDate(peak.date)} ({axisLabel})
          </div>
        )}

        <ChartFrame
          title={`Time History — ${axisLabel}`}
          subtitle={th ? `Displacement (mm) over time, by depth. Threshold lines: alert ±${th.alert} / alarm ±${th.alarm} / action ±${th.action} mm.` : "Displacement (mm) over time, by depth."}
          height={400}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeHistory} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                type="number" dataKey="ts" domain={dateDomain} ticks={dateTicks} tickFormatter={formatDateTick}
                tick={axisTick} tickLine={false} angle={-45} textAnchor="end" height={70} scale="time"
              />
              <YAxis
                yAxisId="movement" domain={TIME_HISTORY_Y_DOMAIN} ticks={TIME_HISTORY_Y_TICKS} tick={axisTick} tickLine={false} width={48}
                label={{ value: "Displacement (mm)", angle: -90, position: "insideLeft", fill: "#666666", fontSize: 11 }}
              />
              <YAxis
                yAxisId="station" orientation="right" domain={STATION_Y_DOMAIN} ticks={STATION_Y_TICKS}
                tickFormatter={(v) => formatStation(v)} tick={{ fontSize: 10, fill: "#999999" }} tickLine={false} width={80}
                label={{ value: "TBM Station", angle: 90, position: "insideRight", fill: "#999999", fontSize: 10 }}
              />
              <Tooltip
                {...tooltipStyle}
                labelFormatter={(label) => {
                  const ts = Number(label);
                  if (!Number.isFinite(ts)) return formatShortDate(String(label));
                  const point = timeHistory.find((p) => p.ts === ts);
                  return formatShortDate(point?.date ?? formatDateTick(ts));
                }}
              />
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, paddingLeft: 12 }} />
              <ReferenceLine yAxisId="movement" y={0} stroke="#E8E8E8" />
              {th && <ReferenceLine yAxisId="movement" y={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
              {th && <ReferenceLine yAxisId="movement" y={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
              {th && <ReferenceLine yAxisId="movement" y={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
              {th && <ReferenceLine yAxisId="movement" y={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
              {th && <ReferenceLine yAxisId="movement" y={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
              {th && <ReferenceLine yAxisId="movement" y={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
              {seriesKeys.map((key, i) => (
                <Line key={key} yAxisId="movement" type="monotone" dataKey={key} stroke={depthSeriesPalette[i % depthSeriesPalette.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls />
              ))}
              <Line yAxisId="station" type="monotone" dataKey="station" name="TBM STA" stroke={chartColors.planned} strokeDasharray="6 4" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title={`Depth Profile — ${axisLabel}`}
          subtitle={`Lateral deflection by depth. One line per measurement date (${dates.length} dates). Y axis is depth (top = 0 m).`}
          height={900}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart layout="vertical" data={depthProfile} margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="0" strokeWidth={0.5} />
              <XAxis
                type="number" domain={PROFILE_X_DOMAIN} ticks={PROFILE_X_TICKS} interval={0} tick={{ fontSize: 10, fill: "#666666" }} tickLine={false}
                label={{
                  value: `${axisLabel[0]} −          Lateral Deflection (mm)          ${axisLabel[0]} +`,
                  position: "insideBottom", offset: -10, fill: "#666666", fontSize: 11, fontWeight: 600,
                }}
              />
              <YAxis
                type="number" dataKey="depth" domain={DEPTH_Y_DOMAIN} ticks={DEPTH_Y_TICKS} interval={0} reversed
                tick={{ fontSize: 10, fill: "#666666" }} tickLine={false} width={36}
                label={{ value: "Depth (m)", angle: -90, position: "insideLeft", fill: "#666666", fontSize: 11 }}
              />
              <Tooltip {...tooltipStyle} labelFormatter={(depth) => `Depth ${depth} m`} />
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, paddingLeft: 12 }} />
              <ReferenceLine x={0} stroke="#666666" strokeWidth={1} />
              {th && <ReferenceLine x={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
              {th && <ReferenceLine x={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
              {th && <ReferenceLine x={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
              {th && <ReferenceLine x={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
              {th && <ReferenceLine x={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
              {th && <ReferenceLine x={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
              {rows.map((r) => (
                <Line
                  key={r.date} type="monotone" dataKey={r.date} name={formatShortDate(r.date)}
                  stroke={getDateColor(r.date, dates)} strokeWidth={r.date === latest.date ? 2 : 1.2}
                  dot={{ r: 1.6, strokeWidth: 0, fill: getDateColor(r.date, dates) }} connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <RawDataTable
          title={`Lateral deflection (mm) — ${axisLabel}`}
          subtitle={`Source: reading log — ${canonicalPoints.length} depths × ${dates.length} measurement dates.`}
          rowLabel="Depth (m)"
          columnLabels={dateLabels}
          rows={depthTable(rows, axisKey)}
          digits={2}
          unit="mm"
          maxHeight={420}
          highlightColumn={formatShortDate(latest.date)}
        />

        <SummaryStats title={`Summary by depth — ${axisLabel}`} defaultUnit="mm" series={summarySeries} digits={2} />
      </section>
    </ReportShell>
  );
}
