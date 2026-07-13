// Task R4a — port of tunnel-monitoring's src/app/page.tsx:154-192 (Summary Cards grid) + 216-242
// (SummaryCard component), navy reskin. Self-contained by design (per the brief): this component
// takes the raw project-wide arrays and computes all 5 tallies itself via instrumentDashboard.js —
// R4d (the dashboard shell) just passes data through, it does not pre-compute anything.
//
// Color choice (brief's explicit instruction, not every metric getting its own hue): all 5 cards
// share the same neutral navy/cyan-tint accent chip EXCEPT "Action Required", which is the one card
// that pulses — it gets the code-d (rose/action-required) accent + animate-pulse + glow, reusing the
// same rose="action required" meaning used everywhere else in the app (R3-source-map.md §8).
import { Gauge, ArrowRight, AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { computeComplianceTallies } from "../../utils/instrumentDashboard";

function SummaryCard({ label, value, sub, icon: Icon, pulse = false }) {
  const chipClass = pulse
    ? "bg-code-d/10 border-code-d/30 text-code-d animate-pulse shadow-[0_0_20px_rgba(185,28,28,0.5)]"
    : "bg-cyan-tint border-cyan/30 text-navy";

  return (
    <div className="bg-surface rounded-card shadow-card border border-line p-6 relative overflow-hidden">
      <div className="flex justify-between items-start mb-6">
        <p className="text-[13px] text-ink-3 font-bold tracking-wide uppercase">{label}</p>
        <div className={`p-2.5 rounded-input border shrink-0 ${chipClass}`}>
          {Icon && <Icon className="w-6 h-6" />}
        </div>
      </div>
      <div>
        <h3 className="text-3xl font-black text-ink tracking-tight mb-1.5">{value}</h3>
        <p className="text-[11px] text-ink-3 font-medium">{sub}</p>
      </div>
    </div>
  );
}

export default function ComplianceCards({ locations = [], instruments = [], schedules = [], tbmChainage, ringNo }) {
  const tallies = computeComplianceTallies({ locations, instruments, schedules, tbmChainage, ringNo });

  // R7b: tbmChainage null = position unavailable (gated non-TBM1 machine, or not loaded) → "—"
  // instead of the tally's "STA -", so a gated TBM2 never surfaces a wrong/placeholder station.
  const tbmChainageValue = tbmChainage == null ? "—" : tallies.tbmChainage.value;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
      <SummaryCard label="TBM Chainage" value={tbmChainageValue} sub={tallies.tbmChainage.sub} icon={Gauge} />
      <SummaryCard
        label="Upcoming Nodes"
        value={String(tallies.upcomingNodes)}
        sub="Locations within 50m of TBM"
        icon={ArrowRight}
      />
      <SummaryCard
        label="Action Required"
        value={String(tallies.actionRequired)}
        sub="Pending reading check-ins"
        icon={AlertTriangle}
        pulse={tallies.actionRequired > 0}
      />
      <SummaryCard
        label="Meas. Progress"
        value={`${tallies.measurementProgress.measured} / ${tallies.measurementProgress.total}`}
        sub={`${tallies.measurementProgress.percent}% of points measured`}
        icon={CheckCircle2}
      />
      <SummaryCard
        label="Inst. Installation"
        value={`${tallies.installation.installed} / ${tallies.installation.total}`}
        sub={`${tallies.installation.percent}% securely installed`}
        icon={Wrench}
      />
    </div>
  );
}
