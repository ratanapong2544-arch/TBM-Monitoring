import React, { useState, useEffect, useRef } from "react";
import { Images, ChevronLeft, ChevronRight, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { apiCall } from "../../utils/api";
import { useIsOnline } from "../../offline/useIsOnline";

const AUTOPLAY_MS = 5000;
const IMG_W = 1200;

// รูปโหลดผ่าน GAS proxy เป็น base64 (Drive block การ hotlink <img> จาก origin ภายนอก)
export default function ImageSlideshow({ folderId }) {
  const [images, setImages] = useState([]); // { id, name }
  const [index, setIndex] = useState(0);
  const [srcMap, setSrcMap] = useState({}); // id -> dataUri | "" (loading) | "ERR"
  const [loading, setLoading] = useState(true);
  // Drive photos come through the GAS proxy — there is no offline copy of them, and no point
  // asking. Each attempt is a fetch that has to time out, and the error it ends on tells the crew to
  // check the folder's sharing setting: advice about a problem they do not have.
  const online = useIsOnline();
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const inflight = useRef(new Set());

  // โหลดรายการรูป (id + name)
  useEffect(() => {
    let cancelled = false;
    if (!online) { setLoading(false); return undefined; }
    setLoading(true);
    setError(false);
    setSrcMap({});
    inflight.current = new Set();
    apiCall("getDriveImages", { folderId })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res)
          ? res
          : res && Array.isArray(res.images) ? res.images
          : res && Array.isArray(res.data) ? res.data : [];
        setImages(list.filter((it) => it && it.id).map((it) => ({ id: it.id, name: it.name || "" })));
        setIndex(0);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [folderId, reloadKey, online]);

  // โหลด base64 ของสไลด์ปัจจุบัน + preload สไลด์ถัดไป (ผ่าน GAS proxy)
  useEffect(() => {
    // `!online` as well as `!images.length`: the list from the last online session is still in state,
    // and without this the autoplay below kept walking it and firing one `getImage` per tick — for as
    // long as the crew stayed underground — writing "ERR" against photos that are perfectly fine.
    if (!online || !images.length) return;
    const wanted = [images[index], images[(index + 1) % images.length]].filter(Boolean).map((im) => im.id);
    wanted.forEach((id) => {
      if (srcMap[id] !== undefined || inflight.current.has(id)) return;
      inflight.current.add(id);
      setSrcMap((m) => ({ ...m, [id]: "" }));
      apiCall("getImage", { id, w: IMG_W })
        .then((r) => setSrcMap((m) => ({ ...m, [id]: r && r.status === "success" && r.dataUri ? r.dataUri : "ERR" })))
        .catch(() => setSrcMap((m) => ({ ...m, [id]: "ERR" })))
        .finally(() => inflight.current.delete(id));
    });
  }, [images, index, srcMap, online]);

  // autoplay
  useEffect(() => {
    // nothing to advance to while the panel above is showing the offline state
    if (paused || !online || images.length <= 1) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused, images.length, online]);

  const go = (d) => {
    if (images.length) setIndex((i) => (i + d + images.length) % images.length);
  };

  const Frame = ({ children }) => (
    <div className="bg-surface rounded-card shadow-card border border-line overflow-hidden print:hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <h3 className="font-semibold text-ink text-base flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-input bg-cyan-tint flex items-center justify-center text-navy"><Images size={17} /></span>
          ภาพหน้างาน <span className="text-xs font-semibold text-ink-3">· Site Photos</span>
        </h3>
        {images.length > 0 && (
          <span className="text-xs font-semibold font-mono text-ink-2 bg-surface-alt border border-line px-2.5 py-1 rounded-badge">
            {Math.min(index + 1, images.length)} / {images.length}
          </span>
        )}
      </div>
      {children}
    </div>
  );

  // Before `loading` and before `error`: with no link neither of those is what happened, and the
  // sharing-setting advice below would be an answer to a question nobody asked.
  if (!online) {
    return (
      <Frame>
        <div className="h-[300px] sm:h-[360px] bg-surface-alt flex flex-col items-center justify-center text-center px-6 gap-3">
          <AlertCircle size={28} className="text-ink-3" />
          <div className="text-sm font-semibold text-ink">รูปหน้างานต้องเชื่อมต่ออินเทอร์เน็ต</div>
          <div className="text-xs text-ink-3 max-w-md leading-relaxed">
            รูปเก็บอยู่บน Google Drive และโหลดผ่านเซิร์ฟเวอร์ — จะแสดงอัตโนมัติเมื่อกลับมามีสัญญาณ ข้อมูลอื่นในหน้านี้ใช้ได้ตามปกติ
          </div>
        </div>
      </Frame>
    );
  }
  if (loading) {
    return (
      <Frame>
        <div className="h-[300px] sm:h-[360px] bg-surface-alt animate-pulse flex items-center justify-center text-ink-3 text-sm">
          <Loader2 size={18} className="animate-spin mr-2" /> กำลังโหลดรูป…
        </div>
      </Frame>
    );
  }
  if (error) {
    return (
      <Frame>
        <div className="h-[300px] sm:h-[360px] bg-surface-alt flex flex-col items-center justify-center text-center px-6 gap-3">
          <AlertCircle size={28} className="text-code-d" />
          <div className="text-sm font-semibold text-ink">โหลดรูปไม่สำเร็จ</div>
          <div className="text-xs text-ink-3 max-w-md leading-relaxed">
            ตรวจว่าแชร์โฟลเดอร์เป็น "ทุกคนที่มีลิงก์ (Anyone with the link)" และ deploy GAS action <span className="font-mono">getDriveImages</span> / <span className="font-mono">getImage</span> แล้ว
          </div>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy bg-cyan-tint hover:bg-cyan-tint/70 border border-line px-3 py-1.5 rounded-input transition-colors"
          >
            <RefreshCw size={13} /> ลองใหม่
          </button>
        </div>
      </Frame>
    );
  }
  if (images.length === 0) {
    return (
      <Frame>
        <div className="h-[300px] sm:h-[360px] bg-surface-alt flex items-center justify-center text-ink-3 text-sm">
          ยังไม่มีรูปในโฟลเดอร์
        </div>
      </Frame>
    );
  }

  const cur = images[Math.min(index, images.length - 1)];
  const curSrc = cur ? srcMap[cur.id] : undefined;
  return (
    <Frame>
      <div
        className="relative group h-[300px] sm:h-[360px] bg-navy-dark overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {curSrc && curSrc !== "ERR" ? (
          <>
            {/* backdrop เบลอจากรูปเดียวกัน → เติมช่องว่าง letterbox ไม่ให้พื้นที่ว่างโล่ง */}
            <img
              src={curSrc}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-45"
            />
            <img
              key={cur.id}
              src={curSrc}
              alt={cur.name}
              className="relative w-full h-full object-contain animate-fade-in"
            />
          </>
        ) : curSrc === "ERR" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/70 text-sm">
            <AlertCircle size={20} /> โหลดรูปนี้ไม่สำเร็จ
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center gap-2 text-white/70 text-sm">
            <Loader2 size={18} className="animate-spin" /> กำลังโหลด…
          </div>
        )}
        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="ก่อนหน้า" className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-navy-dark/55 border border-white/25 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
              <ChevronLeft size={22} />
            </button>
            <button onClick={() => go(1)} aria-label="ถัดไป" className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-navy-dark/55 border border-white/25 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
              <ChevronRight size={22} />
            </button>
          </>
        )}
        {cur.name && (
          <div className="absolute inset-x-0 bottom-0 px-4 pt-7 pb-3 bg-gradient-to-t from-black/60 to-transparent text-white text-xs font-medium font-mono truncate">
            {cur.name}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-1.5 justify-center py-3 bg-surface">
          {images.map((im, i) => (
            <button
              key={im.id}
              onClick={() => setIndex(i)}
              aria-label={`รูปที่ ${i + 1}`}
              className={`h-[7px] rounded-full transition-all ${i === index ? "w-5 bg-navy" : "w-[7px] bg-line hover:bg-ink-3"}`}
            />
          ))}
        </div>
      )}
    </Frame>
  );
}
