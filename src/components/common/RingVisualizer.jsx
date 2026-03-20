import React from 'react';

export const RingSegment = ({ cx, cy, r, startAngle, endAngle, label, posState, onClick }) => {
  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return { x: centerX + radius * Math.cos(angleInRadians), y: centerY + radius * Math.sin(angleInRadians) };
  };
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  const d = ["M", cx, cy, "L", start.x, start.y, "A", r, r, 0, largeArcFlag, 0, end.x, end.y, "Z"].join(" ");
  const midAngle = startAngle + (endAngle - startAngle) / 2;
  const labelPos = polarToCartesian(cx, cy, r * 0.72, midAngle);

  const isPrimary = posState === 'primary';
  const isSecondary = posState === 'secondary';
  const isBoth = posState === 'both';
  const isSelected = isPrimary || isSecondary || isBoth;

  const fill = (isSecondary || isBoth) ? "url(#diagonalHatchOrange)" : isPrimary ? "url(#diagonalHatchBlue)" : "white";
  const stroke = isBoth ? "#3B82F6" : isSecondary ? "#F97316" : isPrimary ? "#3B82F6" : "#E2E8F0";
  const strokeWidth = isSelected ? "2" : "1";
  const labelFill = (isSecondary || isBoth) ? "#F97316" : isPrimary ? "#2563EB" : "#94A3B8";

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} className="transition-all duration-300 ease-out hover:opacity-90 active:scale-95 origin-center" style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <circle cx={labelPos.x} cy={labelPos.y} r="14" fill="white" className="shadow-sm" />
      <text x={labelPos.x} y={labelPos.y} dy="4" textAnchor="middle" fontSize="11" fontWeight="800" fill={labelFill} className="select-none pointer-events-none" transform={`rotate(${-midAngle + midAngle}, ${labelPos.x}, ${labelPos.y})`}>
        {label}
      </text>
    </g>
  );
};

const RingVisualizer = ({ primaryPositions, secondaryPositions, selectedPositions, onTogglePosition, ringKey }) => {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = 130;

  const segments = [
    { id: "K", label: "K", start: -12.5, end: 12.5 },
    { id: "C1", label: "C1", start: 12.5, end: 79.5 },
    { id: "B1", label: "B1", start: 79.5, end: 146.5 },
    { id: "A", label: "A", start: 146.5, end: 213.5 },
    { id: "B2", label: "B2", start: 213.5, end: 280.5 },
    { id: "C2", label: "C2", start: 280.5, end: 347.5 },
  ];
  const rotation = (parseInt(ringKey) % 16) * 22.5;

  const prims = primaryPositions || selectedPositions || {};
  const secs = secondaryPositions || {};

  return (
    <div className="relative flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 bg-blue-50 rounded-full blur-3xl opacity-30"></div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative z-10 drop-shadow-xl">
        <defs>
          <pattern id="diagonalHatchBlue" patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="#EFF6FF" />
            <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
          </pattern>
          <pattern id="diagonalHatchOrange" patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="#FFF7ED" />
            <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#F97316" strokeWidth="2" strokeLinecap="round" />
          </pattern>
        </defs>
        <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="4,4" />
        <g transform={`rotate(${Number(rotation || 0)}, ${cx}, ${cy})`} className="transition-transform duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)">
          {segments.map((seg) => {
            let posState = null;
            const isPrim = prims[seg.id];
            const isSec = secs[seg.id];

            if (isPrim && isSec) posState = 'both';
            else if (isSec) posState = 'secondary';
            else if (isPrim) posState = 'primary';

            return <RingSegment key={seg.id} cx={cx} cy={cy} r={r} startAngle={seg.start} endAngle={seg.end} label={seg.label} posState={posState} onClick={() => onTogglePosition && onTogglePosition(seg.id)} />
          })}
          <circle cx={cx} cy={cy} r="6" fill="#3B82F6" className="shadow-md" />
          <path d={`M${cx},${cy - r + 25} L${cx},${cy - r + 45}`} stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
      <div className="absolute bottom-0 bg-white/80 backdrop-blur px-4 py-1.5 rounded-full border border-slate-200 text-[10px] font-bold text-slate-600 shadow-sm">
        Rotation: {Number(rotation || 0)}° (Key {String(ringKey)})
      </div>
    </div>
  );
};

export default RingVisualizer;
