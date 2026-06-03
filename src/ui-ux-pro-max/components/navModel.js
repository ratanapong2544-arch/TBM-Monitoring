import { Home, PlusCircle, LayoutDashboard, Database, Clock, FileText, TrendingUp, Droplet, MapPin } from "lucide-react";
// tab = activeTab value เดิม, module = currentModule (ถ้ามี), short = label สั้นสำหรับ bottom nav มือถือ
export const NAV_GROUPS = [
  { label: "ภาพรวม", items: [{ id:"overview", tab:"overview", label:"Home", short:"Home", icon:Home }] },
  { label: "บันทึกข้อมูล", items: [
    { id:"rec-seg", tab:"record", module:"segment", label:"Record · Segment", short:"Rec", icon:PlusCircle },
    { id:"rec-grt", tab:"record", module:"grout",   label:"Record · Grout",   short:"Rec", icon:PlusCircle },
  ]},
  { label: "Dashboard", items: [
    { id:"dash", tab:"dashboard", label:"Executive Dashboard", short:"Dash", icon:LayoutDashboard },
    { id:"anl-seg", tab:"analysis", module:"segment", label:"Segment Trend",    short:"Seg", icon:TrendingUp },
    { id:"anl-grt", tab:"analysis", module:"grout",   label:"Grout Volume",     short:"Grt", icon:Droplet },
    { id:"anl-rte", tab:"analysis", module:"route",   label:"Route & Schedule", short:"Rte", icon:MapPin },
  ]},
  { label: "Data Log", items: [
    { id:"log-seg", tab:"datalog", module:"segment", label:"Data Log · Segment", short:"Log", icon:Database },
    { id:"log-grt", tab:"datalog", module:"grout",   label:"Data Log · Grout",   short:"Log", icon:Database },
  ]},
  { label: "รายงาน", items: [
    { id:"shift",  tab:"shift_report", label:"Shift Report", short:"Shift", icon:Clock },
    { id:"report", tab:"report",       label:"Stats Report", short:"Stats", icon:FileText },
  ]},
];
// mobile bottom bar = 5 ปุ่มหลัก (Home·Rec·Dash·Shift·More), ที่เหลือเข้า More
export const MOBILE_PRIMARY = ["overview","record","dashboard","shift_report"]; // + More
export const MOBILE_MORE_TABS = ["datalog","report"];
