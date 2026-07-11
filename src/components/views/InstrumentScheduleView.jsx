// ponytail: stub view — เนื้อหาจริง (ตาราง/ปฏิทินวาระตรวจวัด + write handlers) มาใน Phase 7
export default function InstrumentScheduleView({ schedules = [], locations = [], machineProgress, onMark, readOnly = false }) {
  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <div className="bg-surface rounded-card shadow-card border border-line p-6">
        <h2 className="font-semibold text-ink text-lg">วาระตรวจวัด</h2>
        <p className="text-ink-2 text-sm mt-1">schedules: {schedules.length} · locations: {locations.length}</p>
      </div>
    </div>
  );
}
