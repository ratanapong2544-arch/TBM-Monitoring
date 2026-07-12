// Task R4b — dashboard toolbar: type filter pills + NEAREST/CHAINAGE sort toggle + name/STA
// search. Port of tunnel-monitoring's src/components/dashboard/DataGrid.tsx:152-239 (toolbar
// controls), navy reskin. See .superpowers/sdd/R4-source-map.md §2.1 and
// .superpowers/sdd/task-R4b-brief.md.
//
// CONTROLLED component — R4d (the dashboard shell) owns filter/sortMode/search state and passes
// value+handlers down; this component renders controls only, it holds no state of its own. The
// pure filter/sort/search logic behind these controls lives in utils/instrumentDashboard.js
// (filterSortSearchLocations), not here.
//
// Sort toggle reuses the existing generic <SegmentedToggle> (ui-ux-pro-max) per the brief's "sort
// toggle เหมือน SegmentedToggle ที่มี" instruction — same 2-option segmented-control idiom already
// used elsewhere in the app, rather than hand-rolling a second one. Filter pills are a bespoke
// wrapping row (5 options, source's FILTER_OPTIONS) using the navy(active)/surface-alt(inactive)
// pairing the brief calls for — SegmentedToggle's equal-width flex-1 layout doesn't suit 5 wrapping
// labels the way it suits 2 fixed ones.
import { MapPin, Milestone, Search } from "lucide-react";
import SegmentedToggle from "../../ui-ux-pro-max/components/SegmentedToggle";

// Exact `location.type` enum + source labels (DataGrid.tsx:140-146).
const FILTER_OPTIONS = [
  { value: "ALL", label: "All Locations" },
  { value: "SHAFT", label: "Shaft" },
  { value: "BRIDGE", label: "Bridge" },
  { value: "ABOVE_TUNNEL", label: "Above Tunnel" },
  { value: "SETTLEMENT_ONLY", label: "Settlement" },
];

// Source's own Thai labels (DataGrid.tsx:214,223) — kept verbatim, not translated.
const SORT_OPTIONS = [
  {
    value: "NEAREST",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" /> ใกล้หัวเจาะที่สุด
      </span>
    ),
  },
  {
    value: "CHAINAGE",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Milestone className="w-3.5 h-3.5" /> เรียงตามระยะทาง
      </span>
    ),
  },
];

export default function DashboardToolbar({
  filter = "ALL",
  sortMode = "NEAREST",
  search = "",
  onFilterChange,
  onSortChange,
  onSearchChange,
  counts,
}) {
  return (
    <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
      {/* Filter pills (+ optional result count) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2 p-1 bg-surface-alt rounded-input border border-line">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange && onFilterChange(opt.value)}
              className={`px-4 py-2 text-sm font-medium rounded-input transition-all ${
                filter === opt.value ? "bg-navy text-white shadow-card" : "text-ink-2 hover:text-ink hover:bg-surface"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {counts != null && (
          <span className="text-xs text-ink-3 font-semibold whitespace-nowrap">
            {counts} location{counts === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Sort toggle + search */}
      <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
        <SegmentedToggle value={sortMode} onChange={onSortChange} options={SORT_OPTIONS} />

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search STA or Location..."
            value={search}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-line rounded-input text-sm text-ink placeholder-ink-3 outline-none focus:ring-1 focus:ring-navy focus:border-navy transition-all"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
