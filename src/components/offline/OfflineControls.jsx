import React, { useCallback, useState } from "react";

import { useOffline } from "../../offline/OfflineProvider";
import { useInstallPrompt } from "../../pwa/useInstallPrompt";
import ConflictResolver from "./ConflictResolver";
import InstallAppPanel from "./InstallAppPanel";
import NetworkStatusButton from "./NetworkStatusButton";
import SyncCenter from "./SyncCenter";
import UpdateAvailableBanner from "./UpdateAvailableBanner";

/**
 * One state source for the status button and everything behind it.
 *
 * The button lives in the top bar and the panels live at the Shell root, which is two places in the
 * tree — so the open/close state is held here and handed to both, rather than duplicated on each
 * side of the layout and drifting the first time one of them is remounted.
 */
export function useOfflineControls() {
  const { repository, runner, syncSummary } = useOffline();
  const [open, setOpen] = useState(false);
  const [conflict, setConflict] = useState(null);
  const install = useInstallPrompt();

  const load = useCallback(() => repository.getSyncCenter(), [repository]);
  const syncNow = useCallback(async () => {
    try { await runner.runNow(); } catch (error) { /* the panel reports what is still queued either way */ }
  }, [runner]);

  const resolve = useCallback(async (target, options) => {
    try {
      await repository.resolveConflict(target.conflictId, options);
      setConflict(null);
    } catch (error) {
      alert("แก้ข้อขัดแย้งไม่สำเร็จ: " + (error && error.message ? error.message : error));
    }
  }, [repository]);

  const retry = useCallback(async target => {
    try {
      await repository.retryMutation(target.requestId);
    } catch (error) {
      alert("ส่งใหม่ไม่สำเร็จ: " + (error && error.message ? error.message : error));
    }
  }, [repository]);

  const discard = useCallback(async target => {
    try {
      await repository.discardMutation(target.requestId);
      setConflict(null);
    } catch (error) {
      alert("ทิ้งรายการไม่สำเร็จ: " + (error && error.message ? error.message : error));
    }
  }, [repository]);

  const button = <NetworkStatusButton summary={syncSummary} onOpen={() => setOpen(true)} />;
  const overlays = (
    <>
      <SyncCenter
        open={open}
        onClose={() => setOpen(false)}
        summary={syncSummary}
        load={load}
        onSyncNow={syncNow}
        onResolve={setConflict}
        onRetry={retry}
        onDiscard={discard}
        installPanel={<InstallAppPanel install={install} />}
      />
      {conflict && (
        <ConflictResolver
          conflict={conflict}
          onResolve={resolve}
          onDiscard={discard}
          onClose={() => setConflict(null)}
        />
      )}
      <UpdateAvailableBanner />
    </>
  );

  return { button, overlays, installPanel: <InstallAppPanel install={install} /> };
}
