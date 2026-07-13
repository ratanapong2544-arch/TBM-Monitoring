// Task R2b — Extensometer report, full fidelity vs tunnel-monitoring/ExtensometerReport.tsx.
// Restores what v1 (Task 6.3) cut: dual-axis Time History (left = settlement, right = TBM
// Station, dashed station overlay) on a time-based X axis with the fixed ±30 mm scale. No A/B
// sub-tab in source or here — EXT groups by ring (dynamic ring/label set from profileJson, same
// as v1). Latest Depth Profile + threshold reference lines were already source-faithful in v1 and
// are left as-is. See .superpowers/sdd/task-R2b-report.md for full notes.
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import ChartFrame from "./shared/ChartFrame";
import RawDataTable from "./shared/RawDataTable";
import ReportShell from "./shared/ReportShell";
import SummaryStats from "./shared/SummaryStats";
import EmptyState from "./shared/EmptyState";
import {
  depthSeriesPalette, findPeakAcrossReadings, formatDateTick, formatShortDate, formatSignedNumber,
  formatStation, parseDateToMs, symmetricDomain, thresholdColors, weeklyTickTimestamps,
  STATION_Y_DOMAIN, STATION_Y_TICKS, TIME_HISTORY_Y_DOMAIN, TIME_HISTORY_Y_TICKS,
} from "./shared/chartUtils";
import { axisTick, chartColors, gridProps, tooltipStyle } from "../../../ui-ux-pro-max/chartTheme";
import { parseProfile, parseThresholds, resolveThreshold } from "../../../utils/instrumentData";

