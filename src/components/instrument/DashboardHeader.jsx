// Task R4a — port of tunnel-monitoring's src/app/page.tsx:122-151 (glass header + TBM Position
// badge), navy reskin. Sticky positioning is intentionally NOT included here — R4d owns page layout
// (.superpowers/sdd/task-R4a-brief.md).
//
// ringNo has no home in `machineProgress` today (R4-source-map.md §3.3.6) — it stays an optional
// prop. The Ring pill only renders when ringNo is truthy, mirroring source's own
// `{tbmPosition.ringNo && <pill>}` conditional (page.tsx:145) — no fabricated ring number.
import { Gauge } from "lucide-react";
import { stationLabel } from "../../utils/chainageAdapter";

export default function DashboardHeader({ tbmChainage, ringNo }) {
  return (
    <header className="bg-surface rounded-card shadow-card border border-line px-6 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-navy-dark via-navy to-cyan-med bg-clip-text text-transparent">
          Instrument Monitoring
        </h1>
        <p className="text-sm text-ink-2 font-semibold mt-1">BMA Drainage Tunnel — คลองเปรมประชากร</p>
      </div>

      <div className="bg-surface-alt border border-line rounded-input px-6 py-3 flex items-center gap-4 shrink-0">
        <div className="h-12 w-12 rounded-full bg-cyan-tint border border-cyan/30 flex items-center justify-center text-navy shrink-0">
          <Gauge className="w-6 h-6" />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-cyan-med font-black uppercase tracking-widest">TBM Position</span>
          <span className="text-lg font-black text-ink tracking-tight">
            STA {stationLabel(tbmChainage)}
            {ringNo && (
              <span className="text-cyan-med font-bold ml-2 text-sm bg-cyan-tint px-2 py-0.5 rounded-badge">
                Ring #{ringNo}
              </span>
            )}
          </span>
        </div>
      </div>
    </header>
  );
}
