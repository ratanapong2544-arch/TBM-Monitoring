import React from "react";

// โลโก้หัวเจาะ TBM (EPB cutter head — front view)
// tone="brand" → ขาว+cyan สำหรับพื้น navy; tone="mono" → currentColor ล้วน (สืบสีจาก parent)
const A6 = [0, 60, 120, 180, 240, 300];
const A12 = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export default function CutterHeadMark({ size = 20, tone = "brand", className = "" }) {
  const brand = tone === "brand";
  const rim = brand ? "#ffffff" : "currentColor";
  const spoke = brand ? "#38A7CE" : "currentColor";
  const disc = brand ? "#E5F1FF" : "currentColor";
  const hub = brand ? "#38A7CE" : "currentColor";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="TBM cutter head"
    >
      <g transform="translate(24 24)">
        <circle r="18" fill="none" stroke={rim} strokeWidth="2" />
        <g stroke={rim} strokeWidth="1.6" strokeLinecap="round">
          {A12.map((a) => (
            <line key={a} x1="0" y1="-18" x2="0" y2="-21.5" transform={`rotate(${a})`} />
          ))}
        </g>
        <g stroke={spoke} strokeWidth="2" strokeLinecap="round">
          {A6.map((a) => (
            <line key={a} x1="0" y1="0" x2="0" y2="-15.5" transform={`rotate(${a})`} />
          ))}
        </g>
        <g fill={disc}>
          {A6.map((a) => (
            <circle key={a} cx="0" cy="-10" r="1.7" transform={`rotate(${a})`} />
          ))}
        </g>
        <circle r="3.2" fill={hub} />
      </g>
    </svg>
  );
}
