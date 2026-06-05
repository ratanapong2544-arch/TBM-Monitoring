import React, { useState, useEffect } from "react";
import { prefillFromLatest } from "../../utils/dailyReports";
import DailyReportForm from "../dailyreport/DailyReportForm";

// carriedKeys = key เครื่องจักร/แรงงานที่ถูกเติม (ค่าไม่ว่าง) → ไฮไลต์ฟ้าในฟอร์ม
const carriedFrom = (form) => {
  const s = new Set();
  ["equipment", "labor"].forEach((g) =>
    Object.entries(form[g] || {}).forEach(([k, v]) => { if (v !== "" && v != null) s.add(k); })
  );
  return s;
};

export default function RecordDailyView({ dailyReports = [], onSave, pendingForm = null, onConsumePendingForm }) {
  const makeNew = () => {
    const pre = prefillFromLatest(dailyReports, { machine: "TBM1" });
    return { form: pre, carriedKeys: carriedFrom(pre) };
  };
  const [editing, setEditing] = useState(makeNew);
  const [formKey, setFormKey] = useState(0);   // เปลี่ยน key → remount form ด้วย initial ใหม่

  useEffect(() => {
    if (!pendingForm) return;
    setEditing({ form: pendingForm, carriedKeys: carriedFrom(pendingForm) });
    setFormKey((k) => k + 1);
    if (onConsumePendingForm) onConsumePendingForm();
    // eslint-disable-next-line
  }, [pendingForm]);

  const handleSave = (form) => onSave(form);                                       // App: persist + ไป daily_report
  const handleCancel = () => { setEditing(makeNew()); setFormKey((k) => k + 1); };  // reset เป็นฟอร์มใหม่

  return (
    <div className="max-w-[1100px] mx-auto pb-24 animate-fade-in">
      <DailyReportForm key={formKey} initial={editing.form} carriedKeys={editing.carriedKeys} onCancel={handleCancel} onSave={handleSave} />
    </div>
  );
}
