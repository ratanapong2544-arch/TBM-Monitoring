/**
 * Task 4.2 — migration runner: POST instrument seed → GAS bulkImportInstrument
 * ============================================================
 * รัน (จากโฟลเดอร์ TunnelBoringMonitoring):  node tools/migrate-instruments.mjs
 * GAS_URL: ใช้ env GAS_URL ถ้าตั้งไว้ ไม่งั้น default = public exec URL (เหมือน src/utils/constants.js)
 * idempotent — รันซ้ำได้ (bulkImport ฝั่ง GAS ล้าง data rows เดิมแล้วเขียนใหม่)
 * ไม่รวม Inst_Readings (ค่าวัด 8+300 อยู่ใน Task 4.3 แยก)
 */
import { buildSeed } from "./instrument-seed-data.mjs";

const GAS_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw/exec";

const s = buildSeed();
console.log(
  `seed → loc ${s.locations.length} · ins ${s.instruments.length} · th ${s.thresholds.length} · sc ${s.schedules.length}`
);

const payload = {
  action: "bulkImportInstrument",
  data: {
    Inst_Locations: s.locations,
    Inst_Instruments: s.instruments,
    Inst_Thresholds: s.thresholds,
    Inst_Schedules: s.schedules,
  },
};

console.log("POST → bulkImportInstrument ...");
const res = await fetch(GAS_URL, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify(payload),
  redirect: "follow",
});
const text = await res.text();
console.log("HTTP", res.status);
console.log(text.slice(0, 800));
