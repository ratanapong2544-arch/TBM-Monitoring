import React from "react";
import { CloudOff, RefreshCw, CloudCheck, AlertTriangle } from "lucide-react";

import { stuckCount, travellingCount } from "../../offline/syncSummary";
import { formatDisplayTime } from "../../utils/formatters";

/**
 * The one control that is on every page, and the only place a crew underground learns that a write
 * has not moved.
 *
 * The two numbers are different questions and are never added together: what is on its way needs
 * patience, what is stuck needs a person. Conflicts, refusals and everything stranded behind them
 * are one number for that reason — three rings behind one conflict is three records nobody can fix
 * by waiting.
 */
// The app's own formatter, like the Sync Center's — a second pair on two surfaces the crew reads
// together is how one of them ends up in the browser's zone while the other is in Bangkok's.
const timeLabel = value => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return formatDisplayTime(new Date(parsed));
};

export default function NetworkStatusButton({ summary, onOpen }) {
  const counts = summary || {};
  const travelling = travellingCount(counts);
  const stuck = stuckCount(counts);
  const offline = counts.online === false;
  const at = timeLabel(counts.lastSyncedAt);

  const tone = stuck > 0 ? "text-code-d" : offline ? "text-ink-2" : "text-code-a";
  const Icon = stuck > 0 ? AlertTriangle : offline ? CloudOff : travelling > 0 ? RefreshCw : CloudCheck;

  return (
    <button
      type="button"
      onClick={onOpen}
      title="สถานะการซิงก์"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-input text-xs font-semibold hover:bg-surface-alt transition-colors ${tone}`}
    >
      <Icon size={16} />
      {offline && <span>ออฟไลน์</span>}
      {travelling > 0 && <span>{travelling} กำลังส่ง</span>}
      {/* not "ติดค้าง": the Sync Center has a tab by that name holding a SMALLER number (errors and
          the rows stranded behind them, without the conflicts), and a crew reading 3 here and
          "ติดค้าง (2)" one tap later has to work out that nothing was lost. */}
      {stuck > 0 && <span>{stuck} ต้องแก้</span>}
      {/* A device with nothing queued says so. A bare "0" reads as a count of something. */}
      {!offline && travelling === 0 && stuck === 0 && <span>ซิงก์แล้ว</span>}
      {at && <span className="text-ink-3 font-normal">{at}</span>}
    </button>
  );
}
