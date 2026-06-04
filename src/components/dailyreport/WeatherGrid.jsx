import React from "react";
import { WEATHER_SLOTS, WEATHER_CONDITIONS } from "../../utils/dailyReportSchema";

// tap-grid: row = สภาพ, col = ช่วงเวลา. แตะ = set, แตะซ้ำ = ล้าง (1 สภาพต่อช่วง)
// props: weather {slot: cond|null}, onChange(slot, cond|null)
export default function WeatherGrid({ weather, onChange }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="bg-surface-alt border border-line text-ink-2 font-semibold px-2 py-1 text-left whitespace-nowrap">
              สภาพ \ เวลา
            </th>
            {WEATHER_SLOTS.map((s) => (
              <th key={s} className="bg-surface-alt border border-line text-ink-2 font-mono font-semibold px-0 py-1 w-10 text-center">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEATHER_CONDITIONS.map((c) => (
            <tr key={c.key}>
              <td className="bg-surface-alt border border-line text-ink-2 font-semibold px-2 py-1 whitespace-nowrap">{c.label}</td>
              {WEATHER_SLOTS.map((s) => {
                const on = weather[s] === c.key;
                return (
                  <td key={s} className="border border-line p-0">
                    <button
                      type="button"
                      onClick={() => onChange(s, on ? null : c.key)}
                      className={`w-10 h-7 flex items-center justify-center transition-colors ${
                        on ? "bg-navy text-white" : "hover:bg-cyan-tint text-transparent"
                      }`}
                      aria-label={`${c.label} ${s}:00`}
                    >
                      {on ? "✓" : "·"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
