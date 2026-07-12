// ponytail: temporary stub for Task 6.2 build checkpoint — replaced with real tabs+charts in Task 6.3
export default function InstrumentReportTabs({ location, instruments = [], readings = [], thresholds = [] }) {
  return (
    <div className="bg-surface rounded-card shadow-card border border-line p-4 text-ink-2 text-sm">
      report tabs — {instruments.length} instruments
    </div>
  );
}
