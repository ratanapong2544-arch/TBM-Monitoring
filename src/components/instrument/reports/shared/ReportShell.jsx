// ported from Instument Monitoring/tunnel-monitoring/.../reports/shared/ReportShell.tsx
// (Task R2a) — navy reskin, default export (matches this app's component convention).
// Header card: type badge (colored bar) + code + Date/TBM Station/Ring stat trio, with an
// optional highlighted "maxLine" banner (reuses the code-b/gold badge convention from
// Badge.jsx / ReportView.jsx instead of the source's raw amber-*, so it blends with the
// app's own status-color language).
import { formatShortDate, formatStation } from "./chartUtils";

function Stat({ label, value }) {
  return (
    <div className="rounded-input border border-line bg-surface-alt px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-2">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-ink">{value}</div>
    </div>
  );
}

export default function ReportShell({
  code,
  typeLabel,
  reportDate,
  station,
  ring,
  maxLine,
  badgeColor = "#003B84",
  children,
}) {
  return (
    <div className="space-y-5">
      <header className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-10 w-1.5 rounded-full"
              style={{ backgroundColor: badgeColor }}
            />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2">{typeLabel}</div>
              <h3 className="text-lg font-bold text-ink">{code}</h3>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Date" value={formatShortDate(reportDate)} />
            <Stat label="TBM Station" value={formatStation(station)} />
            <Stat label="Ring" value={ring != null ? `#${ring}` : "—"} />
          </div>
        </div>

        {maxLine && (
          <div className="mt-3 flex items-center gap-2 rounded-input border border-code-b/30 bg-code-b/10 px-3 py-2 text-xs font-semibold text-code-b">
            <span className="h-1.5 w-1.5 rounded-full bg-code-b" />
            {maxLine}
          </div>
        )}
      </header>

      {children}
    </div>
  );
}
