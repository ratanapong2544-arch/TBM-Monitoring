import React from "react";
export default function Card({ className = "", children, ...p }) {
  return <div {...p} className={`bg-surface border border-line rounded-card shadow-card ${className}`}>{children}</div>;
}
