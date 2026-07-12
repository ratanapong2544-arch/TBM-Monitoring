// Task R2c — Surface Settlement report, full fidelity vs tunnel-monitoring's
// {SurfaceSettlementReport,SurfaceSettlementGroupReport}.tsx. Restores what v1 (Task 6.3) cut:
// ReportShell wrapper, 2-group secondary sub-tabs (was one chart combining all points), dual-axis
// Time History with a TBM-station overlay (was single-axis, all points combined, no station line),
// and SummaryStats per active group. Time History threshold bands are negative-only — settlement is
// a one-way-negative quantity and source's own Time History chart draws only -alert/-alarm/-action
// (verified by reading SurfaceSettlementGroupReport.tsx directly: no positive-side ReferenceLine
// there) — while the Settlement Profile chart below keeps symmetric ± bands, matching both source
// and v1. Source splits Report (single group, own shell) + GroupReport (shell + TabBar + shared
// body) into two files; kept as ONE file here, matching R2b's InclinometerReport precedent (no other
// caller needs a standalone single-group variant). The group split is computed from the real,
// blueprintX-sorted point list (not hardcoded to 8 points) — first half / second half, labelled by
// real 1-based index range (e.g. "01-04"/"05-08" for this app's typical 8-point seed).
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
  formatStation, getDateColor, parseDateToMs, thresholdColors, weeklyTickTimestamps,
  STATION_Y_DOMAIN, STATION_Y_TICKS, TIME_HISTORY_Y_DOMAIN, TIME_HISTORY_Y_TICKS,
} from "./shared/chartUtils";
import { axisTick, chartColors, gridProps, tooltipStyle } from "../../../ui-ux-pro-max/chartTheme";
import { parseThresholds, resolveThreshold } from "../../../utils/instrumentData";

function groupLabelFor(startIdx, count) {
  const from = String(startIdx + 1).padStart(2, "0");
  const to = String(startIdx + count).padStart(2, "0");
  return `${from}-${to}`;
}

function tooltipLabel(timeHistory) {
  return (label) => {
    const ts = Number(label);
    if (!Number.isFinite(ts)) return formatShortDate(String(label));
    const point = timeHistory.find((p) => p.ts === ts);
    return formatShortDate(point?.date ?? formatDateTick(ts));
  };
}

