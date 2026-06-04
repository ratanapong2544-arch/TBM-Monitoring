import React from "react";

// grid นับจำนวนแบบแน่น (ใช้ซ้ำ เครื่องจักร/แรงงาน)
// props: catalog [{key,label}], values {key: ""|number-string}, onChange(key, val), carriedKeys Set (ไฮไลต์ค่าที่ carry-forward มา)
export default function CountGrid({ catalog, values, onChange, carriedKeys }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {catalog.map(({ key, label }) => {
        const v = values[key] ?? "";
        return (
          <label
            key={key}
            className={`flex items-center justify-between gap-2 border rounded-input px-2.5 py-1.5 transition-colors ${
              v !== "" ? "border-cyan-med bg-cyan-vtint" : "border-line-input bg-surface"
            }`}
            title={label}
          >
            <span className="text-xs text-ink-2 truncate">{label}</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={v}
              onChange={(e) => onChange(key, e.target.value)}
              placeholder="0"
              className="w-12 shrink-0 text-center text-sm font-semibold text-navy bg-transparent border border-line rounded-[5px] py-0.5 outline-none focus:border-navy placeholder:text-ink-3 placeholder:font-normal"
            />
          </label>
        );
      })}
    </div>
  );
}
