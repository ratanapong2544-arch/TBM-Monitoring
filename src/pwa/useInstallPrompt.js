import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * What this device can actually be asked to do about installing.
 *
 * Four different answers, and only one of them is a button:
 *   - `waiting`  — Android, before the browser has offered `beforeinstallprompt`. It offers it when
 *                  it decides the site qualifies, which is not on our schedule; claiming an install
 *                  is available before then gives the crew a button that does nothing.
 *   - `prompt`   — the event is in hand. Tapping is what fires it.
 *   - `ios-instructions` — Safari has no prompt to fire, ever. The only honest thing is the steps.
 *   - `share-link`— a desktop browser. The app is for the phone in the tunnel, so the useful answer
 *                  is how to open it there, not a fake install.
 *   - `installed` — already running standalone; there is nothing to offer.
 *
 * The captured event is single-use. The browser refuses a second `prompt()` on it, so it is released
 * after firing rather than left behind a button that would do nothing when tapped.
 */
function detectPlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = String(navigator.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ reports itself as a Mac; the touch points are what give it away
  if (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function detectStandalone() {
  if (typeof window === "undefined") return false;
  const displayMode = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  // Safari's own flag, which is the only signal on iOS
  return Boolean(displayMode || (typeof navigator !== "undefined" && navigator.standalone));
}

export function useInstallPrompt({ platform, standalone } = {}) {
  const resolvedPlatform = platform || detectPlatform();
  const [installed, setInstalled] = useState(() => (standalone === undefined ? detectStandalone() : standalone));
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const capture = event => {
      // Chrome shows its own mini-infobar unless the page takes the event; taking it is what lets
      // the install live inside the app's own panel, beside the offline explanation.
      event.preventDefault();
      setDeferred(event);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return null;
    const event = deferred;
    // released BEFORE awaiting the choice: the event is spent the moment it fires, and a second tap
    // while the sheet is open would call `prompt()` again on an event the browser has finished with
    setDeferred(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice && choice.outcome === "accepted") setInstalled(true);
      return choice || null;
    } catch (error) {
      return null;
    }
  }, [deferred]);

  const mode = useMemo(() => {
    if (installed) return "installed";
    if (deferred) return "prompt";
    if (resolvedPlatform === "ios") return "ios-instructions";
    if (resolvedPlatform === "android") return "waiting";
    return "share-link";
  }, [installed, deferred, resolvedPlatform]);

  return { mode, canPrompt: Boolean(deferred), promptInstall, platform: resolvedPlatform, installed };
}
