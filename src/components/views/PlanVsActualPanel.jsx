import React, { useMemo } from "react";
import { TrendingUp, ChevronRight } from "lucide-react";
import { loadDistancePlan, plannedDistanceToNow, currentMonthBKK } from "../../utils/planConfig";
import { TOTAL_ROUTE_DISTANCE } from "../../utils/constants";

const fmt = (m) => `${(Number(m) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} ม.`;

const PlanVsActualPanel = ({ machine = "TBM1", segmentRecords = [], onNavigate }) => {
  const cfg = useMemo(() => loadDistancePlan(machine), [machine]);
  const hasPlan = Array.isArray(cfg.ranges) && cfg.ranges.length > 0;

  const planned = useMemo(
    () => plannedDistanceToNow(cfg, { asOfMonth: currentMonthBKK(), totalRouteDistance: machine === "TBM1" ? TOTAL_ROUTE_DISTANCE : 0 }),
    [cfg, machine]
  );

  const actual = useMemo(() => {
    const seen = new Set(); let sum = 0;
    for (const r of segmentRecords) {
      if (r.installType === "Temporary" || seen.has(r.ringNo)) continue;
      seen.add(r.ringNo); sum += parseFloat(r.length || 0) || 0;
    }
    return sum;
  }, [segmentRecords]);

  const variance = actual - planned;
  const goRoute = () => onNavigate && onNavigate({ tab: "analysis", module: "route" });

  return (
    <section className="rounded-card border border-line bg-surface shadow-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 font-semibold text-ink text-base">
          <TrendingUp size={18} className="text-navy" /> แผน vs ผลงานจริง
        </h3>
        <button onClick={goRoute} className="inline-flex items-center gap-1 text-xs font-semibold text-navy hover:text-navy-deepest transition-colors">
          ตั้งแผน <ChevronRight size={14} />
        </button>
      </div>

      {!hasPlan ? (
        <p className="text-sm text-ink-3">ยังไม่ตั้งแผนสำหรับ {machine} — กด "ตั้งแผน" เพื่อกำหนดแผนการดำเนินงาน</p>
      ) : planned <= 0 ? (
        <p className="text-sm text-ink-2">ยังไม่ถึงกำหนดเริ่มขุดตามแผน</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs text-ink-3">ตามแผน ณ ปัจจุบัน</div>
              <div className="text-lg font-bold text-ink">{fmt(planned)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-3">ทำจริง</div>
              <div className="text-lg font-bold text-ink">{fmt(actual)}</div>
            </div>
          </div>
          <div className={`text-sm font-semibold ${variance < 0 ? "text-code-d" : "text-sgreen-dark"}`}>
            {variance < 0 ? `⚠ ช้ากว่าแผน ${fmt(Math.abs(variance))}` : `นำแผน +${fmt(variance)}`}
          </div>
        </div>
      )}
    </section>
  );
};

export default PlanVsActualPanel;
