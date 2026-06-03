import React from "react";
export default function StickyActionBar({ children }) {
  return (
    <div className="lg:static fixed inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line p-3 print:hidden"
         style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}>
      {children}
    </div>
  );
}
