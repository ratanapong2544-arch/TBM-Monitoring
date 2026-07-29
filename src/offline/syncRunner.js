import { ApiFailure, toApiFailure } from "./apiTransport";
import { MUTATION_STATUS } from "./schema";

function currentTime(clock) {
  const value = typeof clock === "function" ? clock() : clock && typeof clock.now === "function" ? clock.now() : Date.now();
  return typeof value === "number" ? value : Date.parse(value);
}

function retryAt(now, attemptCount, jitter) {
  return new Date(now + Math.min(300000, 2000 * 2 ** attemptCount) + jitter()).toISOString();
}

function assertResponse(mutation, response) {
  if (!response || !["success", "conflict", "validation_error"].includes(response.status) || response.requestId !== mutation.requestId) {
    throw new ApiFailure("permanent", "GAS_MALFORMED_SYNC_RESPONSE", "GAS returned a malformed sync response");
  }
  if (response.status === "success" && !response.record) throw new ApiFailure("permanent", "GAS_MALFORMED_SYNC_RESPONSE", "GAS did not return a confirmed record");
  if (response.status === "conflict" && (!response.serverRecord || response.currentVersion === undefined)) throw new ApiFailure("permanent", "GAS_MALFORMED_SYNC_RESPONSE", "GAS did not return conflict details");
  return response;
}

export function createSyncRunner({ repository, transport, clock = Date, jitter = () => 0, online = () => typeof navigator === "undefined" || navigator.onLine !== false, events = typeof window === "undefined" ? null : window } = {}) {
  if (!repository || !transport || typeof transport.postSyncMutation !== "function") throw new Error("Sync runner requires a repository and postSyncMutation transport");
  let running = null;
  let started = false;
  const canRun = () => online() && (!events || events.visibilityState !== "hidden");

  async function execute() {
    const result = { attempted: 0, synced: 0, conflicts: 0, errors: 0 };
    if (!canRun()) return result;
    const blockedDomains = new Set();
    const mutations = await repository.getDueMutations(currentTime(clock));
    for (const mutation of mutations) {
      if (blockedDomains.has(mutation.domainKey)) continue;
      result.attempted += 1;
      await repository.updateMutation(mutation.requestId, { status: MUTATION_STATUS.SYNCING });
      try {
        const response = assertResponse(mutation, await transport.postSyncMutation(mutation));
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
      if (started || !events) return;
      started = true;
      events.addEventListener("online", trigger);
      events.addEventListener("focus", trigger);
      events.addEventListener("visibilitychange", trigger);
      trigger();
    },
    stop() {
      if (!started || !events) return;
      started = false;
      events.removeEventListener("online", trigger);
      events.removeEventListener("focus", trigger);
      events.removeEventListener("visibilitychange", trigger);
    },
  };
}
