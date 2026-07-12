// Task 6.3 — Piezometer report: Time History pressure (kPa) + Time History water level (m MSL),
// each with upper/lower threshold bands, + raw data table. Ported from reports/PiezometerReport.tsx
// + PiezometerGroupReport.tsx, merged: the 3 depth-taps are bundled inside one instrument's
// profileJson.piezometers[] (not 3 sub-reports) so they're combined into a single tap dropdown
// instead of a full sub-report per tap (scope cut).
import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import ChartFrame from "./shared/ChartFrame";
import RawDataTable from "./shared/RawDataTable";
import ContextStrip from "./shared/ContextStrip";
import EmptyState from "./shared/EmptyState";
import SegmentedToggle from "../../../ui-ux-pro-max/components/SegmentedToggle";
import { autoDomain, formatShortDate, thresholdColors } from "./shared/chartUtils";
import { axisTick, gridProps, tooltipStyle } from "../../../ui-ux-pro-max/chartTheme";

function parseBundle(json) {
  if (!json || typeof json !== "string") return [];
  try {
    const v = JSON.parse(json);
    return v && Array.isArray(v.piezometers) ? v.piezometers : [];
  } catch (e) { return []; }
}

export default function PiezometerReport({ instruments = [], readings = [] }) {
  const inst = instruments[0];
  const rows = inst
    ? readings.filter((r) => String(r.instrumentId) === String(inst.id)).sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];
  const latest = rows[rows.length - 1];
  const latestTaps = latest ? parseBundle(latest.profileJson) : [];

  const [tapCode, setTapCode] = useState(null);
  const activeTapCode = latestTaps.some((t) => t.code === tapCode) ? tapCode : latestTaps[0]?.code;
  const tapIdx = latestTaps.findIndex((t) => t.code === activeTapCode);

  const history = useMemo(() => rows.map((r) => {
    const taps = parseBundle(r.profileJson);
    const tap = taps[tapIdx] ?? taps.find((t) => t.code === activeTapCode);
    return { dateLabel: formatShortDate(r.date), pressure: tap?.pressure ?? null, waterHeight: tap?.waterHeight ?? null, waterLevel: tap?.waterLevel ?? null };
  }), [rows, tapIdx, activeTapCode]);

  if (!inst || !rows.length || !latestTaps.length) return <EmptyState />;

  const activeTap = latestTaps[tapIdx] ?? latestTaps[0];
  const pressureBands = activeTap?.thresholds?.pressure;
  const waterLevelBands = activeTap?.thresholds?.waterLevel;
  const pressureDomain = autoDomain(history.map((h) => h.pressure).concat(pressureBands ? [pressureBands.upperAction, pressureBands.lowerAction] : []), 0.15);
  const waterLevelDomain = autoDomain(history.map((h) => h.waterLevel).concat(waterLevelBands ? [waterLevelBands.upperAction, waterLevelBands.lowerAction] : []), 0.15);

  return (
    <section className="space-y-4">
      <SegmentedToggle value={activeTapCode} onChange={setTapCode} options={latestTaps.map((t) => ({ value: t.code, label: t.label }))} />
      <ContextStrip reading={latest} extra={activeTap ? `${activeTap.label}: ${activeTap.pressure?.toFixed(2)} kPa / ${activeTap.waterLevel?.toFixed(2)} m MSL` : null} />

      <ChartFrame
        title={`Measured Water Pressure — ${activeTap?.label ?? ""}`}
        subtitle={pressureBands ? `Pressure (kPa) over time at depth ${activeTap?.depth} m. Bands (upper/lower): action ${pressureBands.upperAction}/${pressureBands.lowerAction}, alarm ${pressureBands.upperAlarm}/${pressureBands.lowerAlarm}, alert ${pressureBands.upperAlert}/${pressureBands.lowerAlert} kPa.` : `Pressure (kPa) over time at depth ${activeTap?.depth} m.`}
        height={340}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 12, right: 16, bottom: 40, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="dateLabel" tick={axisTick} angle={-35} textAnchor="end" height={56} interval={0} axisLine={false} tickLine={false} />
            <YAxis domain={pressureDomain} tick={axisTick} axisLine={false} tickLine={false} width={56}
              label={{ value: "kPa", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569" } }} />
            <Tooltip {...tooltipStyle} />
            {pressureBands && <ReferenceLine y={pressureBands.upperAction} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
            {pressureBands && <ReferenceLine y={pressureBands.upperAlarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
            {pressureBands && <ReferenceLine y={pressureBands.upperAlert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
            {pressureBands && <ReferenceLine y={pressureBands.lowerAlert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {pressureBands && <ReferenceLine y={pressureBands.lowerAlarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {pressureBands && <ReferenceLine y={pressureBands.lowerAction} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="pressure" name={`${activeTap?.code ?? ""} Pressure (kPa)`} stroke="#0284c7" strokeWidth={2.4} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title={`Water Level (m MSL) — ${activeTap?.label ?? ""}`}
        subtitle={waterLevelBands ? `Water level above mean sea level at depth ${activeTap?.depth} m. Bands (upper/lower): action ${waterLevelBands.upperAction}/${waterLevelBands.lowerAction}, alarm ${waterLevelBands.upperAlarm}/${waterLevelBands.lowerAlarm}, alert ${waterLevelBands.upperAlert}/${waterLevelBands.lowerAlert} m MSL.` : `Water level above mean sea level at depth ${activeTap?.depth} m.`}
        height={340}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 12, right: 16, bottom: 40, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="dateLabel" tick={axisTick} angle={-35} textAnchor="end" height={56} interval={0} axisLine={false} tickLine={false} />
            <YAxis domain={waterLevelDomain} tick={axisTick} axisLine={false} tickLine={false} width={64}
              label={{ value: "m MSL", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569" } }} />
            <Tooltip {...tooltipStyle} />
            {waterLevelBands && <ReferenceLine y={waterLevelBands.upperAction} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />}
            {waterLevelBands && <ReferenceLine y={waterLevelBands.upperAlarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />}
            {waterLevelBands && <ReferenceLine y={waterLevelBands.upperAlert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />}
            {waterLevelBands && <ReferenceLine y={waterLevelBands.lowerAlert} stroke={thresholdColors.alert} strokeDasharray="4 4" />}
            {waterLevelBands && <ReferenceLine y={waterLevelBands.lowerAlarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />}
            {waterLevelBands && <ReferenceLine y={waterLevelBands.lowerAction} stroke={thresholdColors.action} strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="waterLevel" name={`${activeTap?.code ?? ""} Water Level (m MSL)`} stroke="#7c3aed" strokeWidth={2.4} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <RawDataTable
        title={`Reading log — ${activeTap?.code ?? ""} (${activeTap?.label ?? ""})`}
        rowLabel="Date"
        columnLabels={["Pressure (kPa)", "Water Height (m)", "Water Level (m MSL)"]}
        rows={history.map((h) => ({ label: h.dateLabel, values: [h.pressure, h.waterHeight, h.waterLevel] }))}
        digits={3}
        maxHeight={420}
        highlightColumn="Water Level (m MSL)"
      />
    </section>
  );
}
