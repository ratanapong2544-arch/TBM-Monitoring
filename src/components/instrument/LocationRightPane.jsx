// Task R3c — tabbed right-column pane: BLUEPRINT (BlueprintPlot) / CHART (existing InstrumentReportTabs,
// no mock-chart fallback). Navy port of LocationDetailClient.tsx's right-tab bar (493-520). Owns
// activeRightTab itself (self-contained, same convention as R3a/R3b's timeline/panel components) — the
// shell (R3d) just drops <LocationRightPane ... /> into its `lg:col-span-8` grid column.
//
// Tab bar reuses the existing shared TabBar ("primary" variant — active=navy fill, inactive=ink-2,
// per task-R3c-brief.md) instead of hand-rolling new tab markup.
import { useState } from "react";
import { Map as MapIcon, Activity } from "lucide-react";
import TabBar from "./reports/shared/TabBar";
import BlueprintPlot from "./BlueprintPlot";
import InstrumentReportTabs from "./InstrumentReportTabs";

const TABS = [
  { id: "BLUEPRINT", label: "BLUEPRINT", sublabel: "แบบแปลน", icon: MapIcon },
  { id: "CHART", label: "CHART", sublabel: "ผลตรวจวัด", icon: Activity },
];

export default function LocationRightPane({
  location = null,
  instruments = [],
  allInstruments,
  readings = [],
  thresholds = [],
  machineProgress = null,
  activeMachine = "TBM1",
  onSelectInstrument,
}) {
  const [activeTab, setActiveTab] = useState("BLUEPRINT");

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="border-b border-line bg-surface-alt px-3 py-2.5">
        <TabBar tabs={TABS} activeId={activeTab} onChange={setActiveTab} variant="primary" />
      </div>

      <div className="relative min-h-[500px] flex-1 p-4">
        {activeTab === "BLUEPRINT" ? (
          <BlueprintPlot
            location={location}
            instruments={instruments}
            allInstruments={allInstruments}
            onSelectInstrument={onSelectInstrument}
          />
        ) : (
          <InstrumentReportTabs
            location={location}
            instruments={instruments}
            readings={readings}
            thresholds={thresholds}
            machineProgress={machineProgress}
            activeMachine={activeMachine}
          />
        )}
      </div>
    </div>
  );
}
