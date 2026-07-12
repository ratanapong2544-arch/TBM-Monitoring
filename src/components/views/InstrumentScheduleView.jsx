import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import StatCard from "../common/StatCard";
import { scheduleStatus, summarizeSchedules } from "../../utils/instrumentSchedule";
import { currentChainage, stationLabel } from "../../utils/chainageAdapter";

const STATUS_CLS = { due:"text-code-b", overdue:"text-code-d", done:"text-code-a", pending:"text-ink-3", na:"text-ink-3" };
const today = () => new Date().toISOString();

export default function InstrumentScheduleView({ schedules = [], locations = [], machineProgress, onMark, readOnly = false }) {
  const [locFilter, setLocFilter] = useState("all");
  const cur = currentChainage(machineProgress, "TBM1"); // อ้าง TBM1 เป็นหลัก (project-wide)
  const now = today();
  const locName = useMemo(() => Object.fromEntries(locations.map((l) => [String(l.id), l.name])), [locations]);
  const sum = useMemo(() => summarizeSchedules(schedules, cur, now), [schedules, cur, now]);
  const rows = useMemo(() => {
    const list = locFilter === "all" ? schedules : schedules.filter((s) => String(s.locationId) === locFilter);
    return list.map((s) => ({ s, st: scheduleStatus(s, cur, now) }))
      .sort((a, b) => ({ overdue:0, due:1, pending:2, done:3, na:4 })[a.st] - ({ overdue:0, due:1, pending:2, done:3, na:4 })[b.st]);
  }, [schedules, locFilter, cur, now]);

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="ถึงกำหนด" value={sum.due} subtext="Due" color="text-code-b" />
        <StatCard label="เลยกำหนด" value={sum.overdue} subtext="Overdue" color="text-code-d" />
        <StatCard label="รอ" value={sum.pending} subtext="Pending" color="text-ink-2" />
        <StatCard label="เสร็จ" value={sum.done} subtext="Done" color="text-code-a" />
      </div>
      <div className="bg-surface rounded-card shadow-card border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-surface-alt flex items-center gap-3">
          <h3 className="font-semibold text-ink">วาระตรวจวัด</h3>
          <select className="ml-auto border border-line rounded-input px-2 py-1 text-sm" value={locFilter} onChange={(e) => setLocFilter(e.target.value)}>
            <option value="all">ทุกจุด</option>
            {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white uppercase bg-navy-dark">
              <tr><th className="px-4 py-2">จุด</th><th className="px-4 py-2">ชนิด</th><th className="px-4 py-2">กำหนด</th><th className="px-4 py-2">สถานะ</th>{!readOnly && <th className="px-4 py-2"></th>}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ s, st }) => (
                <tr key={s.id} className="hover:bg-cyan-tint">
                  <td className="px-4 py-2.5 text-ink">{locName[String(s.locationId)] || s.locationId}</td>
                  <td className="px-4 py-2.5 text-ink-2">{s.scheduleType === "LONG_TERM" ? s.longTermLabel : `${s.instrumentGroup} @${s.distanceOffset}m`}</td>
                  <td className="px-4 py-2.5 text-ink-2">{s.scheduleType === "DISTANCE" ? stationLabel(s.tbmChainage) : (s.targetDate || "-")}</td>
                  <td className={`px-4 py-2.5 font-semibold ${STATUS_CLS[st]}`}>{st}</td>
                  {!readOnly && <td className="px-4 py-2.5">{st !== "done" && onMark && <button onClick={() => onMark({ ...s, isMeasured:true, measuredAt: today() })} className="p-1.5 rounded hover:bg-code-a/10 text-code-a"><Check size={16} /></button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
