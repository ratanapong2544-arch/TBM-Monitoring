import React, { useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";

/**
 * How this app gets onto the phone that goes down the tunnel.
 *
 * One panel, four answers, and none of them pretends. A desktop browser is never told it installed
 * anything — the app is for the phone underground, so the useful answer there is how to open it
 * there. An Android whose browser has not offered the install event yet is told to wait rather than
 * given a button that does nothing.
 *
 * The iPhone steps are fixed by the plan and are in that order: Safari, Share, Add to Home Screen.
 * Safari is named because the steps do not exist in Chrome on iOS.
 */
export default function InstallAppPanel({ install, className = "", url }) {
  const [copied, setCopied] = useState(false);
  const mode = install && install.mode;
  const appUrl = url || (typeof window !== "undefined" && window.location ? window.location.origin : "");
  const copyLink = async () => {
    try {
      if (navigator && navigator.clipboard) await navigator.clipboard.writeText(appUrl);
      setCopied(true);
    } catch (error) { /* the URL is on screen either way */ }
  };
  if (!mode || mode === "installed") return null;

  return (
    <div className={`rounded-input border border-line bg-surface-alt p-3 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink mb-2">
        <Smartphone size={16} /> ติดตั้งแอปบนมือถือ
      </div>
      <p className="text-xs text-ink-2 mb-2">
        แอปที่ติดตั้งไว้จะเปิดใช้ได้แม้ไม่มีสัญญาณ งานที่บันทึกจะรออยู่ในเครื่องและส่งขึ้นเซิร์ฟเวอร์เองเมื่อกลับมาออนไลน์
      </p>

      {mode === "prompt" && (
        <button
          type="button"
          onClick={install.promptInstall}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold bg-navy text-white"
        >
          <Download size={16} /> ติดตั้งแอป
        </button>
      )}

      {/* `display:flex` on an <li> replaces `display:list-item`, which drops the marker AND stops the
          counter — step 3 then renders as "2.". The icon goes inside a span instead. */}
      {mode === "ios-instructions" && (
        <ol className="text-xs text-ink space-y-1.5 list-decimal list-inside">
          <li>เปิดลิงก์ด้วย Safari</li>
          <li><span className="inline-flex items-center gap-1.5"><Share size={14} /> กด Share</span></li>
          <li>เลือก “เพิ่มไปยังหน้าจอโฮม”</li>
        </ol>
      )}

      {mode === "waiting" && (
        <p className="text-xs text-ink-2">
          เบราว์เซอร์ยังไม่พร้อมให้ติดตั้ง — เปิดแอปนี้ค้างไว้สักครู่แล้วลองใหม่ หรือใช้เมนูของเบราว์เซอร์ “เพิ่มลงในหน้าจอหลัก”
        </p>
      )}

      {mode === "share-link" && (
        <div className="text-xs text-ink-2 space-y-1.5">
          <p>เปิดลิงก์นี้บนมือถือเพื่อติดตั้ง — บนคอมพิวเตอร์ใช้งานได้ตามปกติแต่ติดตั้งไม่ได้</p>
          {/* the link itself, because "open this link" without the link is not guidance */}
          <code className="block break-all bg-surface border border-line rounded-input px-2 py-1 text-ink font-mono">{appUrl}</code>
          <button type="button" onClick={copyLink} className="text-navy font-semibold">
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
          </button>
        </div>
      )}
    </div>
  );
}
