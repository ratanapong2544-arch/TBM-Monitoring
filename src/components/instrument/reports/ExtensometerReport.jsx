// Task 6.3 — Extensometer report: Time History (per ring) + Settlement Profile (latest reading,
// by installation depth) + threshold reference lines + raw data table (date x ring). Ported from
// reports/ExtensometerReport.tsx, adapted to this app's dynamic ring set/depths (profileJson.points
// = [{depth,label,a}]) and embedded ± thresholds instead of the source's hardcoded PDF scale.
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import ChartFrame from "./shared/ChartFrame";
import RawDataTable from "./shared/RawDataTable";
import ContextStrip from "./shared/ContextStrip";
import EmptyState from "./shared/EmptyState";
import { depthSeriesPalette, formatShortDate, formatSignedNumber, symmetricDomain, thresholdColors } from "./shared/chartUtils";
import { axisTick, gridProps, tooltipStyle } from "../../../ui-ux-pro-max/chartTheme";
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

  const timeHistory = rows.map((r) => {
    const pts = parseProfile(r.profileJson);
    const row = { dateLabel: formatShortDate(r.date) };
    pts.forEach((p) => { row[p.label] = p.a; });
    return row;
  });

  const bandVals = th ? [th.action, -th.action] : [];
  const historyValues = timeHistory.flatMap((r) => ringLabels.map((l) => r[l]));
  const historyDomain = symmetricDomain(historyValues.concat(bandVals), th?.action || 1, 0.2);

  const profilePoints = [...latestPoints].sort((a, b) => a.depth - b.depth); // shallow→deep for the profile line
  const depths = profilePoints.map((p) => p.depth);
  const depthDomain = depths.length ? [Math.min(...depths), Math.max(...depths)] : [0, 1];
  const profileDomain = symmetricDomain(profilePoints.map((p) => p.a).concat(bandVals), th?.action || 1, 0.2);

  const peakRing = latestPoints.reduce((best, p) => (best == null || Math.abs(p.a) > Math.abs(best.a) ? p : best), null);

  const tableRows = rows.map((r) => {
    const pts = parseProfile(r.profileJson);
    const byLabel = Object.fromEntries(pts.map((p) => [p.label, p.a]));
    return { label: formatShortDate(r.date), values: ringLabels.map((l) => byLabel[l] ?? null) };
  });

  return (
    <section className="space-y-4">
      <ContextStrip reading={latest} extra={peakRing ? `Max ${formatSignedNumber(peakRing.a)} mm @ ${peakRing.label}` : null} />

      <ChartFrame
        title="Time History — by ring"
        subtitle={th ? `Settlement (mm) over time, by ring depth. Threshold: alert ±${th.alert} / alarm ±${th.alarm} / action ±${th.action} mm.` : "Settlement (mm) over time, by ring depth."}
        height={360}
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
            {ringLabels.map((label, i) => (
              <Line key={label} type="monotone" dataKey={label} name={label} stroke={depthSeriesPalette[i % depthSeriesPalette.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame title="Settlement Profile (latest reading)" subtitle={`${formatShortDate(latest.date)} · settlement by installation depth.`} height={380}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart layout="vertical" data={profilePoints} margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" domain={profileDomain} tick={axisTick} axisLine={false} tickLine={false}
              label={{ value: "Settlement (mm)", position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "#475569" } }} />
            <YAxis type="number" dataKey="depth" domain={depthDomain} reversed tick={axisTick} axisLine={false} tickLine={false} width={40}
              label={{ value: "Depth (m)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569" } }} />
            <Tooltip {...tooltipStyle} formatter={(value, _n, p) => [`${value} mm`, p?.payload?.label ?? ""]} labelFormatter={(d) => `Depth ${d} m`} />
            <ReferenceLine x={0} stroke="#94a3b8" />
            {th && <ReferenceLine x={th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={-th.alert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={-th.alarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            {th && <ReferenceLine x={-th.action} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="a" stroke="#0f766e" strokeWidth={2.4} dot={{ r: 4, fill: "#0f766e" }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <RawDataTable title="Settlement (mm) by ring x date" rowLabel="Date" columnLabels={ringLabels}
        rows={tableRows} digits={1} unit="mm" maxHeight={420} highlightColumn={peakRing?.label} />
    </section>
  );
}
