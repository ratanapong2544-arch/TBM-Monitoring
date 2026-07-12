// Task 6.2 — blueprint plot: shows the location's blueprint page PNG with instrument pins
// positioned by blueprintX/blueprintY (%). Pin color = status (code-a/b/c/d), matches
// InstrumentStatusBadge's palette.
export default function BlueprintPlot({ page, instruments = [], statusOf }) {
  if (!page) return <div className="text-ink-3 text-sm p-4">ไม่มีแบบแปลนสำหรับจุดนี้</div>;
  return (
    <div className="relative w-full overflow-hidden rounded-card border border-line bg-surface">
      <img src={`/blueprints/page_${page}.png`} alt={`blueprint ${page}`} className="w-full" />
      {instruments.filter((i) => i.blueprintX !== "" && i.blueprintY !== "").map((i) => (
        <div key={i.id} title={i.code}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ring-white"
          style={{ left: `${i.blueprintX}%`, top: `${i.blueprintY}%`,
            background: ({ normal: "#10463A", alert: "#B8860B", alarm: "#C8500A", action: "#B91C1C", nodata: "#9CA3AF" })[statusOf ? statusOf(i) : "nodata"] || "#9CA3AF" }} />
      ))}
    </div>
  );
}
