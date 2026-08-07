import React, { useEffect, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";

/**
 * A new build is ready. It is applied when the crew says so and not before.
 *
 * The service worker installs the new version in the background and then waits. Activating it
 * reloads the page, and a reload nobody asked for underground is a half-typed shift report gone —
 * so this is a banner rather than an automatic swap.
 *
 * The sequence is the plan's, exactly: tell the waiting worker to take over, then reload when it
 * ACTUALLY has (`controllerchange`, once). Reloading straight after `postMessage` reloads into the
 * old worker often enough to be a bug report nobody can reproduce.
 *
 * Dismissing it SNOOZES it. It used to drop the registration, which meant one tap silenced the
 * prompt for the life of the tab — and a PWA the crew never closes has no next launch to ask at. On
 * 2026-08-06 a device ran a replaced build for a full day that way, holding a shift's records in a
 * queue the new build no longer has. "Not now" is a reasonable answer during a pour; "never" is not
 * an answer the crew meant to give.
 *
 * Nothing here clears IndexedDB or caches. The queue is the crew's unsent work, and a screen about
 * a version number has no business touching it.
 */
const SNOOZE_MS = 10 * 60 * 1000;

export default function UpdateAvailableBanner({ reload, serviceWorker, snoozeMs = SNOOZE_MS }) {
  const [waiting, setWaiting] = useState(null);
  const [applying, setApplying] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    const onUpdate = event => {
      const registration = event && event.detail;
      // `onUpdate` also fires on the controller-change path, where there is nothing to activate;
      // offering an update the crew cannot take is worse than staying quiet.
      if (registration && registration.waiting) setWaiting(registration.waiting);
    };
    window.addEventListener("tbm:pwa-update", onUpdate);
    return () => window.removeEventListener("tbm:pwa-update", onUpdate);
  }, []);

  useEffect(() => {
    if (!snoozed) return undefined;
    const timer = setTimeout(() => setSnoozed(false), snoozeMs);
    return () => clearTimeout(timer);
  }, [snoozed, snoozeMs]);

  if (!waiting || snoozed) return null;

  const apply = () => {
    setApplying(true);
    const container = serviceWorker || (typeof navigator !== "undefined" ? navigator.serviceWorker : null);
    const doReload = reload || (() => window.location.reload());
    if (container && typeof container.addEventListener === "function") {
      container.addEventListener("controllerchange", () => doReload(), { once: true });
    }
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-[80] w-[min(94vw,26rem)] print:hidden">
      <div className="flex items-center gap-3 rounded-input bg-navy text-white shadow-modal px-3 py-2.5">
        <ArrowUpCircle size={18} className="shrink-0" />
        <div className="flex-1 text-xs">
          <div className="font-semibold">มีเวอร์ชันใหม่พร้อมใช้งาน</div>
          <div className="text-white/70">อัปเดตแล้วแอปจะโหลดใหม่ — บันทึกงานที่ค้างอยู่ก่อน</div>
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={applying}
          className="shrink-0 px-3 py-1.5 rounded-input bg-white text-navy text-xs font-semibold disabled:opacity-60"
        >
          {applying ? "กำลังอัปเดต…" : "อัปเดตตอนนี้"}
        </button>
        <button type="button" onClick={() => setSnoozed(true)} title="ภายหลัง — จะเตือนอีกครั้ง" className="shrink-0 p-1 text-white/70 hover:text-white">
          <X size={16} />
          <span className="sr-only">ภายหลัง</span>
        </button>
      </div>
    </div>
  );
}