export default function ExtensometerReport({ instruments = [], readings = [], thresholds = [] }) {
  const inst = instruments[0];
  const rows = inst
    ? readings.filter((r) => String(r.instrumentId) === String(inst.id)).sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];
  if (!inst || !rows.length) return <EmptyState />;

  const latest = rows[rows.length - 1];
  const latestPoints = parseProfile(latest.profileJson); // [{depth,label,a}], ordered deepest→shallowest
  const th = parseThresholds(latest.profileJson) || resolveThreshold(thresholds, inst);
  const ringLabels = latestPoints.map((p) => p.label);

  const dates = rows.map((r) => r.date);
  const parsedRows = rows.map((r) => ({ date: r.date, tbmChainage: r.tbmChainage, points: parseProfile(r.profileJson) }));

  const timeHistory = parsedRows.map(({ date, tbmChainage, points }) => {
    const row = { date, ts: parseDateToMs(date), station: tbmChainage ?? null };
    ringLabels.forEach((label) => { row[label] = points.find((p) => p.label === label)?.a ?? null; });
    return row;
  });

  // All-time peak across rings (not just latest reading) — matches source's maxSettlement semantics.
  const peak = findPeakAcrossReadings(parsedRows, (p) => p.a, (p) => p.label);
  const maxLine = peak
    ? `Latest max settlement ${formatSignedNumber(peak.value)} mm at ${peak.meta} on ${formatShortDate(peak.date)}`
    : null;

  // Time-based X axis spans the real reading dates (not the source's hardcoded PDF period).
  const startDate = rows[0].date;
  const endDate = rows[rows.length - 1].date;
  const dateDomain = [parseDateToMs(startDate), parseDateToMs(endDate)];
  const dateTicks = weeklyTickTimestamps(startDate, endDate, 10);

  // --- Latest Depth Profile: unchanged from v1 (already source-faithful — single latest
  // reading, dynamic domain via symmetricDomain, reversed depth axis). ---
  const profilePoints = [...latestPoints].sort((a, b) => a.depth - b.depth); // shallow→deep
  const depths = profilePoints.map((p) => p.depth);
  const depthDomain = depths.length ? [Math.min(...depths), Math.max(...depths)] : [0, 1];
  const bandVals = th ? [th.action, -th.action] : [];
  const profileDomain = symmetricDomain(profilePoints.map((p) => p.a).concat(bandVals), th?.action || 1, 0.2);

  const tableRows = rows.map((r) => {
    const pts = parseProfile(r.profileJson);
    const byLabel = Object.fromEntries(pts.map((p) => [p.label, p.a]));
    return { label: formatShortDate(r.date), values: ringLabels.map((l) => byLabel[l] ?? null) };
  });

  const summarySeries = ringLabels.map((label, i) => ({
    label,
    color: depthSeriesPalette[i % depthSeriesPalette.length],
    unit: "mm",
    values: timeHistory.map((h) => h[label]),
  }));

  return (
    <ReportShell
      code={inst.code || inst.id}
      typeLabel="Magnetic Extensometer"
      reportDate={latest.date}
      station={latest.tbmChainage}
      ring={null}
      maxLine={maxLine}
      badgeColor={depthSeriesPalette[0]}
    >
      <section className="space-y-4">
        <ChartFrame
          title="Time History — by ring"
          subtitle={th ? `Settlement (mm) over time, by ring depth. Thresholds: alert ±${th.alert} / alarm ±${th.alarm} / action ±${th.action} mm.` : "Settlement (mm) over time, by ring depth."}
          height={420}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeHistory} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                type="number" dataKey="ts" domain={dateDomain} ticks={dateTicks} tickFormatter={formatDateTick}
                tick={axisTick} tickLine={false} angle={-45} textAnchor="end" height={70} scale="time"
              />
              <YAxis
                yAxisId="settlement" domain={TIME_HISTORY_Y_DOMAIN} ticks={TIME_HISTORY_Y_TICKS} tick={axisTick} tickLine={false} width={48}
                label={{ value: "Settlement (mm)", angle: -90, position: "insideLeft", fill: "#666666", fontSize: 11 }}
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
              <ReferenceLine yAxisId="settlement" y={0} stroke="#E8E8E8" />
              {th && <ReferenceLine yAxisId="settlement" y={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
              {th && <ReferenceLine yAxisId="settlement" y={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
              {th && <ReferenceLine yAxisId="settlement" y={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
              {th && <ReferenceLine yAxisId="settlement" y={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
              {th && <ReferenceLine yAxisId="settlement" y={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
              {th && <ReferenceLine yAxisId="settlement" y={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
              {ringLabels.map((label, i) => (
                <Line
                  key={label} yAxisId="settlement" type="monotone" dataKey={label} name={label}
                  stroke={depthSeriesPalette[i % depthSeriesPalette.length]}
                  strokeWidth={peak && label === peak.meta ? 2.6 : 2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls
                />
              ))}
              <Line yAxisId="station" type="monotone" dataKey="station" name="TBM STA" stroke={chartColors.planned} strokeDasharray="6 4" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Latest Depth Profile" subtitle={`${formatShortDate(latest.date)} · settlement by installation depth.`} height={420}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart layout="vertical" data={profilePoints} margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                type="number" domain={profileDomain} tick={axisTick} tickLine={false}
                label={{ value: "Settlement (mm)", position: "insideBottom", offset: -8, fill: "#666666", fontSize: 11 }}
              />
              <YAxis
                type="number" dataKey="depth" domain={depthDomain} reversed tick={axisTick} tickLine={false} width={48}
                label={{ value: "Depth (m)", angle: -90, position: "insideLeft", fill: "#666666", fontSize: 11 }}
              />
              <Tooltip {...tooltipStyle} formatter={(value, _n, p) => [`${value} mm`, p?.payload?.label ?? ""]} labelFormatter={(d) => `Depth ${d} m`} />
              <ReferenceLine x={0} stroke="#E8E8E8" />
              {th && <ReferenceLine x={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "top", fill: thresholdColors.alert, fontSize: 10 }} />}
              {th && <ReferenceLine x={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
              {th && <ReferenceLine x={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "top", fill: thresholdColors.alarm, fontSize: 10 }} />}
              {th && <ReferenceLine x={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
              {th && <ReferenceLine x={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "top", fill: thresholdColors.action, fontSize: 10 }} />}
              {th && <ReferenceLine x={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="a" stroke={depthSeriesPalette[0]} strokeWidth={2.6} dot={{ r: 5, fill: depthSeriesPalette[0] }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <RawDataTable
          title="Settlement (mm) by ring × date"
          subtitle={`Source: reading log — ${dates.length} measurement dates × ${ringLabels.length} rings.`}
          rowLabel="Date"
          columnLabels={ringLabels}
          rows={tableRows}
          digits={1}
          unit="mm"
          maxHeight={420}
          highlightColumn={peak?.meta}
        />

        <SummaryStats title="Summary by ring" defaultUnit="mm" series={summarySeries} digits={1} />
      </section>
    </ReportShell>
  );
}
