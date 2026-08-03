import { useEffect, useState } from "react";

/**
 * Whether the device has a link, for the features that cannot work without one.
 *
 * Read from the platform, not from a cached answer: `App`'s notice strip does the same, with the
 * comment "Only claim the device is offline when it is". The Sync Center's `syncSummary.online` is
 * the same fact recomputed for the queue's counts; this exists so the four online-only features —
 * the Gemini button, the PDF helper, the Drive slideshow, the satellite basemap — do not each grow
 * their own `navigator.onLine` read and their own listener, which is the shape that has cost this
 * branch a fix in most review rounds.
 *
 * `navigator.onLine` is the browser's own answer and it can be optimistic: a phone attached to a
 * site wifi with no uplink reports true. That is why every guard below it still handles a failure —
 * this hook is what stops the app from TRYING when it already knows there is no point.
 */
export function useIsOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    // the platform may have changed between the first render and this effect
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
