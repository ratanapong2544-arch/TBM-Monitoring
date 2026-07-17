import { printSpecFor, resolveOnePage, ZOOM_FLOOR } from "./printPages";

describe("printSpecFor", () => {
  test("หน้าที่ปริ้นถูกอยู่แล้ววันนี้ ต้องได้ค่าเดิมเป๊ะ (กัน regression)", () => {
    expect(printSpecFor("dashboard")).toEqual({ orientation: "landscape", onePage: true });
    expect(printSpecFor("analysis", "segment")).toEqual({ orientation: "landscape", onePage: true });
    expect(printSpecFor("analysis", "grout")).toEqual({ orientation: "landscape", onePage: true });
    expect(printSpecFor("shift_report")).toEqual({ orientation: "portrait", onePage: true });
    expect(printSpecFor("report")).toEqual({ orientation: "portrait", onePage: false });
  });

  test("แยกตาม module ได้ — Record สองหน้าเป็นฟอร์มแนวตั้งทั้งคู่", () => {
    expect(printSpecFor("record", "segment").orientation).toBe("portrait");
    expect(printSpecFor("record", "grout").orientation).toBe("portrait");
  });

  test("Work Plan (Gantt กว้าง 1398×146) = แนวนอน", () => {
    expect(printSpecFor("prep_gantt")).toEqual({ orientation: "landscape", onePage: true });
  });

  test("หน้ายาวมาก = แนวตั้ง ย่อพอดีกว้าง ปล่อยหลายหน้า", () => {
    expect(printSpecFor("inst_dashboard")).toEqual({ orientation: "portrait", onePage: false });
    expect(printSpecFor("inst_schedule")).toEqual({ orientation: "portrait", onePage: false });
    expect(printSpecFor("datalog", "grout")).toEqual({ orientation: "portrait", onePage: false });
  });

  test("หน้าที่ยังไม่รู้จัก ต้องไม่พัง — ได้ค่า fallback ที่ปริ้นได้", () => {
    expect(printSpecFor("tab_ที่_ยัง_ไม่_มี")).toEqual({ orientation: "portrait", onePage: "auto" });
    expect(printSpecFor(undefined)).toEqual({ orientation: "portrait", onePage: "auto" });
  });

  test("tab ที่มี module แต่ส่ง module ไม่ครบ ต้อง fallback ไม่ throw", () => {
    expect(printSpecFor("record")).toEqual({ orientation: "portrait", onePage: "auto" });
  });
});

describe("resolveOnePage", () => {
  test("ค่าที่กำหนดตายตัวไว้ ต้องไม่ถูก auto แก้", () => {
    expect(resolveOnePage(true, 9999, 9999, "portrait")).toBe(true);
    expect(resolveOnePage(false, 10, 10, "portrait")).toBe(false);
  });

  test("auto: Segment Trend (1398×967 นอน) ย่อแล้ว 0.70 ยังอ่านออก -> 1 หน้า", () => {
    expect(resolveOnePage("auto", 1398, 967, "landscape")).toBe(true);
  });

  test("auto: Route ทั้งหน้า (1398×1714 นอน) ย่อแล้ว 0.39 อ่านไม่ออก -> ปล่อยหลายหน้า", () => {
    expect(resolveOnePage("auto", 1398, 1714, "landscape")).toBe(false);
  });

  test("auto: Instrument (1398×17728 ตั้ง) ยาวมาก -> ปล่อยหลายหน้า", () => {
    expect(resolveOnePage("auto", 1398, 17728, "portrait")).toBe(false);
  });

  test("เกณฑ์อ่านออกอยู่ที่ 0.5 — ตัวหนังสือเล็กสุด 10.5px จะเหลือ ~5.3px", () => {
    expect(ZOOM_FLOOR).toBe(0.5);
  });
});
