// Task 6.2 — location detail: header + back, blueprint plot, report tabs; empty state if no reading
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import BlueprintPlot from "../instrument/BlueprintPlot";
import InstrumentReportTabs from "../instrument/InstrumentReportTabs";
import { latestReading, resolveThreshold } from "../../utils/instrumentData";
import { classifyStatus } from "../../utils/instrumentStatus";
import { stationLabel } from "../../utils/chainageAdapter";

export default function InstrumentLocationView({ location = null, instruments = [], readings = [], thresholds = [], onBack, readOnly = false }) {
  const hasReadings = useMemo(() => instruments.some((i) => latestReading(readings, i.id)), [instruments, readings]);
  const statusOf = (ins) => {
    const r = latestReading(readings, ins.id);
    return r ? classifyStatus(r.maxValue ?? r.valuePrimary, resolveThreshold(thresholds, ins)) : "nodata";
  };
  if (!location) return <div className="p-6 text-ink-2">ไม่พบจุดตรวจวัด <button className="text-navy underline" onClick={onBack}>กลับ</button></div>;
  const page = instruments.find((i) => i.blueprintPage)?.blueprintPage;

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-input hover:bg-cyan-tint"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-semibold text-ink text-lg">{location.name}</h2>
          <p className="text-ink-2 text-sm">STA {stationLabel(location.chainage)} · {instruments.length} เครื่อง</p>
        </div>
      </div>
      <div className="bg-surface rounded-card shadow-card border border-line p-4">
        <h3 className="font-semibold text-ink text-sm mb-3">ตำแหน่งบนแบบแปลน</h3>
        <BlueprintPlot page={page} instruments={instruments} statusOf={statusOf} />
      </div>
      {hasReadings
        ? <InstrumentReportTabs location={location} instruments={instruments} readings={readings} thresholds={thresholds} />
        : <div className="bg-surface rounded-card shadow-card border border-line p-8 text-center text-ink-2">ยังไม่มีข้อมูลการตรวจวัด — รอส่ง PDF report เข้าระบบ</div>}
    </div>
  );
}
