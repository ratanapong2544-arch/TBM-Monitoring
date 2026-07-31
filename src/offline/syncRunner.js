import { assertSyncResponse, toApiFailure } from "./apiTransport";
import { MUTATION_STATUS } from "./schema";

function currentTime(clock) {
  const value = typeof clock === "function" ? clock() : clock && typeof clock.now === "function" ? clock.now() : Date.now();
  return typeof value === "number" ? value : Date.parse(value);
}

function retryAt(now, attemptCount, jitter) {
  return new Date(now + Math.min(300000, 2000 * 2 ** attemptCount) + jitter()).toISOString();
}

function createOwner() {
  return globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? `sync-${globalThis.crypto.randomUUID()}` : `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createSyncRunner({ repository, transport, clock = Date, jitter = () => 0, online = () => typeof navigator === "undefined" || navigator.onLine !== false, events, windowEvents = events || (typeof window === "undefined" ? null : window), document: documentSource = typeof document === "undefined" ? null : document, owner = createOwner(), leaseMs = 30000 } = {}) {
  if (!repository || !transport || typeof transport.postSyncMutation !== "function") throw new Error("Sync runner requires a repository and postSyncMutation transport");
  let running = null;
  let started = false;
  let generation = 0;
  const canRun = () => online() && (!documentSource || documentSource.visibilityState !== "hidden");

  async function execute() {
    const result = { attempted: 0, synced: 0, conflicts: 0, errors: 0 };
    if (!canRun()) return result;
    // `claimDueMutations` hands back one mutation per domain — the head — so a single pass drains at
    // most one edit per record. A shift report with three time bars added offline would need three
    // separate triggers, and the triggers are online/focus/visibilitychange and each new write: a
    // PWA left open at the site office can sit for hours with recorded work still queued and nothing
    // on screen saying so. Keep passing while a pass actually SYNCED something — progress is the
    // loop's only exit condition, so a conflicted or erroring domain (which stays at its head until
    // Task 10 resolves it) ends the drain instead of spinning on it.
    // The cap is a tripwire, not a policy. Termination rests on one thing — a pass that syncs
    // nothing ends the drain — and if that ever stops being true the loop does not fail, it HANGS:
    // `runNow` holds its promise for the life of the call, so every later trigger joins the same
    // stuck promise, the queue stops draining for the rest of the session and the tab pegs a core.
    // A phone underground is the worst place for that, and a hang is also the worst thing to leave
    // a test suite to discover. A backlog is at most as deep as one record's edit history; a
    // thousand passes is far past any real one and reaches this only if the exit condition broke.
    let passes = 0;
    let pass = await drainOnce(result);
    while (pass > 0) {
      if (++passes > 1000) throw new Error("Sync drain did not converge");
      pass = await drainOnce(result);
    }
    return result;
  }

  async function drainOnce(result) {
    const before = result.synced;
    // One exit condition, not two. There was also an early return for an empty claim, which is
    // exactly what falling through already does — and having both meant neither could be tested:
    // remove either and the suite stays green, remove both and it never terminates.
    //
    // There was a `blockedDomains` set here too, skipping later mutations of a domain that had just
    // conflicted. It could never fire: `claimDueMutations` returns the HEAD of each domain, so a
    // domain appears at most once per pass — and if it ever had fired it would have left a claimed
    // mutation stuck in `syncing` until its lease expired.
    const mutations = await repository.claimDueMutations({ owner, now: currentTime(clock), leaseMs });
    for (const mutation of mutations) {
      result.attempted += 1;
      try {
        const response = assertSyncResponse(mutation, await transport.postSyncMutation(mutation));
        if (response.status === "success") {
          if (await repository.applySyncSuccess(mutation.requestId, response, { owner })) result.synced += 1;
          continue;
        }
        if (response.status === "conflict") {
          if (await repository.applyConflict(mutation.requestId, response, { owner })) result.conflicts += 1;
          continue;
        }
        if (await repository.updateMutation(mutation.requestId, { status: MUTATION_STATUS.VALIDATION_ERROR, attemptCount: mutation.attemptCount + 1, lastError: { code: "VALIDATION", fields: response.fields || [], message: response.message || "Validation failed" }, nextAttemptAt: null }, { owner })) result.errors += 1;
      } catch (error) {
        const failure = toApiFailure(error);
        const attemptCount = mutation.attemptCount + 1;
        if (failure.kind === "retryable" || failure.kind === "aborted") {
          await repository.updateMutation(mutation.requestId, { status: MUTATION_STATUS.PENDING, attemptCount, nextAttemptAt: retryAt(currentTime(clock), attemptCount, jitter), lastError: { kind: failure.kind, code: failure.code, message: failure.message } }, { owner });
        } else {
          const status = failure.kind === "validation" ? MUTATION_STATUS.VALIDATION_ERROR : MUTATION_STATUS.PERMANENT_ERROR;
          if (await repository.updateMutation(mutation.requestId, { status, attemptCount, nextAttemptAt: null, lastError: { kind: failure.kind, code: failure.code, message: failure.message } }, { owner })) result.errors += 1;
        }
      }
    }
    return result.synced - before;
  }

  function runNow() {
    if (running) return running;
    running = execute().finally(() => { running = null; });
    return running;
  }

  // `execute` reaches IndexedDB to claim due mutations, so it rejects outright in a session whose
  // database could not be opened — and that is exactly the session the runner is started in anyway,
  // so every online/focus/visibility event would raise an unhandled rejection on a working screen
  const trigger = () => { if (started && canRun()) runNow().catch(() => {}); };
  return {
    runNow,
    start() {
      if (started) return Promise.resolve();
      started = true;
      const token = ++generation;
      if (windowEvents) {
        windowEvents.addEventListener("online", trigger);
        windowEvents.addEventListener("focus", trigger);
      }
      if (documentSource) documentSource.addEventListener("visibilitychange", trigger);
      return Promise.resolve().then(() => {
        if (!started || token !== generation) return undefined;
        return runNow();
      });
    },
    stop() {
      if (!started) return;
      started = false;
      generation += 1;
      if (windowEvents) {
        windowEvents.removeEventListener("online", trigger);
        windowEvents.removeEventListener("focus", trigger);
      }
      if (documentSource) documentSource.removeEventListener("visibilitychange", trigger);
    },
  };
}
