// ponytail: stub view — เนื้อหาจริง (blueprint + status cards) มาใน Phase 5
export default function InstrumentDashboardView({ locations = [], instruments = [], readings = [], thresholds = [], machineProgress, onOpenLocation, readOnly = false }) {
  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="bg-surface rounded-card shadow-card border border-line p-6">
        <h2 className="font-semibold text-ink text-lg">Instrument Dashboard</h2>
        <p className="text-ink-2 text-sm mt-1">locations: {locations.length} · instruments: {instruments.length} · readings: {readings.length}</p>
      </div>
    </div>
  );
}