export default function SurfaceSettlementReport({ instruments = [], readings = [], thresholds = [] }) {
  const points = [...instruments].sort((a, b) => Number(a.blueprintX) - Number(b.blueprintX));
  const perPoint = points.map((inst) => ({
    inst,
    rows: readings.filter((r) => String(r.instrumentId) === String(inst.id)).sort((a, b) => new Date(a.date) - new Date(b.date)),
  }));
  const dateSet = new Set();
  perPoint.forEach(({ rows }) => rows.forEach((r) => dateSet.add(r.date)));
  const dates = [...dateSet].sort((a, b) => new Date(a) - new Date(b));

  // Split into 2 groups (first half / second half of the blueprintX-sorted list) — matches
  // source's fixed 01-04/05-08 split for the typical 8-point seed, generalizes to other counts.
  const groupSize = Math.ceil(points.length / 2);
  const groups = [
    { start: 0, points: perPoint.slice(0, groupSize) },
    { start: groupSize, points: perPoint.slice(groupSize) },
  ].filter((g) => g.points.length);
  const tabs = groups.map((g) => ({
    id: `group-${g.start}`,
    label: groupLabelFor(g.start, g.points.length),
    sublabel: `${g.points.length} points`,
  }));

  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const rawIdx = tabs.findIndex((t) => t.id === activeId);
  const activeIdx = rawIdx >= 0 ? rawIdx : 0;
  const activeGroup = groups[activeIdx]?.points ?? [];
  const groupLabel = tabs[activeIdx]?.label ?? "";

  if (!points.length || !dates.length) return <EmptyState />;

  const latestGroup = perPoint.find((p) => p.rows.length);
  const latestReadingRow = latestGroup?.rows[latestGroup.rows.length - 1];
  const th = latestReadingRow ? (parseThresholds(latestReadingRow.profileJson) || resolveThreshold(thresholds, latestGroup.inst)) : null;

  // All-time peak across every point/date (not just the active group or latest date) — matches
  // source's location-wide ss.maxSettlement, via the same findPeakAcrossReadings helper R2b added.
  const parsedByDate = dates.map((date) => ({
    date,
    points: perPoint.map(({ inst, rows }) => ({ code: inst.code, value: rows.find((r) => r.date === date)?.valuePrimary ?? null })),
  }));
  const peak = findPeakAcrossReadings(parsedByDate, (p) => p.value, (p) => p.code);
  const reportMaxLine = peak ? `Latest max ${formatSignedNumber(peak.value, 1)} mm at ${peak.meta} on ${formatShortDate(peak.date)}` : null;

  // Time History (active group only) — X spans the full date range across ALL points, so
  // switching group tabs doesn't rescale the axis; only the plotted series change.
  const tbmChainageByDate = new Map();
  dates.forEach((d) => {
    const hit = perPoint.map(({ rows }) => rows.find((r) => r.date === d)).find((r) => r && r.tbmChainage != null);
    tbmChainageByDate.set(d, hit ? hit.tbmChainage : null);
  });
  const timeHistory = dates.map((d) => {
    const row = { date: d, ts: parseDateToMs(d), station: tbmChainageByDate.get(d) ?? null };
    activeGroup.forEach(({ inst, rows }) => { row[inst.code] = rows.find((r) => r.date === d)?.valuePrimary ?? null; });
    return row;
  });
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const dateDomain = [parseDateToMs(startDate), parseDateToMs(endDate)];
  const dateTicks = weeklyTickTimestamps(startDate, endDate, 10);
  const labelForTs = tooltipLabel(timeHistory);

  // Settlement Profile (active group only) — X = real blueprintX position (%). Domain is fixed
  // across both group tabs (computed once from the full point set, not the active group, so
  // switching tabs doesn't rescale the axis) but scaled to this location's real coordinate spread
  // — not a hardcoded literal, since source's own -80..0 domain was tuned to its synthetic 4-point
  // layout and would misrepresent this app's real 0-100% blueprintX positions.
  const allX = points.map((p) => Number(p.blueprintX)).filter((v) => Number.isFinite(v));
  const profileXDomain = allX.length ? [Math.min(...allX) - 5, Math.max(...allX) + 5] : [0, 100];

  const groupDateSet = new Set();
  activeGroup.forEach(({ rows }) => rows.forEach((r) => groupDateSet.add(r.date)));
  const groupDates = [...groupDateSet].sort((a, b) => new Date(a) - new Date(b));
  const latestGroupDate = groupDates[groupDates.length - 1];
  const profileData = activeGroup.map(({ inst, rows }) => {
    const point = { x: Number(inst.blueprintX), label: inst.code };
    groupDates.forEach((d) => { point[d] = rows.find((r) => r.date === d)?.valuePrimary ?? null; });
    return point;
  });

  const tableRows = groupDates.map((d) => ({
    label: formatShortDate(d),
    values: activeGroup.map(({ rows }) => rows.find((r) => r.date === d)?.valuePrimary ?? null),
  }));

  const summarySeries = activeGroup.map(({ inst, rows }, i) => ({
    label: inst.code,
    color: depthSeriesPalette[(i + 1) % depthSeriesPalette.length],
    unit: "mm",
    values: groupDates.map((d) => rows.find((r) => r.date === d)?.valuePrimary ?? null),
  }));

  const latestDateOverall = dates[dates.length - 1];

  return (
    <ReportShell
      code="SS-T1"
      typeLabel={`Surface Settlement Points (${groups.length} groups, ${points.length} points)`}
      reportDate={latestDateOverall}
      station={tbmChainageByDate.get(latestDateOverall)}
      ring={null}
      maxLine={reportMaxLine}
      badgeColor="#dc2626"
    >
      <section className="space-y-4">
        <TabBar tabs={tabs} activeId={tabs[activeIdx]?.id ?? ""} onChange={setActiveId} variant="secondary" />

        <ChartFrame
          title={`Time History — ${groupLabel}`}
          subtitle={th ? `Settlement (mm) over time. Threshold lines: alert -${th.alert} / alarm -${th.alarm} / action -${th.action} mm.` : "Settlement (mm) over time."}
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
              <Tooltip {...tooltipStyle} labelFormatter={labelForTs} />
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, paddingLeft: 12 }} />
              <ReferenceLine yAxisId="settlement" y={0} stroke="#E8E8E8" />
              {th && <ReferenceLine yAxisId="settlement" y={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
              {th && <ReferenceLine yAxisId="settlement" y={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
              {th && <ReferenceLine yAxisId="settlement" y={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
              {activeGroup.map(({ inst }, i) => (
                <Line
                  key={inst.id} yAxisId="settlement" type="monotone" dataKey={inst.code} name={inst.code}
                  stroke={depthSeriesPalette[(i + 1) % depthSeriesPalette.length]} strokeWidth={2.4} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls
                />
              ))}
              <Line yAxisId="station" type="monotone" dataKey="station" name="TBM STA" stroke={chartColors.planned} strokeDasharray="6 4" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title={`Settlement Profile — ${groupLabel}`}
          subtitle={`Settlement (mm) by point position. One line per measurement date (${groupDates.length} dates).${th ? ` Threshold lines: alert ±${th.alert} / alarm ±${th.alarm} / action ±${th.action} mm.` : ""}`}
          height={460}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={profileData} margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                type="number" dataKey="x" domain={profileXDomain} tick={axisTick} tickLine={false}
                label={{ value: "Point position (blueprint X %)", position: "insideBottom", offset: -8, fill: "#666666", fontSize: 11 }}
              />
              <YAxis
                type="number" domain={TIME_HISTORY_Y_DOMAIN} ticks={TIME_HISTORY_Y_TICKS} tick={axisTick} tickLine={false} width={48}
                label={{ value: "Settlement (mm)", angle: -90, position: "insideLeft", fill: "#666666", fontSize: 11 }}
              />
              <Tooltip {...tooltipStyle} labelFormatter={(x, payload) => { const p = payload?.[0]?.payload; return p?.label ? `${p.label} (X=${p.x})` : `X=${x}`; }} />
              <ReferenceLine y={0} stroke="#E8E8E8" />
              {th && <ReferenceLine y={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
              {th && <ReferenceLine y={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
              {th && <ReferenceLine y={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
              {th && <ReferenceLine y={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
              {th && <ReferenceLine y={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
              {th && <ReferenceLine y={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
              {groupDates.map((d) => (
                <Line
                  key={d} type="monotone" dataKey={d} name={formatShortDate(d)} stroke={getDateColor(d, groupDates)}
                  strokeWidth={d === latestGroupDate ? 2.4 : 1.4} dot={{ r: 3, fill: getDateColor(d, groupDates), strokeWidth: 0 }} connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <RawDataTable
          title={`Settlement (mm) by point x date — ${groupLabel}`}
          subtitle={`Source: reading log — ${activeGroup.length} points × ${groupDates.length} measurement dates.`}
          rowLabel="Date"
          columnLabels={activeGroup.map(({ inst }) => inst.code)}
          rows={tableRows}
          digits={1}
          unit="mm"
          maxHeight={420}
          highlightColumn={peak?.meta}
        />

        <SummaryStats title={`Summary — ${groupLabel}`} defaultUnit="mm" series={summarySeries} digits={1} />
      </section>
    </ReportShell>
  );
}
