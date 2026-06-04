// Catalog ของ "รายงานประจำวัน" — สกัดจากฟอร์มราชการจริง (แบบฟอร์ม Dairy Report.docx)
// key ใช้ผูกกับ DOCX cell ตอน SP2

export const EQUIPMENT = [
  { key: "eq_mobile_crane", label: "Mobile/OVH Crane" },
  { key: "eq_crawler_crane", label: "รถเครนตีนตะขาบ" },
  { key: "eq_rebar_cut", label: "เครื่องตัด/ดัดเหล็ก" },
  { key: "eq_vibrator", label: "เครื่องจี้/เขย่าคอนกรีต" },
  { key: "eq_backhoe", label: "แบคโฮล/Vibro" },
  { key: "eq_concrete_pump", label: "รถคอนกรีตปั้ม" },
  { key: "eq_welder", label: "ตู้เชื่อม" },
  { key: "eq_breaker", label: "เครื่องสกัด" },
  { key: "eq_truck", label: "รถบรรทุก/Trailer" },
  { key: "eq_bus_water", label: "รถโดยสาร/รถน้ำ" },
  { key: "eq_generator", label: "เครื่องปั่นไฟ/ปั้มลม" },
  { key: "eq_water_pump", label: "เครื่องสูบน้ำ" },
  { key: "eq_compactor", label: "เครื่องบดอัดดิน" },
];

export const LABOR = [
  { key: "lb_engineer", label: "วิศวกร CE, ME, EE" },
  { key: "lb_teamlead", label: "หัวหน้าชุด" },
  { key: "lb_assembler", label: "ช่างประกอบ/ผู้ช่วย" },
  { key: "lb_operator", label: "คนขับเครื่องจักร" },
  { key: "lb_foreman", label: "โฟร์แมน/ซุปฯ" },
  { key: "lb_carpenter", label: "ช่างไม้" },
  { key: "lb_welder", label: "ช่างเชื่อม" },
  { key: "lb_worker", label: "คนงานทั่วไป" },
  { key: "lb_qc", label: "ช่างเทคนิค/QC" },
  { key: "lb_mason", label: "ช่างปูน" },
  { key: "lb_electrician", label: "ช่างไฟฟ้า" },
  { key: "lb_driver", label: "พนักงานขับรถ" },
  { key: "lb_safety", label: "จ.ป." },
  { key: "lb_rebar", label: "ช่างเหล็ก" },
  { key: "lb_surveyor", label: "ช่างสำรวจ" },
  { key: "lb_mechanic", label: "ช่างแมคคานิค (MC)" },
];

export const WEATHER_SLOTS = ["03", "06", "09", "12", "15", "18", "21", "24"];

export const WEATHER_CONDITIONS = [
  { key: "clear", label: "แจ่มใส" },
  { key: "light", label: "ฝนตกประปราย" },
  { key: "heavy", label: "ฝนตกหนัก" },
];
