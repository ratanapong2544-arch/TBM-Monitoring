// CMI Mark 2 — palette กลางสำหรับ recharts (semantic-aware)
export const chartColors = {
  planned:    "#003B84", // navy — เส้น/ค่าตามแผน
  actual:     "#10463A", // green-dark — ค่าจริง (ปกติ)
  actualAlert:"#B91C1C", // Code D — ค่าจริงเมื่อช้ากว่าแผน
  paid:       "#1E80BD", // cyan-med
  dayShift:   "#B8860B", // Code B (gold) — กะกลางวัน
  nightShift: "#003B84", // navy — กะกลางคืน
  temporary:  "#C0C0C0", // gray-300 — ชั่วคราว
  delay:      "#B91C1C", // Code D — ล่าช้า
  muck:       "#A56A33", // earth — งานขนดิน (Muck Full)
  grid:       "#F0F0F0",
  axis:       "#999999",
  axisLabel:  "#666666",
  routeRamp:  ["#0C2C65", "#003B84", "#1E80BD", "#38A7CE"], // แทน purple route
};
export const SHIFT_COLORS = [chartColors.dayShift, chartColors.nightShift];
export const axisTick   = { fontSize: 10, fill: chartColors.axisLabel, fontWeight: 600 };
export const gridProps  = { strokeDasharray: "3 3", stroke: chartColors.grid };
export const tooltipStyle = {
  contentStyle: { border: "1px solid #E8E8E8", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,59,132,0.06)", fontSize: 12 },
  labelStyle:   { color: "#666", fontWeight: 600, marginBottom: 4 },
};
