// ponytail: stub view — เนื้อหาจริง (blueprint + report tabs + charts) มาใน Phase 6
export default function InstrumentLocationView({ location = null, instruments = [], readings = [], thresholds = [], onBack, readOnly = false }) {
  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="bg-surface rounded-card shadow-card border border-line p-6">
        <h2 className="font-semibold text-ink text-lg">{location ? location.name : "Instrument Location"}</h2>
        <p className="text-ink-2 text-sm mt-1">instruments: {instruments.length} · readings: {readings.length} · thresholds: {thresholds.length}</p>
      </div>
    </div>
  );
}
