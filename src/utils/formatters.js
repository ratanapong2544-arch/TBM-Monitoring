export const formatDisplayDate = (d) => {
  if (!d) return "";
  if (d instanceof Date) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  }
  if (typeof d === "string" && d.includes("T")) {
    const dateObj = new Date(d);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    }
    return d.split("T")[0];
  }
  return String(d);
};

export const formatDisplayTime = (t) => {
  if (!t) return "";
  if (t instanceof Date) {
    return t.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
  }
  if (typeof t === "string" && t.includes("T")) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    }
    const match = t.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : t;
  }
  return String(t);
};

export const parseCH = (val) => {
  if (typeof val === "string") return parseFloat(val.replace(/\+/g, "").replace(/,/g, "")) || 0;
  return parseFloat(val) || 0;
};

export const formatCH = (val) => {
  if (val === null || val === undefined || val === "") return "";
  let num = parseFloat(String(val).replace(/\+/g, "").replace(/,/g, ""));
  if (isNaN(num)) return String(val);
  let isNegative = num < 0;
  num = Math.abs(num);
  let intPart = Math.floor(num);
  let decPart = (num - intPart).toFixed(2).substring(1);
  let intStr = intPart.toString();
  let km = "0";
  let m = intStr;
  if (intStr.length > 3) {
    km = intStr.slice(0, -3);
    m = intStr.slice(-3);
  } else {
    m = intStr.padStart(3, "0");
  }
  return `${isNegative ? "-" : ""}${km}+${m}${decPart}`;
};
