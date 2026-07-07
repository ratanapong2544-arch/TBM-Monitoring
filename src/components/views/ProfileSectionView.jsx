import React, { useMemo, useState, useRef, useEffect } from "react";
import { Mountain } from "lucide-react";
import SectionHeader from "../common/SectionHeader";
import { chartColors } from "../../ui-ux-pro-max/chartTheme";
import { CH_RANGE, RL_RANGE, BACKDROP, BORE_DIA, SHAFTS, DESIGN_LINE } from "../../utils/profileGeo";
import { headChainageFromRecords, parseCH, CH_EXCAV_START } from "../../utils/alignmentGeo";
import { linScale, designRLAtCh, exaggeratedRL, classifyDeviation, deviationSeries } from "../../utils/profileSection";
import { renderTBMSprite } from "../../utils/tbmSprite";

// scrollable canvas — full route is very long; fixed display height, width = aspect * height
const DISPLAY_H = 340;
const DISPLAY_W = Math.round(DISPLAY_H * BACKDROP.aspect);
const TOL = 75;                 // ±75 mm tolerance
const EXAGGS = [10, 30, 50];

const xOf = (ch) => linScale(ch, [BACKDROP.chMin, BACKDROP.chMax], [0, DISPLAY_W]);
const yOf = (rl) => linScale(rl, [BACKDROP.rlMax, BACKDROP.rlMin], [0, DISPLAY_H]);
const fmtCH = (ch) => `${Math.floor(ch / 1000)}+${String(Math.round(ch) % 1000).padStart(3, "0")}`;
const num = (v) => (v != null && !isNaN(parseFloat(v)) ? parseFloat(v) : null);

