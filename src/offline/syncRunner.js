import { assertSyncResponse, toApiFailure } from "./apiTransport";
import { MUTATION_STATUS } from "./schema";

function currentTime(clock) {
  const value = typeof clock === "function" ? clock() : clock && typeof clock.now === "function" ? clock.now() : Date.now();
  return typeof value === "number" ? value : Date.parse(value);
}

function retryAt(now, attemptCount, jitter) {
  return new Date(now + Math.min(300000, 2000 * 2 ** attemptCount) + jitter()).toISOString();
}

export function createSyncRunner({ repository, transport, clock = Date, jitter = () => 0, online = () => typeof navigator === "undefined" || navigator.onLine !== false, events, windowEvents = events || (typeof window === "undefined" ? null : window), document: documentSource = typeof document === "undefined" ? null : document } = {}) {
  if (!repository || !transport || typeof transport.postSyncMutation !== "function") throw new Error("Sync runner requires a repository and postSyncMutation transport");
  let running = null;
  let started = false;
  const canRun = () => online() && (!documentSource || documentSource.visibilityState !== "hidden");
  const reclaim = () => repository.reclaimSyncingMutations ? repository.reclaimSyncingMutations() : Promise.resolve(0);

  async function execute() {
    const result = { attempted: 0, synced: 0, conflicts: 0, errors: 0 };
    await reclaim();
    if (!canRun()) return result;
    const blockedDomains = new Set();
    const mutations = await repository.getDueMutations(currentTime(clock));
    for (const mutation of mutations) {
      if (blockedDomains.has(mutation.domainKey)) continue;
      result.attempted += 1;
      await repository.updateMutation(mutation.requestId, { status: MUTATION_STATUS.SYNCING });
      try {
        const response = assertSyncResponse(mutation, await transport.postSyncMutation(mutation));
        if (response.status === "success") {
          await repository.applySyncSuccess(mutation.requestId, response);
          result.synced += 1;
          continue;
        }
        if (response.status === "conflict") {
          await repository.applyConflict(mutation.requestId, response);
          result.conflicts += 1;
          blockedDomains.add(mutation.domainKey);
          continue;
        }
        await repository.updateMutation(mutation.requestId, { status: MUTATION_STATUS.VALIDATION_ERROR, attemptCount: mutation.attemptCount + 1, lastError: { code: "VALIDATION", fields: response.fields || [], message: response.message || "Validation failed" }, nextAttemptAt: null });
        result.errors += 1;
        blockedDomains.add(mutation.domainKey);
      } catch (error) {
        const failure = toApiFailure(error);
        const attemptCount = mutation.attemptCount + 1;
        if (failure.kind === "retryable" || failure.kind === "aborted") {
          await repository.updateMutation(mutation.requestId, { status: MUTATION_STATUS.PENDING, attemptCount, nextAttemptAt: retryAt(currentTime(clock), attemptCount, jitter), lastError: { kind: failure.kind, code: failure.code, message: failure.message } });
        } else {
          const status = failure.kind === "validation" ? MUTATION_STATUS.VALIDATION_ERROR : MUTATION_STATUS.PERMANENT_ERROR;
          await repository.updateMutation(mutation.requestId, { status, attemptCount, nextAttemptAt: null, lastError: { kind: failure.kind, code: failure.code, message: failure.message } });
          result.errors += 1;
        }
        blockedDomains.add(mutation.domainKey);
      }
    }
    return result;
  }

  function runNow() {
    if (running) return running;
    running = execute().finally(() => { running = null; });
    return running;
  }

  const trigger = () => { if (canRun()) runNow(); };
  return {
    runNow,
    start() {
      if (started) return;
      started = true;
      if (windowEvents) {
        windowEvents.addEventListener("online", trigger);
        windowEvents.addEventListener("focus", trigger);
      }
      if (documentSource) documentSource.addEventListener("visibilitychange", trigger);
      reclaim().finally(trigger);
    },
    stop() {
      if (!started) return;
      started = false;
      if (windowEvents) {
        windowEvents.removeEventListener("online", trigger);
        windowEvents.removeEventListener("focus", trigger);
      }
      if (documentSource) documentSource.removeEventListener("visibilitychange", trigger);
    },
  };
}
