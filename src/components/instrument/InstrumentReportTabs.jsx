// Task 6.3 — report tabs: one tab per instrument type present at this location
import { useState, useMemo } from "react";
import SegmentedToggle from "../../ui-ux-pro-max/components/SegmentedToggle";
import InclinometerReport from "./reports/InclinometerReport";
import ExtensometerReport from "./reports/ExtensometerReport";
import PiezometerReport from "./reports/PiezometerReport";
import SurfaceSettlementReport from "./reports/SurfaceSettlementReport";

const REPORTS = { INCLINOMETER: InclinometerReport, EXTENSOMETER: ExtensometerReport, PIEZOMETER: PiezometerReport, SETTLEMENT_POINT: SurfaceSettlementReport };
const LABEL = { INCLINOMETER: "INC", EXTENSOMETER: "EXT", PIEZOMETER: "PI", SETTLEMENT_POINT: "SS" };

export default function InstrumentReportTabs({ location, instruments = [], readings = [], thresholds = [] }) {
  const types = useMemo(() => Object.keys(REPORTS).filter((t) => instruments.some((i) => i.type === t)), [instruments]);
  const [tab, setTab] = useState(types[0]);
  const activeTab = types.includes(tab) ? tab : types[0];
  const Cur = REPORTS[activeTab] || (() => null);
  if (!types.length) return null;
  return (
    <div className="bg-surface rounded-card shadow-card border border-line p-4 space-y-4">
      <SegmentedToggle value={activeTab} onChange={setTab} options={types.map((t) => ({ value: t, label: LABEL[t] }))} />
      <Cur instruments={instruments.filter((i) => i.type === activeTab)} readings={readings} thresholds={thresholds} location={location} />
    </div>
  );
}
