// ported from .../reports/shared/RawDataTable.tsx (Task 6.1) — navy header (matches
// InstrumentDashboardView's table), sticky header + sticky first column, default export

function fmt(v, digits) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export default function RawDataTable({
  title, subtitle, rowLabel, columnLabels, rows, digits = 2, unit, maxHeight, highlightColumn,
}) {
  const wrapperStyle = maxHeight ? { maxHeight, overflowY: "auto" } : undefined;

  return (
    <div className="bg-surface border border-line rounded-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-ink-2">{subtitle}</div>}
        </div>
        {unit && <div className="text-[10px] text-ink-3">unit: {unit}</div>}
      </div>
      <div className="overflow-x-auto" style={wrapperStyle}>
        <table className="w-full min-w-max text-xs">
          <thead className="sticky top-0 z-10 bg-navy-dark text-white">
            <tr className="text-[10px] font-bold uppercase tracking-wider">
              <th className="sticky left-0 z-20 bg-navy-dark px-2 py-2 text-left">{rowLabel}</th>
              {columnLabels.map((label) => (
                <th
                  key={label}
                  className={`px-2 py-2 text-right ${label === highlightColumn ? "bg-cyan-med/60" : ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line font-mono tabular-nums text-ink">
            {rows.map((row) => (
              <tr key={row.label} className="hover:bg-cyan-tint">
                <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-sans font-semibold text-ink-2">
                  {row.label}
                </td>
                {row.values.map((v, ci) => (
                  <td
                    key={ci}
                    className={`px-2 py-1.5 text-right ${columnLabels[ci] === highlightColumn ? "bg-cyan-tint font-bold text-navy" : ""}`}
                  >
                    {fmt(v, digits)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
