import React, { useMemo } from "react";
import { ribbonStatus } from "../../utils/headTrend";

const COLOR = { ok: "#4E7D6B", near: "#D9A441", over: "#B23A34" };
const W = 1000, H = 34, BAR_TOP = 0;

// ความเข้ม: เกินเกณฑ์ยิ่งลึกยิ่งเข้ม (ให้แถบบอกได้คร่าวๆ ว่าหลุดแรงแค่ไหน ไม่ใช่แค่หลุด/ไม่หลุด)
const opacityFor = (s) => (s.status === "over" ? Math.min(1, 0.45 + s.mag / 700) : 0.85);

export default function HeadTrendContext({ series = [], tol, windowFrom, windowTo, onPick }) {
  const bars = useMemo(() => ribbonStatus(series, tol), [series, tol]);
  if (!bars.length) return null;

  const bw = W / bars.length;
  const idxFrom = bars.findIndex((b) => b.ringN >= windowFrom);
  const idxTo = bars.findIndex((b) => b.ringN >= windowTo);
  const x0 = (idxFrom < 0 ? 0 : idxFrom) * bw;
  const x1 = ((idxTo < 0 ? bars.length - 1 : idxTo) + 1) * bw;

  const pick = (e) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * bars.length);
    const b = bars[Math.max(0, Math.min(bars.length - 1, i))];
    if (b) onPick(b.ringN);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mt-3 pt-3 border-t border-dashed border-line">
        <p className="text-[11px] text-ink-3 font-semibold">
          ภาพรวมทั้งเส้นทาง P{bars[0].ringN}–P{bars[bars.length - 1].ringN} ({bars.length} ริง) — คลิกเพื่อเลื่อนช่วงที่ดู
        </p>
        <div className="flex gap-3 text-[10.5px] font-semibold text-ink-3">
          {[["ok", "ในเกณฑ์"], ["near", "ใกล้ขอบ"], ["over", `เกิน ±${tol}`]].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5">
              <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLOR[k] }} />{l}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
        onClick={pick} style={{ display: "block", cursor: "pointer" }} role="presentation">
        {bars.map((b, i) => (
          <rect key={b.ringN} x={i * bw} y={BAR_TOP} width={Math.max(0.7, bw + 0.3)} height={H}
            fill={COLOR[b.status]} opacity={opacityFor(b)} />
        ))}
        <rect x={x0} y={0.8} width={Math.max(3, x1 - x0)} height={H - 1.6}
          fill="none" stroke="#243B53" strokeWidth={2} rx={2} />
      </svg>
    </div>
  );
}
