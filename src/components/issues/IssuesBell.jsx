import React from "react";
import { Bell } from "lucide-react";

export default function IssuesBell({ count = 0, onClick }) {
  return (
    <button onClick={onClick} title="ปัญหา / อุปสรรค" className="xl:hidden relative p-2 rounded-input text-ink-2 hover:bg-cyan-tint transition-colors">
      <Bell size={20} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-code-d text-white text-[10px] font-bold rounded-full">{count}</span>
      )}
    </button>
  );
}
