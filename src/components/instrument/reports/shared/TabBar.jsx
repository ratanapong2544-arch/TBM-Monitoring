// ported from Instument Monitoring/tunnel-monitoring/.../reports/shared/TabBar.tsx (Task R2a)
// — navy reskin, default export. Two variants: "primary" (bordered pill nav, active = solid
// navy fill — same active/inactive recipe as MobileDashboardTabs.jsx, this app's existing tab
// bar) and "secondary" (compact pills inside a tray, active = raised surface pill, matching
// SegmentedToggle.jsx's tray but with a white/surface active state instead of a navy fill so
// the two variants stay visually distinct, as in the source). Icon is passed in via prop
// (lucide-react component) — this file does not import icons itself.
export default function TabBar({ tabs, activeId, onChange, variant = "primary" }) {
  if (variant === "secondary") {
    return (
      <div className="inline-flex flex-wrap gap-1 rounded-card border border-line bg-surface-alt p-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-input px-3 py-1.5 text-xs font-bold transition ${
                isActive
                  ? "bg-surface text-ink shadow-card"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              {Icon && <Icon className={`h-3 w-3 ${isActive ? "text-navy" : "text-ink-3"}`} />}
              <span className="font-mono tracking-tight">{tab.label}</span>
              {tab.sublabel && (
                <span className={`text-[10px] font-medium ${isActive ? "text-ink-2" : "text-ink-3"}`}>
                  · {tab.sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <nav className="-mx-1 flex flex-wrap gap-1.5 overflow-x-auto px-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`group inline-flex items-center gap-2 rounded-card border px-3.5 py-2 text-xs font-bold transition ${
              isActive
                ? "border-navy bg-navy text-white shadow-card"
                : "border-line bg-surface text-ink hover:bg-surface-alt"
            }`}
          >
            {Icon && <Icon className={`h-3.5 w-3.5 ${isActive ? "text-white" : "text-ink-2"}`} />}
            <span className="font-mono tracking-tight">{tab.label}</span>
            {tab.sublabel && (
              <span
                className={`hidden text-[10px] font-medium uppercase tracking-wider sm:inline ${
                  isActive ? "text-white/70" : "text-ink-3"
                }`}
              >
                · {tab.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
