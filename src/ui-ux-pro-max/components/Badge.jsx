import React from "react";
const MAP = {
  a: "bg-code-a/10 text-code-a", b: "bg-code-b/10 text-code-b",
  c: "bg-code-c/10 text-code-c", d: "bg-code-d/10 text-code-d",
  info: "bg-cyan-tint text-cyan-med", neutral: "bg-line/40 text-ink-2",
};
export default function Badge({ code = "neutral", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-[11px] font-semibold ${MAP[code] || MAP.neutral} ${className}`}>
      {children}
    </span>
  );
}
