// Task R2c — Piezometer report, full fidelity vs tunnel-monitoring's
// {PiezometerReport,PiezometerGroupReport}.tsx. Restores what v1 (Task 6.3) cut: ReportShell
// wrapper (code/type/date/station + active-sensor maxLine banner), 3-sensor secondary sub-tabs via
// TabBar (was SegmentedToggle), time-based X axis matching R2b's INC/EXT/SS pattern (was a category
// dateLabel axis), and SummaryStats (3 series: pressure / water height / water level). No
// dual-axis/station overlay here — confirmed by reading source's PiezometerReport.tsx directly: it
// has neither (that pattern is INC/EXT/SS-only, per the brief's own "ถ้า source มี" condition).
// Source splits PiezometerReport (single-sensor, own shell) + PiezometerGroupReport (shell + TabBar
// + shared body) into two files; kept as ONE file here, matching R2b's InclinometerReport precedent
// (no other caller in this app needs a standalone single-sensor variant without the outer shell).
// Data model: this app bundles all depth-taps under ONE PIEZOMETER instrument's readings
// (profileJson.piezometers[]), not N separate instruments like source's report.piezometers[] — so
// each tap's "history over time" is reconstructed by re-parsing every reading's bundle for that tap
// (unchanged from v1).
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
import { autoDomain, formatDateTick, formatShortDate, parseDateToMs, thresholdColors, weeklyTickTimestamps } from "./shared/chartUtils";
import { axisTick, gridProps, tooltipStyle } from "../../../ui-ux-pro-max/chartTheme";

function parseBundle(json) {
  if (!json || typeof json !== "string") return [];
  try {
    const v = JSON.parse(json);
    return v && Array.isArray(v.piezometers) ? v.piezometers : [];
  } catch (e) { return []; }
}

