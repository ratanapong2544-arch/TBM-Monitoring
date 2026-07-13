// ported from Instument Monitoring/tunnel-monitoring/.../reports/shared/SummaryStats.tsx
// (Task R2a) — navy reskin, default export. Table header uses the same bg-navy-dark/text-white
// treatment as RawDataTable.jsx (its closest sibling in this shared/ folder) so the two tables
// read as one family; outer card keeps its own slightly-tinted surface-alt bg (vs RawDataTable's
// plain white) to preserve the source's visual distinction between "summary" and "raw" tables.
import { formatSignedNumber } from "./chartUtils";

function pickFirstFinite(values) {
  for (const v of values) if (Number.isFinite(v)) return v;
  return null;
}

function pickLastFinite(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return null;
}

function fmt(value, digits) {
  if (value == null) return "—";
  return formatSignedNumber(value, digits);
}

export default function SummaryStats({ title = "Summary", defaultUnit, series, digits = 2 }) {
  return (
    <div className="rounded-card border border-line bg-surface-alt p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2">{title}</div>
        <div className="text-[10px] text-ink-3">unit: {defaultUnit}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy-dark text-[11px] font-bold uppercase tracking-wider text-white">
              <th className="py-2 pl-3 pr-4 text-left">Series</th>
              <th className="px-2 py-2 text-right">Initial</th>
              <th className="px-2 py-2 text-right">Latest</th>
              <th className="px-2 py-2 text-right">Max</th>
              <th className="px-2 py-2 text-right">Min</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line font-mono text-[13px] tabular-nums text-ink">
            {series.map((s) => {
              const finite = s.values.filter((v) => Number.isFinite(v));
              const initial = pickFirstFinite(s.values);
              const latest = pickLastFinite(s.values);
              const max = finite.length ? Math.max(...finite) : null;
              const min = finite.length ? Math.min(...finite) : null;
              return (
                <tr key={s.label}>
                  <td className="py-2 pl-3 pr-4 text-left">
                    <span className="inline-flex items-center gap-2 font-sans font-semibold text-ink">
                      {s.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                      )}
                      {s.label}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(initial, digits)}</td>
                  <td className="px-2 py-2 text-right font-bold">{fmt(latest, digits)}</td>
                  <td className="px-2 py-2 text-right">{fmt(max, digits)}</td>
                  <td className="px-2 py-2 text-right">{fmt(min, digits)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
