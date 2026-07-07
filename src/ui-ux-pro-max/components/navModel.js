import { Home, PlusCircle, LayoutDashboard, Database, Clock, FileText, TrendingUp, Droplet, MapPin, Gauge, ClipboardList, CalendarRange, ArrowUpDown } from "lucide-react";
// tab = activeTab value เดิม, module = currentModule (ถ้ามี), short = label สั้นสำหรับ bottom nav มือถือ
export const NAV_GROUPS = [
  { label: "ภาพรวม", items: [{ id:"overview", tab:"overview", label:"Home", short:"Home", icon:Home }] },
  { label: "บันทึกข้อมูล", items: [
    { id:"rec-seg", tab:"record", module:"segment", label:"Record · Segment", short:"Rec", icon:PlusCircle },
    { id:"rec-grt", tab:"record", module:"grout",   label:"Record · Grout",   short:"Rec", icon:PlusCircle },
    { id:"record-daily", tab:"record_daily", label:"Record Daily", short:"Record", icon:ClipboardList },
  ]},
  { label: "Dashboard", items: [
    { id:"dash", tab:"dashboard", label:"Executive Dashboard", short:"Dash", icon:LayoutDashboard },
    { id:"anl-seg", tab:"analysis", module:"segment", label:"Segment Trend",    short:"Seg", icon:TrendingUp },
    { id:"anl-grt", tab:"analysis", module:"grout",   label:"Grout Volume",     short:"Grt", icon:Droplet },
    { id:"anl-rte", tab:"analysis", module:"route",   label:"Route & Schedule", short:"Rte", icon:MapPin },
    { id:"head", tab:"head_level", label:"ระดับหัวเจาะ", short:"Head", icon:ArrowUpDown },
    { id:"prep", tab:"prep_gantt", label:"Work Plan", short:"Plan", icon:CalendarRange },
    { id:"perf", tab:"performance", label:"Performance", short:"Perf", icon:Gauge },
  ]},
  { label: "Data Log", items: [
    { id:"log-seg", tab:"datalog", module:"segment", label:"Data Log · Segment", short:"Log", icon:Database },
    { id:"log-grt", tab:"datalog", module:"grout",   label:"Data Log · Grout",   short:"Log", icon:Database },
  ]},
  { label: "รายงาน", items: [
    { id:"shift",  tab:"shift_report", label:"Shift Report", short:"Shift", icon:Clock },
    { id:"report", tab:"report",       label:"Stats Report", short:"Stats", icon:FileText },
    { id:"daily",  tab:"daily_report", label:"Daily Report", short:"Report", icon:FileText },
  ]},
];
// mobile bottom bar = 5 ปุ่มหลัก (Home·Rec·Dash·Shift·More), ที่เหลือเข้า More
export const MOBILE_PRIMARY = ["overview","record","dashboard","shift_report"]; // + More
// More sheet = ทุกหน้า Dashboard ที่ไม่ได้อยู่ bottom bar (analysis Trend/Grout/Route, Work Plan, Performance) + Data Log + รายงาน
// ไม่รวม record_daily → ซ่อน "Record Daily" บนมือถือ
export const MOBILE_MORE_TABS = ["analysis","head_level","prep_gantt","performance","datalog","report","daily_report"];

// กลุ่ม nav ที่ viewer เห็น = กลุ่ม "Dashboard" + Shift Report (จากกลุ่มรายงาน)
export function viewerGroups() {
  const groups = NAV_GROUPS.filter((g) => g.label === "Dashboard").map((g) => ({ ...g }));
  const reports = NAV_GROUPS.find((g) => g.label === "รายงาน");
  const shift = reports ? reports.items.filter((it) => it.tab === "shift_report") : [];
  if (shift.length) groups.push({ label: "รายงาน", items: shift });
  return groups;
}
