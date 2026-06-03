import React from "react";
const V = {
  primary:   "bg-navy hover:bg-navy-deepest text-white shadow-card",
  secondary: "bg-surface border border-line text-ink hover:bg-cyan-tint",
  ghost:     "text-ink-2 hover:bg-cyan-tint",
  danger:    "bg-code-d hover:opacity-90 text-white",
};
export default function Button({ variant = "primary", className = "", children, ...p }) {
  return <button {...p} className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold transition-colors ${V[variant]} ${className}`}>{children}</button>;
}