function renderBandLines(b) {
  if (!b) return null;
  return [
    <ReferenceLine key="ua" y={b.upperAction} stroke={thresholdColors.action} strokeDasharray="4 4" label={{ value: "Action", position: "right", fill: thresholdColors.action, fontSize: 10 }} />,
    <ReferenceLine key="um" y={b.upperAlarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" label={{ value: "Alarm", position: "right", fill: thresholdColors.alarm, fontSize: 10 }} />,
    <ReferenceLine key="ut" y={b.upperAlert} stroke={thresholdColors.alert} strokeDasharray="4 4" label={{ value: "Alert", position: "right", fill: thresholdColors.alert, fontSize: 10 }} />,
    <ReferenceLine key="lt" y={b.lowerAlert} stroke={thresholdColors.alert} strokeDasharray="4 4" />,
    <ReferenceLine key="lm" y={b.lowerAlarm} stroke={thresholdColors.alarm} strokeDasharray="4 4" />,
    <ReferenceLine key="la" y={b.lowerAction} stroke={thresholdColors.action} strokeDasharray="4 4" />,
  ];
}

function domainWithBands(values, b) {
  const all = b ? [...values, b.upperAction, b.lowerAction] : values;
  return autoDomain(all, 0.15);
}

function tooltipLabel(parsedRows) {
  return (label) => {
    const ts = Number(label);
    if (!Number.isFinite(ts)) return formatShortDate(String(label));
    const point = parsedRows.find((p) => p.ts === ts);
    return formatShortDate(point?.date ?? formatDateTick(ts));
  };
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

  if (!inst || !rows.length || !latestTaps.length) return <EmptyState />;

  const activeTap = latestTaps[tapIdx] ?? latestTaps[0];
  const pressureBands = activeTap?.thresholds?.pressure;
  const waterLevelBands = activeTap?.thresholds?.waterLevel;

  const parsedRows = rows.map((r) => {
    const taps = parseBundle(r.profileJson);
    const tap = taps[tapIdx] ?? taps.find((t) => t.code === activeTapCode);
    return { date: r.date, ts: parseDateToMs(r.date), pressure: tap?.pressure ?? null, waterHeight: tap?.waterHeight ?? null, waterLevel: tap?.waterLevel ?? null };
  });

  const pressureDomain = domainWithBands(parsedRows.map((h) => h.pressure), pressureBands);
  const waterLevelDomain = domainWithBands(parsedRows.map((h) => h.waterLevel), waterLevelBands);

  const startDate = rows[0].date;
  const endDate = rows[rows.length - 1].date;
  const dateDomain = [parseDateToMs(startDate), parseDateToMs(endDate)];
  const dateTicks = weeklyTickTimestamps(startDate, endDate, 10);
  const labelForTs = tooltipLabel(parsedRows);

  const tabs = latestTaps.map((t) => ({ id: t.code, label: t.label, sublabel: t.code }));

  const summarySeries = [
    { label: "Pressure (kPa)", color: "#0284c7", unit: "kPa", values: parsedRows.map((h) => h.pressure) },
    { label: "Water Height (m)", color: "#0f766e", unit: "m", values: parsedRows.map((h) => h.waterHeight) },
    { label: "Water Level (m MSL)", color: "#7c3aed", unit: "m MSL", values: parsedRows.map((h) => h.waterLevel) },
  ];

  const maxLine = Number.isFinite(activeTap.pressure) && Number.isFinite(activeTap.waterLevel)
    ? `Active sensor ${activeTap.code} (${activeTap.label}) · Latest ${activeTap.pressure.toFixed(2)} kPa / ${activeTap.waterLevel.toFixed(2)} m MSL on ${formatShortDate(latest.date)}`
    : null;

  return (
    <ReportShell
      code={inst.code || inst.id}
      typeLabel={`Vibrating Wire Piezometer (${latestTaps.length} sensors)`}
      reportDate={latest.date}
      station={latest.tbmChainage}
      ring={null}
      maxLine={maxLine}
      badgeColor="#7c3aed"
    >
      <section className="space-y-4">
        <TabBar tabs={tabs} activeId={activeTapCode} onChange={setTapCode} variant="secondary" />

        <ChartFrame
          title={`Measured Water Pressure — ${activeTap.label}`}
          subtitle={pressureBands
            ? `Pressure (kPa) over time at depth ${activeTap.depth} m. Bands (upper/lower): action ${pressureBands.upperAction}/${pressureBands.lowerAction}, alarm ${pressureBands.upperAlarm}/${pressureBands.lowerAlarm}, alert ${pressureBands.upperAlert}/${pressureBands.lowerAlert} kPa.`
            : `Pressure (kPa) over time at depth ${activeTap.depth} m.`}
          height={380}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={parsedRows} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                type="number" dataKey="ts" domain={dateDomain} ticks={dateTicks} tickFormatter={formatDateTick}
                tick={axisTick} tickLine={false} angle={-45} textAnchor="end" height={70} scale="time"
              />
              <YAxis domain={pressureDomain} tick={axisTick} tickLine={false} width={56}
                label={{ value: "kPa", angle: -90, position: "insideLeft", fill: "#666666", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} labelFormatter={labelForTs} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {renderBandLines(pressureBands)}
              <Line type="monotone" dataKey="pressure" name={`${activeTap.code} Pressure (kPa)`} stroke="#0284c7" strokeWidth={2.4} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title={`Water Level (m MSL) — ${activeTap.label}`}
          subtitle={waterLevelBands
            ? `Water level above mean sea level over time at depth ${activeTap.depth} m. Bands (upper/lower): action ${waterLevelBands.upperAction}/${waterLevelBands.lowerAction}, alarm ${waterLevelBands.upperAlarm}/${waterLevelBands.lowerAlarm}, alert ${waterLevelBands.upperAlert}/${waterLevelBands.lowerAlert} m MSL.`
            : `Water level above mean sea level over time at depth ${activeTap.depth} m.`}
          height={380}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={parsedRows} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                type="number" dataKey="ts" domain={dateDomain} ticks={dateTicks} tickFormatter={formatDateTick}
                tick={axisTick} tickLine={false} angle={-45} textAnchor="end" height={70} scale="time"
              />
              <YAxis domain={waterLevelDomain} tick={axisTick} tickLine={false} width={64}
                label={{ value: "m MSL", angle: -90, position: "insideLeft", fill: "#666666", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} labelFormatter={labelForTs} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {renderBandLines(waterLevelBands)}
              <Line type="monotone" dataKey="waterLevel" name={`${activeTap.code} Water Level (m MSL)`} stroke="#7c3aed" strokeWidth={2.4} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <RawDataTable
          title={`Reading log — ${activeTap.code} (${activeTap.label})`}
          subtitle={`Source: reading log for sensor at depth ${activeTap.depth} m. Columns: pressure / water height / water level (m MSL).`}
          rowLabel="Date"
          columnLabels={["Pressure (kPa)", "Water Height (m)", "Water Level (m MSL)"]}
          rows={parsedRows.map((h) => ({ label: formatShortDate(h.date), values: [h.pressure, h.waterHeight, h.waterLevel] }))}
          digits={3}
          unit="mixed"
          maxHeight={420}
          highlightColumn="Water Level (m MSL)"
        />

        <SummaryStats title={`Summary — ${activeTap.code} (${activeTap.label})`} defaultUnit="mixed" series={summarySeries} digits={3} />
      </section>
    </ReportShell>
  );
}
