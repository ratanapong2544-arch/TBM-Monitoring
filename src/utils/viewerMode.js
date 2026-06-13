// tab ids ที่อนุญาตในโหมด viewer = กลุ่ม Dashboard ใน navModel
// (dashboard=Executive, analysis=Segment Trend/Grout Volume/Route, prep_gantt=Work Plan, performance=Performance)
export const VIEWER_TABS = ["dashboard", "analysis", "prep_gantt", "performance", "shift_report"];

// อ่าน ?view=1 จาก URL (รับ search arg ได้เพื่อ test); ผิดพลาด → false (ไม่ใช่ viewer)
export function isViewerMode(search) {
  try {
    const s = search !== undefined ? search : window.location.search;
    return new URLSearchParams(s).get("view") === "1";
  } catch (e) {
    return false;
  }
}
