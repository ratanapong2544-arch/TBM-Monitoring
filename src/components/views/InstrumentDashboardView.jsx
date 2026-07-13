// Task R4d — dashboard shell: assembles R4a (DashboardHeader + ComplianceCards) + R4b
// (DashboardToolbar + filterSortSearchLocations) + R4c (LocationCard) into the full compliance
// dashboard. Full replacement of the v1 alert-monitor table (measurement-value status, a different
// concept entirely — see .superpowers/sdd/R4-source-map.md §4). Port of tunnel-monitoring's
// src/app/page.tsx:122-208 (page layout) + DataGrid.tsx's grid/empty-state (241-259). See
// .superpowers/sdd/task-R4d-brief.md.
//
// This view owns filter/sortMode/search state (DashboardToolbar is a controlled component, R4b) and
// pre-groups schedules/instruments by locationId ONCE (memoized) instead of each LocationCard running
// its own .filter() over the full project-wide arrays (R4-source-map.md §3.3.1).
//
// ringNo: intentionally NOT passed to DashboardHeader/ComplianceCards — `machineProgress` has no
// project-wide ring number (R4-source-map.md §3.3.6). Both components already render gracefully
// without it ("—" / hidden pill) — no fabricated value here.
import { useMemo, useState } from "react";
import { Milestone } from "lucide-react";
import DashboardHeader from "../instrument/DashboardHeader";
import ComplianceCards from "../instrument/ComplianceCards";
import DashboardToolbar from "../instrument/DashboardToolbar";
import LocationCard from "../instrument/LocationCard";
import { filterSortSearchLocations, tallyMeasurementProgress } from "../../utils/instrumentDashboard";
import { currentChainage, locationMachine } from "../../utils/chainageAdapter";

export default function InstrumentDashboardView({
  locations = [],
  instruments = [],
  schedules = [],
  machineProgress,
  activeMachine = "TBM1",
  onOpenLocation,
  onMark,
  readOnly = false,
}) {
  const [filter, setFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("NEAREST");
  const [search, setSearch] = useState("");

  // R7b gate: currentChainage's CH_EXCAV_START − dist formula is valid only for TBM1 (chainage
  // decreasing). TBM2 increases from IS04 and its launch CH/direction is undefined ("กำหนดภายหลัง"),
  // so a computed TBM2 chainage would trend the wrong way. Show it as unavailable (null) → "—" in
  // DashboardHeader/ComplianceCards, never a wrong number. Wire the real value here once TBM2 gets a
  // launch config.
  const tbmChainage = activeMachine === "TBM1" ? currentChainage(machineProgress, activeMachine) : null;

  // Task R7b — machine-aware slice. Instrument data is project-wide (one sheet); TBM1/TBM2 is a
  // VIEW-level filter by chainage zone (locationMachine, chainageAdapter.js), applied BEFORE the
  // pre-grouping/tallies/toolbar filter below so every downstream count (cards, subtitle, grid) is
  // scoped to the active machine only. TBM2 currently has no locations (launch CH not yet defined)
  // → machineLocations comes back empty and the view renders the empty state further down, never a
  // fabricated position/list.
  const machineLocationIds = useMemo(() => {
    const ids = new Set();
    (locations || []).forEach((loc) => {
      if (locationMachine(loc) === activeMachine) ids.add(String(loc.id));
    });
    return ids;
  }, [locations, activeMachine]);
  const machineLocations = useMemo(
    () => (locations || []).filter((loc) => machineLocationIds.has(String(loc.id))),
    [locations, machineLocationIds]
  );
  const machineSchedules = useMemo(
    () => (schedules || []).filter((s) => machineLocationIds.has(String(s.locationId))),
    [schedules, machineLocationIds]
  );
  const machineInstruments = useMemo(
    () => (instruments || []).filter((i) => machineLocationIds.has(String(i.locationId))),
    [instruments, machineLocationIds]
  );

  // Pre-group by locationId ONCE — 29 locations / 731 schedules / 245 instruments, so this is a
  // single pass each instead of 29 independent .filter() calls inside LocationCard.
  const { schedulesByLoc, instrumentsByLoc } = useMemo(() => {
    const schedulesByLoc = {};
    const instrumentsByLoc = {};
    (machineSchedules || []).forEach((s) => {
      const key = String(s.locationId);
      (schedulesByLoc[key] || (schedulesByLoc[key] = [])).push(s);
    });
    (machineInstruments || []).forEach((i) => {
      const key = String(i.locationId);
      (instrumentsByLoc[key] || (instrumentsByLoc[key] = [])).push(i);
    });
    return { schedulesByLoc, instrumentsByLoc };
  }, [machineSchedules, machineInstruments]);

  // Section subtitle's "compliance points" count — machine-scoped DISTANCE-schedule total (same
  // value ComplianceCards' own "Meas. Progress" card computes), port of page.tsx:203.
  const totalCheckpoints = useMemo(() => tallyMeasurementProgress(machineSchedules).total, [machineSchedules]);

  const filteredLocations = useMemo(
    () => filterSortSearchLocations(machineLocations, { filter, sortMode, search, tbmChainage }),
    [machineLocations, filter, sortMode, search, tbmChainage]
  );

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-24">
      <DashboardHeader tbmChainage={tbmChainage} />

      <ComplianceCards locations={machineLocations} instruments={machineInstruments} schedules={machineSchedules} tbmChainage={tbmChainage} />

      <section className="space-y-4">
        <div className="flex justify-between items-end px-2">
          <div>
            <h2 className="text-xl font-extrabold text-ink tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-6 bg-navy rounded-full inline-block" />
              Measurement Control Panel
            </h2>
            <p className="text-sm text-ink-2 font-medium mt-1 ml-3.5">
              Tracking all {machineLocations.length} locations and {totalCheckpoints} compliance points
            </p>
          </div>
        </div>

        {machineLocations.length === 0 ? (
          <div className="bg-surface rounded-card shadow-card border border-line py-16 text-center">
            <Milestone className="w-12 h-12 text-ink-3 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-ink-2">ยังไม่มีเครื่องมือวัดสำหรับ {activeMachine}</h3>
            <p className="text-sm text-ink-3 mt-1">แนว/จุดตรวจวัดของ {activeMachine} กำหนดภายหลัง</p>
          </div>
        ) : (
          <>
            <DashboardToolbar
              filter={filter}
              sortMode={sortMode}
              search={search}
              onFilterChange={setFilter}
              onSortChange={setSortMode}
              onSearchChange={setSearch}
              counts={filteredLocations.length}
            />

            {filteredLocations.length === 0 ? (
              <div className="bg-surface rounded-card shadow-card border border-line py-16 text-center">
                <Milestone className="w-12 h-12 text-ink-3 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-ink-2">ไม่พบจุดตรวจวัด</h3>
                <p className="text-sm text-ink-3 mt-1">ลองปรับตัวกรองหรือคำค้นหาใหม่</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {filteredLocations.map((loc) => (
                  <LocationCard
                    key={loc.id}
                    location={loc}
                    schedules={schedulesByLoc[String(loc.id)] || []}
                    instruments={instrumentsByLoc[String(loc.id)] || []}
                    tbmChainage={tbmChainage}
                    onOpenLocation={onOpenLocation}
                    onMark={onMark}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
