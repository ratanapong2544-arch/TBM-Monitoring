import { useMemo } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import StatCard from "../common/StatCard";
import { classifyStatus, worstStatus } from "../../utils/instrumentStatus";
import { resolveThreshold, latestReading } from "../../utils/instrumentData";
import { currentChainage, stationLabel } from "../../utils/chainageAdapter";
import InstrumentStatusBadge from "../instrument/InstrumentStatusBadge";

export default function InstrumentDashboardView({ locations = [], instruments = [], readings = [], thresholds = [], machineProgress, onOpenLocation, readOnly = false }) {
  const instStatus = useMemo(() => {
    const map = {};
    instruments.forEach((ins) => {
      const r = latestReading(readings, ins.id);
      const th = resolveThreshold(thresholds, ins);
      map[ins.id] = r ? classifyStatus(r.maxValue ?? r.valuePrimary, th) : "normal";
    });
    return map;
  }, [instruments, readings, thresholds]);

  const counts = useMemo(() => {
    const c = { normal: 0, alert: 0, alarm: 0, action: 0 };
    Object.values(instStatus).forEach((s) => { c[s] = (c[s] || 0) + 1; });
    return c;
  }, [instStatus]);

  const cur = { TBM1: currentChainage(machineProgress, "TBM1"), TBM2: currentChainage(machineProgress, "TBM2") };

  const locRows = useMemo(() =>
    [...locations].sort((a, b) => Number(a.chainage) - Number(b.chainage)).map((loc) => {
      const insList = instruments.filter((i) => String(i.locationId) === String(loc.id));
      return { loc, count: insList.length, status: worstStatus(insList.map((i) => instStatus[i.id])) };
    }), [locations, instruments, instStatus]);

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="ปกติ" value={counts.normal} subtext="Normal" color="text-code-a" icon={Activity} />
        <StatCard label="Alert" value={counts.alert} subtext="เฝ้าระวัง" color="text-code-b" icon={AlertTriangle} />
        <StatCard label="Alarm" value={counts.alarm} subtext="เตือน" color="text-code-c" icon={AlertTriangle} />
        <StatCard label="Action" value={counts.action} subtext="วิกฤต" color="text-code-d" icon={AlertTriangle} />
      </div>
      <div className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-surface-alt flex items-center justify-between">
          <h3 className="font-semibold text-ink">จุดตรวจวัด ({locRows.length})</h3>
          <span className="text-xs text-ink-2">TBM1 {stationLabel(cur.TBM1)} · TBM2 {stationLabel(cur.TBM2)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white uppercase bg-navy-dark">
              <tr><th className="px-4 py-2">จุด</th><th className="px-4 py-2">STA</th><th className="px-4 py-2">เครื่อง</th><th className="px-4 py-2">สถานะ</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {locRows.map(({ loc, count, status }) => (
                <tr key={loc.id} className="hover:bg-cyan-tint cursor-pointer" onClick={() => onOpenLocation(loc.id)}>
                  <td className="px-4 py-2.5 text-ink font-medium">{loc.name}</td>
                  <td className="px-4 py-2.5 text-ink-2">{stationLabel(loc.chainage)}</td>
                  <td className="px-4 py-2.5 text-ink-2">{count}</td>
                  <td className="px-4 py-2.5"><InstrumentStatusBadge status={status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
