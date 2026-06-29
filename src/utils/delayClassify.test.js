import { classifyOther3, OTHER3_FALLBACK } from "./delayClassify";

describe("classifyOther3", () => {
  test.each([
    ["ขุดดินใต้รางและประกอบรางสับหลีก", "รางสับหลีก"],
    ["ทดสอบราง Y-switching", "รางสับหลีก"],
    ["ไม่มีการขุดเจาะอุโมงค์ เนื่องจากคนงานเหลือน้อยหยุดไปย้ายแคมป์ที่พัก", "แรงงาน/หยุดงาน"],
    ["Operator ป่วยจึงไม่มีการขุดเจาะต่อ", "แรงงาน/หยุดงาน"],
    ["งานติดตั้งทางเดิน Walk way ( ติดตั้งราวกันตก )", "ทางเดิน/Walk way"],
    ["แก้ไข Line ท่อ Drain น้ำทิ้ง เนื่องจากอุดตัน", "ระบบน้ำ/ท่อ"],
    ["รอ Segment จากโรงหล่อ", "รอวัสดุ/ถังดิน"],
    ["รอเคลียร์ Muck Skip ถังดิน", "รอวัสดุ/ถังดิน"],
    ["Grout Loading", "Grout/Segment"],
    ["ซ่อม Erector", "ซ่อม/ขัดข้อง"],
    ["ระบบไฟฟ้า Erector เสีย", "ซ่อม/ขัดข้อง"],
  ])("%s -> %s", (label, expected) => {
    expect(classifyOther3(label)).toBe(expected);
  });

  test("ข้อความที่ไม่เข้าธีมใด -> อื่นๆ", () => {
    expect(classifyOther3("ตรวจสอบ Load Test Gantry Crane 20 T")).toBe(OTHER3_FALLBACK);
  });

  test("ค่าว่าง / null -> อื่นๆ (ไม่ throw)", () => {
    expect(classifyOther3("")).toBe(OTHER3_FALLBACK);
    expect(classifyOther3(null)).toBe(OTHER3_FALLBACK);
    expect(classifyOther3(undefined)).toBe(OTHER3_FALLBACK);
  });
});
