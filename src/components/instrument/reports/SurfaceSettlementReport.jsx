// Task 6.3 — Surface Settlement report: Time History (all points combined into one chart) +
// Settlement Profile (one line per date, X = point position) + threshold lines + raw data table.
// Ported from SurfaceSettlementReport.tsx + SurfaceSettlementGroupReport.tsx, merged: each SS point
// is its own instrument (point type, no profileJson.points) so all points are combined into one
// chart instead of the source's 2-group tab split (scope cut). X position uses each instrument's
// real blueprintX (%) instead of the source's arbitrary fixed spacing.
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import ChartFrame from "./shared/ChartFrame";
import RawDataTable from "./shared/RawDataTable";
import ContextStrip from "./shared/ContextStrip";
import EmptyState from "./shared/EmptyState";
import { depthSeriesPalette, formatShortDate, formatSignedNumber, getDateColor, symmetricDomain, thresholdColors } from "./shared/chartUtils";
import { axisTick, gridProps, tooltipStyle } from "../../../ui-ux-pro-max/chartTheme";
import { parseThresholds, resolveThreshold } from "../../../utils/instrumentData";

function maxAbsOf(nums) {
  let best = null;
  nums.forEach((v) => {
    if (v != null && Number.isFinite(v) && (best == null || Math.abs(v) > Math.abs(best))) best = v;
  });
  return best;
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

  if (!points.length || !dates.length) return <EmptyState />;

  const latestGroup = perPoint.find((p) => p.rows.length);
  const latestReadingRow = latestGroup?.rows[latestGroup.rows.length - 1];
  const th = latestReadingRow ? (parseThresholds(latestReadingRow.profileJson) || resolveThreshold(thresholds, latestGroup.inst)) : null;

  const timeHistory = dates.map((d) => {
    const row = { dateLabel: formatShortDate(d) };
    perPoint.forEach(({ inst, rows }) => {
      const r = rows.find((x) => x.date === d);
      row[inst.code] = r ? r.valuePrimary : null;
    });
    return row;
  });

  const bandVals = th ? [th.action, -th.action] : [];
  const historyValues = timeHistory.flatMap((r) => points.map((p) => r[p.code]));
  const historyDomain = symmetricDomain(historyValues.concat(bandVals), th?.action || 1, 0.2);

  const latestDate = dates[dates.length - 1];
  let peak = null;
  perPoint.forEach(({ inst, rows }) => {
    const r = rows.find((x) => x.date === latestDate);
    if (r && (peak == null || Math.abs(r.valuePrimary) > Math.abs(peak.value))) peak = { code: inst.code, value: r.valuePrimary };
  });

  const profileData = perPoint.map(({ inst, rows }) => {
    const point = { x: Number(inst.blueprintX), label: inst.code };
    dates.forEach((d) => {
      const r = rows.find((x) => x.date === d);
      point[d] = r ? r.valuePrimary : null;
    });
    return point;
  });
  const xValues = points.map((p) => Number(p.blueprintX));
  const xDomain = xValues.length ? [Math.min(...xValues) - 5, Math.max(...xValues) + 5] : [0, 100];
  const profileValues = perPoint.flatMap(({ rows }) => rows.map((r) => r.valuePrimary));
  const profileDomain = symmetricDomain(profileValues.concat(bandVals), th?.action || 1, 0.2);

  const tableRows = dates.map((d) => ({
    label: formatShortDate(d),
    values: perPoint.map(({ rows }) => rows.find((x) => x.date === d)?.valuePrimary ?? null),
  }));

  return (
    <section className="space-y-4">
      <ContextStrip reading={latestReadingRow} extra={peak ? `Max ${formatSignedNumber(peak.value)} mm @ ${peak.code}` : null} />

      <ChartFrame
        title={`Time History — ${points.length} points`}
        subtitle={th ? `Settlement (mm) over time, all points combined. Threshold: alert ±${th.alert} / alarm ±${th.alarm} / action ±${th.action} mm.` : "Settlement (mm) over time, all points combined."}
        height={380}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeHistory} margin={{ top: 12, right: 16, bottom: 40, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="dateLabel" tick={axisTick} angle={-35} textAnchor="end" height={56} interval={0} axisLine={false} tickLine={false} />
            <YAxis domain={historyDomain} tick={axisTick} axisLine={false} tickLine={false} width={48}
              label={{ value: "Settlement (mm)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569" } }} />
            <Tooltip {...tooltipStyle} />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            {th && <ReferenceLine y={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {th && <ReferenceLine y={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {th && <ReferenceLine y={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            {points.map((p, i) => (
              <Line key={p.id} type="monotone" dataKey={p.code} name={p.code} stroke={depthSeriesPalette[i % depthSeriesPalette.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame title="Settlement Profile" subtitle="Settlement (mm) by point position (blueprint X %). One line per measurement date." height={420}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={profileData} margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" dataKey="x" domain={xDomain} tick={axisTick} axisLine={false} tickLine={false}
              label={{ value: "Point position (blueprint X %)", position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "#475569" } }} />
            <YAxis type="number" domain={profileDomain} tick={axisTick} axisLine={false} tickLine={false} width={48}
              label={{ value: "Settlement (mm)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569" } }} />
            <Tooltip {...tooltipStyle} labelFormatter={(x, payload) => { const p = payload?.[0]?.payload; return p?.label ? `${p.label} (X=${p.x})` : `X=${x}`; }} />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            {th && <ReferenceLine y={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {th && <ReferenceLine y={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {th && <ReferenceLine y={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
            {th && <ReferenceLine y={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            {dates.map((d) => (
              <Line key={d} type="monotone" dataKey={d} name={formatShortDate(d)} stroke={getDateColor(d, dates)} strokeWidth={d === latestDate ? 2.4 : 1.4} dot={{ r: 3, fill: getDateColor(d, dates), strokeWidth: 0 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <RawDataTable title={`Settlement (mm) by point x date — ${points.length} points`} rowLabel="Date" columnLabels={points.map((p) => p.code)}
        rows={tableRows} digits={1} unit="mm" maxHeight={420} highlightColumn={peak?.code} />
    </section>
  );
}
