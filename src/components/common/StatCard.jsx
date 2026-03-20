import React from 'react';

const StatCard = ({ label, value, subtext, color, icon: Icon }) => (
  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between group">
    <div className={`absolute -right-4 -top-4 p-4 opacity-[0.05] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12 ${color}`}>
      {Icon && <Icon size={80} />}
    </div>
    <div className="relative z-10">
      <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-extrabold tracking-wider mb-2">{label}</div>
      <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">{value}</div>
    </div>
    {subtext && <div className={`text-[10px] font-bold mt-4 pt-3 border-t border-slate-100 ${color.replace("text", "text-opacity-80")} relative z-10`}>{subtext}</div>}
  </div>
);

export default StatCard;
