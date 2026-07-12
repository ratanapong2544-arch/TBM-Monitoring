// ported from .../reports/shared/ChartFrame.tsx (Task 6.1) — navy reskin, default export
// (matches this app's component convention instead of the source's named export)
export default function ChartFrame({ title, subtitle, height = 380, children }) {
  return (
    <div className="bg-surface border border-line rounded-card shadow-card px-4 pt-4 pb-3">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-ink">{title}</div>
          {subtitle && <div className="text-xs text-ink-2 mt-0.5">{subtitle}</div>}
        </div>
      </div>
      <div style={{ height }} className="w-full">
        {children}
      </div>
    </div>
  );
}
