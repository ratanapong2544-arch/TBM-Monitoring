import React, { useMemo, useState } from "react";
import { Mountain } from "lucide-react";
import SectionHeader from "../common/SectionHeader";
import { chartColors } from "../../ui-ux-pro-max/chartTheme";
import { LAYERS, DESIGN_LINE, CH_RANGE } from "../../utils/profileGeo";
import {
  linScale, designRLAtCh, exaggeratedRL, classifyDeviation,
  deviationSeries, latestRingState,
} from "../../utils/profileSection";

const W = 900, H = 360;
const M = { l: 54, r: 16, t: 16, b: 30 };
const TOL = 75;
const EXAGGS = [10, 30, 50];

export default function ProfileSectionView({ segmentRecords = [], machine = "TBM1", embedded = false }) {
  const [exagg, setExagg] = useState(30);
  const series = useMemo(() => deviationSeries(segmentRecords, DESIGN_LINE), [segmentRecords]);
  const latest = useMemo(() => latestRingState(segmentRecords), [segmentRecords]);

  // RL domain จากชั้นดิน
  const rls = LAYERS.flatMap((l) => [...l.top, ...l.bottom].map((p) => p.rl));
  const rlMin = Math.min(...rls), rlMax = Math.max(...rls);
  const x = (ch) => linScale(ch, [CH_RANGE.max, CH_RANGE.min], [M.l, W - M.r]); // chainage ลดลง ซ้าย→ขวา
  const y = (rl) => linScale(rl, [rlMax, rlMin], [M.t, H - M.b]);               // RL สูงอยู่บน

  if (machine !== "TBM1") {
    return (
      <Wrapper embedded={embedded}>
        <div className="p-8 text-center text-sm text-gray-500">
          ภาคตัด profile มีเฉพาะ <b>TBM1</b> — สลับเครื่องเป็น TBM1 เพื่อดู
        </div>
      </Wrapper>
    );
  }

  const polyPoints = (top, bottom) => {
    const t = top.map((p) => `${x(p.ch)},${y(p.rl)}`);
    const b = bottom.slice().reverse().map((p) => `${x(p.ch)},${y(p.rl)}`);
    return [...t, ...b].join(" ");
  };
  const designPts = DESIGN_LINE.map((p) => `${x(p.ch)},${y(p.rl)}`).join(" ");
  const actualPts = series
    .filter((s) => s.designRL != null)
    .map((s) => `${x(s.ch)},${y(exaggeratedRL(s.designRL, s.headV, exagg))}`)
    .join(" ");

  return (
    <Wrapper embedded={embedded}>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-gray-500">ขยายแนวตั้ง (deviation)</span>
        <div className="flex gap-1">
          {EXAGGS.map((e) => (
            <button
              key={e}
              onClick={() => setExagg(e)}
              className={`px-2 py-0.5 text-xs rounded ${exagg === e ? "bg-[#003B84] text-white" : "bg-gray-100 text-gray-600"}`}
            >×{e}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="ภาคตัดธรณีตามแนวอุโมงค์">
        {LAYERS.map((l, i) => (
          <polygon key={i} points={polyPoints(l.top, l.bottom)} fill={l.color} opacity="0.85" />
        ))}
        {LAYERS.map((l, i) => (
          <text key={"lbl" + i} x={x(l.top[0].ch) + 6} y={y(l.top[0].rl) + 14} fontSize="10" fill="#1a1a1a" opacity="0.8">
            {l.name}
          </text>
        ))}

        <polyline points={designPts} fill="none" stroke={chartColors.planned} strokeWidth="1.6" strokeDasharray="5 4" />

        {series.length > 0 && (
          <polyline points={actualPts} fill="none" stroke={chartColors.actual} strokeWidth="2.2" />
        )}

        {series
          .filter((s) => s.designRL != null && classifyDeviation(s.headV, TOL) !== "ok")
          .map((s, i) => (
            <circle key={"b" + i} cx={x(s.ch)} cy={y(exaggeratedRL(s.designRL, s.headV, exagg))} r="3.2" fill={chartColors.delay} />
          ))}

        {latest && latest.ch != null && designRLAtCh(DESIGN_LINE, latest.ch) != null && (
          <g>
            <line x1={x(latest.ch)} y1={M.t} x2={x(latest.ch)} y2={H - M.b} stroke={chartColors.dayShift} strokeWidth="1" strokeDasharray="3 3" />
            <rect x={Math.min(x(latest.ch) + 6, W - 168)} y={M.t + 4} width="160" height="34" rx="6" fill="#11203a" opacity="0.92" />
            <text x={Math.min(x(latest.ch) + 14, W - 160)} y={M.t + 18} fontSize="11" fill="#ffd27f">
              R{latest.ringNo} · Head {latest.headV > 0 ? "+" : ""}{latest.headV}mm
            </text>
            <text x={Math.min(x(latest.ch) + 14, W - 160)} y={M.t + 31} fontSize="11" fill="#9fc3ff">
              VRT {latest.vrt != null ? (latest.vrt > 0 ? "+" : "") + latest.vrt + "°" : "—"}
            </text>
          </g>
        )}

        {[rlMax, (rlMax + rlMin) / 2, rlMin].map((rl, i) => (
          <text key={"y" + i} x={6} y={y(rl) + 3} fontSize="9" fill={chartColors.axisLabel}>{rl.toFixed(0)}</text>
        ))}
        <text x={M.l} y={H - 8} fontSize="9" fill={chartColors.axisLabel}>CH {Math.floor(CH_RANGE.max / 1000)}+{String(CH_RANGE.max % 1000).padStart(3, "0")}</text>
        <text x={W - M.r - 60} y={H - 8} fontSize="9" fill={chartColors.axisLabel}>{Math.floor(CH_RANGE.min / 1000)}+{String(CH_RANGE.min % 1000).padStart(3, "0")} →</text>
      </svg>

      {series.length === 0 && (
        <p className="text-xs text-gray-500 mt-2 px-1">
          แสดงชั้นดิน + แนวออกแบบ — รอข้อมูลค่าเชิด/ตก (กรอกใน Record Daily หรือ backfill) จึงจะวาดเส้นจริง
        </p>
      )}
    </Wrapper>
  );
}

function Wrapper({ embedded, children }) {
  return (
    <div>
      {!embedded && (
        <SectionHeader title="ภาคตัดธรณี · เชิด/ตกหัวเจาะ" subtitle="Geological Section · Head Deviation" icon={Mountain} />
      )}
      <div className="bg-white rounded-card border border-line p-3">{children}</div>
    </div>
  );
}
