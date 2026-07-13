// Task R2c — report tabs: ReportHeader (location-wide summary card) + primary icon TabBar (one tab
// per instrument type present at this location) + active report. Ported from tunnel-monitoring's
// ReportTabs.tsx (slate → navy), replacing the plain SegmentedToggle used since Task 6.3. Field
// derivation is graceful-fallback, never fabricated: Source/Report Date come from the single latest
// real reading (any instrument, any type) at this location; Cover STA / Instrument STA come from the
// real Inst_Locations row (actualChainage is blank for every location except 8+300 per the design
// spec — renders "—" there, not invented); TBM STA/Ring come from the optional `machineProgress`
// prop via the existing chainageAdapter utility, scoped to the active machine (R7b). `machineProgress`
// is optional so callers can omit it. TBM STA is GATED to the active machine's TBM1 branch only:
// currentChainage's `CH_EXCAV_START − dist` formula is correct solely for TBM1 (chainage decreasing);
// TBM2 increases from IS04 and its launch CH/direction is undefined ("กำหนดภายหลัง"), so a computed
// TBM2 STA would be wrong-direction — we show "—" instead of a wrong number (same gate as the
// dashboard/schedule/location views). Ring count is machine-independent (a plain count) so it reads
// the active machine directly, ungated.
import { useMemo, useState } from "react";
import { Activity, Droplets, Layers, MapPin } from "lucide-react";
import TabBar from "./reports/shared/TabBar";
import { formatShortDate } from "./reports/shared/chartUtils";
import { currentChainage, stationLabel } from "../../utils/chainageAdapter";
import InclinometerReport from "./reports/InclinometerReport";
import ExtensometerReport from "./reports/ExtensometerReport";
import PiezometerReport from "./reports/PiezometerReport";
import SurfaceSettlementReport from "./reports/SurfaceSettlementReport";

const REPORTS = { INCLINOMETER: InclinometerReport, EXTENSOMETER: ExtensometerReport, PIEZOMETER: PiezometerReport, SETTLEMENT_POINT: SurfaceSettlementReport };
const LABEL = { INCLINOMETER: "INC", EXTENSOMETER: "EXT", PIEZOMETER: "PI", SETTLEMENT_POINT: "SS" };
const SUBLABEL = { INCLINOMETER: "Inclinometer", EXTENSOMETER: "Extensometer", PIEZOMETER: "Piezometer", SETTLEMENT_POINT: "Surface Settlement" };
const ICON = { INCLINOMETER: Activity, EXTENSOMETER: Layers, PIEZOMETER: Droplets, SETTLEMENT_POINT: MapPin };

function latestOf(readings) {
  return readings.reduce((best, r) => (!best || new Date(r.date) > new Date(best.date) ? r : best), null);
}

function Stat({ label, value }) {
  return (
    <div className="rounded-input border border-line bg-surface-alt px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-2">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function ReportHeader({ location, readings, machineProgress, activeMachine }) {
  const latest = latestOf(readings);
  // R7b: gate TBM STA to TBM1 (only machine whose CH formula is valid); TBM2 → null → "—".
  const tbmSta = activeMachine === "TBM1" ? currentChainage(machineProgress, activeMachine) : null;
  const rings = machineProgress?.[activeMachine]?.rings;

  return (
    <section className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.28em] text-ink-2">Measurement Report</div>
          <h3 className="mt-1 text-lg font-black text-ink">{location?.name ?? "—"}</h3>
          <p className="mt-1 text-xs text-ink-2">
            Source: <span className="font-mono">{latest?.sourcePdf || "—"}</span>
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label="Report Date" value={latest ? formatShortDate(latest.date) : "—"} />
          <Stat label="Cover STA" value={stationLabel(location?.chainage)} />
          <Stat label="Instrument STA" value={location?.actualChainage != null ? stationLabel(location.actualChainage) : "—"} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-ink-2">
        <span className="rounded-full bg-surface-alt px-2.5 py-0.5">TBM STA {stationLabel(tbmSta)}</span>
        {Number.isFinite(rings) && <span className="rounded-full bg-surface-alt px-2.5 py-0.5">Ring #{rings}</span>}
      </div>
    </section>
  );
}

export default function InstrumentReportTabs({ location, instruments = [], readings = [], thresholds = [], machineProgress = null, activeMachine = "TBM1" }) {
  const types = useMemo(() => Object.keys(REPORTS).filter((t) => instruments.some((i) => i.type === t)), [instruments]);
  const [tab, setTab] = useState(types[0]);
  const activeTab = types.includes(tab) ? tab : types[0];
  const Cur = REPORTS[activeTab] || (() => null);
  if (!types.length) return null;

  const tabs = types.map((t) => ({ id: t, label: LABEL[t], sublabel: SUBLABEL[t], icon: ICON[t] }));

  return (
    <div className="space-y-5">
      <ReportHeader location={location} readings={readings} machineProgress={machineProgress} activeMachine={activeMachine} />
      <TabBar tabs={tabs} activeId={activeTab} onChange={setTab} variant="primary" />
      <Cur instruments={instruments.filter((i) => i.type === activeTab)} readings={readings} thresholds={thresholds} location={location} />
    </div>
  );
}