export default function ProfileSectionView({ segmentRecords = [], machine = "TBM1", embedded = false }) {
  const [exagg, setExagg] = useState(30);
  const [tbm, setTbm] = useState(null);   // 3D cutterhead sprite (rendered from the alignment model)
  const [view, setView] = useState("overview"); // "overview" (full route) | "head" (zoom to cutterhead + rings)
  const scrollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    renderTBMSprite(320).then((s) => { if (alive) setTbm(s); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const series = useMemo(() => deviationSeries(segmentRecords, DESIGN_LINE), [segmentRecords]);
  const headCh = useMemo(() => headChainageFromRecords(segmentRecords), [segmentRecords]);
  const headRec = useMemo(() => {
    let best = null, bc = Infinity;
    for (const r of segmentRecords) {
      if (!r || r.installType === "Temporary") continue;
      const c = parseCH(r.finishCH);
      if (!isNaN(c) && c < bc) { bc = c; best = r; }
    }
    return best;
  }, [segmentRecords]);

  const inRange = (ch) => ch != null && ch >= CH_RANGE.min && ch <= CH_RANGE.max;
  const headIn = machine === "TBM1" && inRange(headCh);

  // center the view on the head — robust to late layout (also called on image load)
  const scrollToHead = () => {
    const el = scrollRef.current;
    if (!el || !headIn || !el.clientWidth) return;
    const target = xOf(headCh) - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, Math.min(target, DISPLAY_W - el.clientWidth));
  };
  useEffect(() => { scrollToHead(); const id = setTimeout(scrollToHead, 250); return () => clearTimeout(id); }, [headCh, headIn]);

  if (machine !== "TBM1") {
    return (
      <Wrapper embedded={embedded}>
        <div className="p-8 text-center text-sm text-gray-500">
          ภาคตัดธรณีมีเฉพาะ <b>TBM1</b> — สลับเครื่องเป็น TBM1 เพื่อดู
        </div>
      </Wrapper>
    );
  }

  const axisRL = (ch) => designRLAtCh(DESIGN_LINE, ch);
  const headV = headRec ? num(headRec.headV) : null;
  const headVrt = headRec ? num(headRec.vrt) : null;
  const actualPts = series
    .filter((s) => s.designRL != null)
    .map((s) => `${xOf(s.ch).toFixed(1)},${yOf(exaggeratedRL(s.designRL, s.headV, exagg)).toFixed(1)}`)
    .join(" ");

  // tunnel tube along the design alignment (full route)
  const tubeC = [];
  for (let c = CH_RANGE.min; c <= CH_RANGE.max; c += 100) {
    const rl = axisRL(c);
    if (rl != null) tubeC.push({ c, rl });
  }
  const crownPts = tubeC.map((p) => `${xOf(p.c).toFixed(1)},${yOf(p.rl + BORE_DIA / 2).toFixed(1)}`);
  const invertPts = tubeC.map((p) => `${xOf(p.c).toFixed(1)},${yOf(p.rl - BORE_DIA / 2).toFixed(1)}`);
  const centerPts = tubeC.map((p) => `${xOf(p.c).toFixed(1)},${yOf(p.rl).toFixed(1)}`).join(" ");
  const tubePoly = [...crownPts, ...invertPts.slice().reverse()].join(" ");

  // bored (installed) portion = head -> launch (CH_EXCAV_START)
  const tubeStr = (pts) => ({
    crown: pts.map((p) => `${xOf(p.c).toFixed(1)},${yOf(p.rl + BORE_DIA / 2).toFixed(1)}`),
    invert: pts.map((p) => `${xOf(p.c).toFixed(1)},${yOf(p.rl - BORE_DIA / 2).toFixed(1)}`),
  });
  const boredPts = tubeC.filter((p) => headCh != null && p.c >= headCh && p.c <= CH_EXCAV_START);
  const bored = tubeStr(boredPts);
  const boredPoly = bored.crown.length > 1 ? [...bored.crown, ...bored.invert.slice().reverse()].join(" ") : "";

  // ring-number labels along the bored tunnel (~8 samples)
  const ringPts = segmentRecords
    .filter((r) => r && r.installType !== "Temporary")
    .map((r) => ({ n: r.ringNo, ch: parseCH(r.finishCH) }))
    .filter((r) => !isNaN(r.ch) && r.ch >= CH_RANGE.min && r.ch <= CH_RANGE.max)
    .sort((a, b) => a.ch - b.ch);
  const ringLabels = [];
  if (ringPts.length) {
    const step = Math.max(1, Math.floor(ringPts.length / 8));
    for (let i = 0; i < ringPts.length; i += step) ringLabels.push(ringPts[i]);
    const last = ringPts[ringPts.length - 1];
    if (ringLabels[ringLabels.length - 1] !== last) ringLabels.push(last);
  }
  // rings nearest the head (lowest chainage first) for the zoomed head-detail strip
  const headRings = ringPts.slice(0, 26);

  return (
    <Wrapper embedded={embedded}>
      {/* toolbar */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-gray-500">ภาคตัดธรณีเต็มแนว (IS1 → IS4) จากแบบ DWG จริง · ← เลื่อนดูได้ตลอดแนว →</span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-400 mr-1">ขยายเชิด/ตก</span>
          {EXAGGS.map((e) => (
            <button key={e} onClick={() => setExagg(e)}
              className={`px-2 py-0.5 text-xs rounded ${exagg === e ? "bg-[#1f3a5f] text-white" : "bg-gray-100 text-gray-600"}`}>×{e}</button>
          ))}
        </div>
      </div>

      {/* scrollable faithful DWG backdrop + interactive overlay */}
      <div ref={scrollRef} className="w-full overflow-x-auto rounded-md border border-line bg-white">
        <div className="relative" style={{ width: DISPLAY_W, height: DISPLAY_H }}>
          <img src={BACKDROP.src} alt="ภาคตัดธรณีตามแนวอุโมงค์ (จากแบบ DWG)" draggable={false} onLoad={scrollToHead}
            className="block select-none" style={{ width: DISPLAY_W, height: DISPLAY_H }} />
          <svg viewBox={`0 0 ${DISPLAY_W} ${DISPLAY_H}`} preserveAspectRatio="none"
            className="absolute inset-0" style={{ width: DISPLAY_W, height: DISPLAY_H }}
            role="img" aria-label="overlay หัวเจาะและการเชิด/ตก">

            {/* shaft markers + labels */}
            {SHAFTS.filter((s) => inRange(s.ch)).map((s, i) => (
              <g key={"sh" + i}>
                <line x1={xOf(s.ch)} y1="0" x2={xOf(s.ch)} y2={DISPLAY_H} stroke="#1f3a5f" strokeWidth="1" strokeDasharray="5 4" opacity="0.6" />
                <text x={xOf(s.ch) + 4} y="13" fontSize="11" fill="#1f3a5f" fontWeight="700">{s.name} {fmtCH(s.ch)}</text>
              </g>
            ))}

            {/* tunnel alignment — remaining (light blue) + bored/installed (orange) + ring numbers */}
            {tubeC.length > 1 && (
              <g>
                <polygon points={tubePoly} fill="#9fc4e8" fillOpacity="0.20" stroke="none" />
                <polyline points={crownPts.join(" ")} fill="none" stroke="#5b86ad" strokeWidth="0.9" opacity="0.7" />
                <polyline points={invertPts.join(" ")} fill="none" stroke="#5b86ad" strokeWidth="0.9" opacity="0.7" />
                <polyline points={centerPts} fill="none" stroke="#5b86ad" strokeWidth="0.6" strokeDasharray="6 4" opacity="0.5" />
                {boredPoly && (
                  <>
                    <polygon points={boredPoly} fill="#F2741B" fillOpacity="0.32" stroke="none" />
                    <polyline points={bored.crown.join(" ")} fill="none" stroke="#C8500A" strokeWidth="1.3" />
                    <polyline points={bored.invert.join(" ")} fill="none" stroke="#C8500A" strokeWidth="1.3" />
                  </>
                )}
                {ringLabels.map((r, i) => {
                  const rl = axisRL(r.ch);
                  if (rl == null) return null;
                  const x = xOf(r.ch), yTop = yOf(rl + BORE_DIA / 2);
                  return (
                    <g key={"rl" + i}>
                      <line x1={x} y1={yTop} x2={x} y2={yTop - 9} stroke="#7a4a10" strokeWidth="0.6" />
                      <text x={x} y={yTop - 11} fontSize="9" fill="#7a4a10" textAnchor="middle">{r.n}</text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* actual deviation line (×N) + breach markers — when data exists */}
            {series.length > 0 && actualPts && (
              <polyline points={actualPts} fill="none" stroke={chartColors.delay} strokeWidth="2" opacity="0.95" />
            )}
            {series.filter((s) => s.designRL != null && classifyDeviation(s.headV, TOL) !== "ok").map((s, i) => (
              <circle key={"b" + i} cx={xOf(s.ch)} cy={yOf(exaggeratedRL(s.designRL, s.headV, exagg))} r="3" fill={chartColors.delay} />
            ))}

            {/* head / cutterhead + callout */}
            {headIn && (() => {
              const hx = xOf(headCh);
              const yAxis = yOf(axisRL(headCh));
              const yT = yOf(axisRL(headCh) + BORE_DIA / 2);
              const yB = yOf(axisRL(headCh) - BORE_DIA / 2);
              const h = Math.max(8, yB - yT);
              const bodyW = Math.max(16, (18 / (BACKDROP.chMax - BACKDROP.chMin)) * DISPLAY_W);
              const cw = 188, cx = Math.min(hx + 14, DISPLAY_W - cw - 6), cy = Math.max(4, yT - 50);
              const sH = h * 2.8, sW = tbm ? sH * (tbm.w / tbm.h) : 0;
              return (
                <g>
                  {tbm ? (
                    /* หัวเจาะ 3D จริง (โมเดลเดียวกับ 3D Alignment) */
                    <image href={tbm.url} x={hx - sW * 0.45} y={yAxis - sH * 0.52} width={sW} height={sH} preserveAspectRatio="xMidYMid meet" />
                  ) : (
                    <>
                      <rect x={hx} y={yT} width={bodyW} height={h} rx="1.5" fill="#2b3440" stroke="#0e1620" strokeWidth="0.6" />
                      {[1, 2, 3, 4, 5].map((k) => (
                        <line key={k} x1={hx + (bodyW * k) / 6} y1={yT} x2={hx + (bodyW * k) / 6} y2={yB} stroke="#566270" strokeWidth="0.4" />
                      ))}
                      <rect x={hx - 6} y={yT - 1} width="7" height={h + 2} rx="3" fill="#E03524" stroke="#7a140c" strokeWidth="0.7" />
                    </>
                  )}
                  {/* connector → callout */}
                  <line x1={hx} y1={yAxis} x2={cx + 12} y2={cy + 38} stroke="#E03524" strokeWidth="0.7" opacity="0.55" />
                  <rect x={cx} y={cy} width={cw} height="38" rx="6" fill="#0f2138" opacity="0.96" />
                  <text x={cx + 11} y={cy + 16} fontSize="12" fill="#ffd27f" fontWeight="700">หัวเจาะ R{headRec ? headRec.ringNo : "?"} · CH {fmtCH(headCh)}</text>
                  <text x={cx + 11} y={cy + 30} fontSize="11" fill="#9fc3ff">
                    Head {headV != null ? (headV > 0 ? "+" : "") + headV + "mm" : "—"}
                    {headVrt != null ? ` · VRT ${headVrt > 0 ? "+" : ""}${headVrt}°` : ""}
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>
      </div>

      {/* zoomed head detail — 3D cutterhead + installed segment rings (labeled) */}
      {headRings.length > 0 && (() => {
        const BW = 30, GAP = 3, H = 152, BH = 92, top = (H - BH) / 2, x0 = 134;
        const cutW = tbm ? (tbm.w / tbm.h) * (BH + 40) : 70;
        const W = x0 + headRings.length * (BW + GAP) + 16;
        return (
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1 px-1">หน้าตัดใกล้หัวเจาะ · cutterhead + ปล้อง segment ที่ติดตั้งล่าสุด (ใหม่ → เก่า)</div>
            <div className="w-full overflow-x-auto rounded-md border border-line" style={{ background: "#0d1424" }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: Math.max(W, 760), height: H }} preserveAspectRatio="xMidYMid meet">
                <rect x="0" y={top} width={W} height={BH} fill="#16233c" />
                {tbm
                  ? <image href={tbm.url} x={2} y={top - 20} width={cutW} height={BH + 40} preserveAspectRatio="xMidYMid meet" />
                  : <rect x={x0 - 22} y={top} width="18" height={BH} rx="4" fill="#E03524" />}
                {headRings.map((r, i) => {
                  const x = x0 + i * (BW + GAP), cxr = x + BW / 2, cyr = top + BH / 2;
                  return (
                    <g key={i}>
                      <rect x={x} y={top} width={BW} height={BH} rx="2" fill="#2b3440" stroke="#0b1220" strokeWidth="1.2" />
                      <line x1={x} y1={top + 7} x2={x + BW} y2={top + 7} stroke="#46556b" strokeWidth="0.6" />
                      <line x1={x} y1={top + BH - 7} x2={x + BW} y2={top + BH - 7} stroke="#46556b" strokeWidth="0.6" />
                      <text x={cxr} y={cyr} fontSize="11" fill="#dbe4f0" textAnchor="middle" transform={`rotate(-90 ${cxr} ${cyr})`}>{r.n}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })()}

      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[11px] text-gray-400">เลื่อนแนวนอนเพื่อดูตลอดแนว · เปิดมาที่ตำแหน่งหัวเจาะอัตโนมัติ</span>
        <span className="text-[11px] text-gray-400">
          <span className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: chartColors.delay }} />เส้นเชิด/ตก (×{exagg})
        </span>
      </div>

      {series.length === 0 && (
        <p className="text-xs text-gray-500 mt-1 px-1">
          เส้นเชิด/ตก (สีแดง) จะปรากฏบนภาคตัดเมื่อกรอกค่า Head/VRT ต่อ ring (หรือ backfill จากไฟล์)
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
