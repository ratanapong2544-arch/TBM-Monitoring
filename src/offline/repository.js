import { fetchServerSnapshot as defaultFetchServerSnapshot } from "./apiTransport";
import { openOfflineDb as defaultOpenDb } from "./db";
import { getOrCreateDeviceId as defaultGetDeviceId } from "./device";
import { makeDomainKey } from "./domainKey";
import { claimDueMutations, confirmMutation, getConflict, getEntity, getMutation, getSyncCounts, listDueMutations, putOptimisticMutation, resolveConflictAndEnqueue, resolveStoredConflict, retryMutationAsSuccessor, saveConflict, setLastSyncedAt, setSyncMetaValue, updateMutation } from "./mutationStore";
import { MUTATION_STATUS } from "./schema";
import { emptyServerData, normalizeServerData as defaultNormalizeServerData } from "./normalizeServerData";
import { readServerSnapshot as defaultReadServerSnapshot, writeServerSnapshot as defaultWriteServerSnapshot } from "./snapshotStore";

// operations each entity supports, mirroring SYNC_ENTITY_OPS in gas-live/Code.js
const CREATE_UPDATE = ["create", "update"];
const CREATE_UPDATE_DELETE = ["create", "update", "delete"];
const ENTITY_OPERATIONS = {
  segment: CREATE_UPDATE_DELETE,
  grout: CREATE_UPDATE_DELETE,
  secondaryGrout: CREATE_UPDATE_DELETE,
  shiftReport: CREATE_UPDATE,
  issue: CREATE_UPDATE_DELETE,
  dailyReport: CREATE_UPDATE_DELETE,
  prepTask: CREATE_UPDATE_DELETE,
  planConfig: CREATE_UPDATE,
  distPlanConfig: CREATE_UPDATE,
  routeConfig: CREATE_UPDATE,
  instrument: CREATE_UPDATE,
  instReading: CREATE_UPDATE_DELETE,
  instSchedule: CREATE_UPDATE,
};

export function createRepository(deps = {}) {
  const openDb = deps.openDb || defaultOpenDb;
  const fetchServerSnapshot = deps.fetchServerSnapshot || defaultFetchServerSnapshot;
  const normalizeServerData = deps.normalizeServerData || defaultNormalizeServerData;
  const readServerSnapshot = deps.readServerSnapshot || defaultReadServerSnapshot;
  const writeServerSnapshot = deps.writeServerSnapshot || defaultWriteServerSnapshot;
  const getDeviceId = deps.getDeviceId || defaultGetDeviceId;
  const now = deps.now || (() => new Date().toISOString());
  const createRequestId = deps.createRequestId || (() => globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : `request-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const online = deps.online || (() => typeof navigator === "undefined" || navigator.onLine !== false);
  const subscribers = new Set();
  const errorSubscribers = new Set();
  const emit = event => subscribers.forEach(listener => listener(event));
  const emitError = event => errorSubscribers.forEach(listener => listener(event));
  const cachedResult = data => data
    ? { data, source: "indexeddb", fetchedAt: data.fetchedAt || null, stale: true }
    : null;

  function requireMutationEnvelope(input) {
    ["entityType", "operation", "recordId"].forEach(field => {
      if (!input || input[field] === undefined || input[field] === null || input[field] === "") throw new Error(`Mutation requires ${field}`);
    });
    if (!input.payload || typeof input.payload !== "object") throw new Error("Mutation requires payload");
    if (!["create", "update", "delete"].includes(input.operation)) throw new Error("Mutation requires a supported operation");
    // GAS refuses operations its entity has no action for (SYNC_ENTITY_OPS in gas-live/Code.js).
    // Queueing one would park a terminal validation_error at the head of its domain and block
    // every later mutation on that key, so refuse it before it reaches the queue.
    const allowed = ENTITY_OPERATIONS[input.entityType];
    if (!allowed) throw new Error(`Mutation has an unsupported entityType ${input.entityType}`);
    if (!allowed.includes(input.operation)) throw new Error(`Mutation operation ${input.operation} is not supported for ${input.entityType}`);
    // dailyReport/prepTask are machine-scoped domain keys, so GAS refuses machineless envelopes
    // (SYNC_MACHINE_ENTITIES in gas-live/Code.js); reject them here instead of queueing a
    // mutation that can only fail validation on the server.
    if (["segment", "grout", "secondaryGrout", "shiftReport", "planConfig", "distPlanConfig", "routeConfig", "dailyReport", "prepTask"].includes(input.entityType) && !input.machine) throw new Error("Mutation requires machine");
    if (["segment", "grout", "secondaryGrout"].includes(input.entityType) && !input.payload.ringNo) throw new Error("Mutation requires ringNo");
    if (input.entityType === "shiftReport") {
      if (!input.payload.date) throw new Error("Mutation requires date");
      if (!input.payload.shift) throw new Error("Mutation requires shift");
    }
    if (["update", "delete"].includes(input.operation) && (!Number.isInteger(input.baseVersion) || input.baseVersion < 0)) throw new Error("Mutation requires valid baseVersion");
    const canonicalDomainKey = makeDomainKey(input);
    if (input.domainKey && input.domainKey !== canonicalDomainKey) throw new Error("Mutation domainKey must match canonical domain key");
    return canonicalDomainKey;
  }

  async function mutate(input) {
    const domainKey = requireMutationEnvelope(input);
    const db = await openDb();
    const mutation = {
      requestId: createRequestId(), entityType: input.entityType, operation: input.operation,
      machine: input.machine, recordId: input.recordId, domainKey, baseVersion: input.baseVersion ?? null,
      deviceId: await getDeviceId(db), actorId: input.actorId || null, createdAtLocal: now(), payload: input.payload,
    };
    const { entity } = await putOptimisticMutation(db, mutation);
    emit({ type: "mutation", requestId: mutation.requestId, status: MUTATION_STATUS.PENDING, domainKey });
    return { requestId: mutation.requestId, status: MUTATION_STATUS.PENDING, optimisticRecord: entity.payload };
  }

  async function applySyncSuccess(requestId, response, options) {
    const mutation = await confirmMutation(await openDb(), requestId, response, options);
    if (!mutation) return null;
    await setLastSyncedAt(await openDb(), response.updatedAt || now());
    // The confirmed version has to reach whoever stamps the NEXT mutation's `baseVersion`. Without
    // it a second edit of the same record in one session is still stamped with the version the last
    // full snapshot carried, the server sees base ≠ current and answers `conflict` — for a row
    // nobody else touched — and that conflict then sits at the head of its domain and blocks every
    // later edit of the same record, with no conflict UI until Task 10 to show any of it.
    emit({
      type: "sync", requestId, status: mutation.status,
      domainKey: mutation.domainKey,
      version: response.version ?? null,
    });
    return mutation;
  }

  async function applyConflict(requestId, response, options) {
    const conflict = await saveConflict(await openDb(), requestId, response, options);
    if (!conflict) return null;
    emit({ type: "conflict", requestId, conflictId: conflict.conflictId });
    return conflict;
  }

  async function resolveConflict(conflictId, { strategy, payload } = {}) {
    if (!["server", "local", "manual"].includes(strategy)) throw new Error("Conflict resolution requires a supported strategy");
    const db = await openDb();
    const conflict = await getConflict(db, conflictId);
    if (!conflict || conflict.status !== "open") throw new Error(`Unknown open conflict ${conflictId}`);
    // legacyMigration files staging differences in the same store without a requestId; those are
    // reviewed against the legacy cache, not resolved through the mutation queue
    if (!conflict.requestId) throw new Error(`Conflict ${conflictId} has no mutation to resolve; review the legacy staged records instead`);
    const original = await getMutation(db, conflict.requestId);
    const before = { serverRecord: conflict.serverRecord, localRecord: conflict.localRecord };
    if (strategy === "server") {
      await applySyncSuccess(conflict.requestId, { record: conflict.serverRecord, version: conflict.currentVersion, updatedAt: conflict.serverRecord && conflict.serverRecord.updatedAt });
      await resolveStoredConflict(db, conflictId, { resolvedAt: now(), strategy, before, after: conflict.serverRecord });
      return { status: "resolved" };
    }
    if (strategy === "manual" && (!payload || typeof payload !== "object")) throw new Error("Manual conflict resolution requires payload");
    const nextPayload = strategy === "local" ? (original && original.payload) : payload;
    // the successor's key is recomputed from its fields rather than inherited, so a stored key from
    // an older build cannot make its own resolution unresolvable
    const successorInput = {
      entityType: original.entityType, operation: original.operation, machine: original.machine, recordId: original.recordId,
      baseVersion: conflict.currentVersion, payload: nextPayload, actorId: original.actorId,
    };
    const domainKey = requireMutationEnvelope(successorInput);
    // a resolution must target the record it resolves: a manual payload that drops or alters a key
    // field would otherwise queue against a different domain carrying this domain's baseVersion
    if (domainKey !== original.domainKey) throw new Error(`Resolution payload changes the record identity from ${original.domainKey} to ${domainKey}`);
    const resolvedAt = now();
    const successor = {
      ...successorInput,
      requestId: createRequestId(),
      domainKey,
      deviceId: await getDeviceId(db),
      createdAtLocal: resolvedAt,
    };
    const { mutation } = await resolveConflictAndEnqueue(db, {
      conflictId,
      originalRequestId: original.requestId,
      successor,
      resolvedAt,
      strategy,
      before,
      after: nextPayload,
    });
    emit({ type: "mutation", requestId: mutation.requestId, status: mutation.status, domainKey });
    emit({ type: "conflict", requestId: original.requestId, conflictId, status: "resolved" });
    return { status: MUTATION_STATUS.PENDING, requestId: mutation.requestId };
  }

  return {
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    subscribeErrors(listener) { errorSubscribers.add(listener); return () => errorSubscribers.delete(listener); },
    async load(machine) {
      const data = await readServerSnapshot(await openDb(), machine);
      return cachedResult(data) || { data: emptyServerData(machine), source: "empty", fetchedAt: null, stale: true };
    },
    async refresh(machine, { signal } = {}) {
      try {
        const raw = await fetchServerSnapshot(machine, { signal });
        const data = normalizeServerData(raw, machine);
        const fetchedAt = now();
        let stored;
        try {
          stored = await writeServerSnapshot(await openDb(), machine, data, fetchedAt);
        } catch (writeError) {
          // The server data is already in hand. Throwing here would show an empty app to a crew
          // whose payload arrived fine, just because the cache could not be written (quota, private
          // browsing, blocked upgrade). The payload is server-fresh, so `stale` stays false per the
          // documented contract; `cacheError` reports that it could not be persisted.
          const result = { data: { ...data, fetchedAt }, source: "server", fetchedAt, stale: false, cacheError: writeError, serverPayload: raw };
          emit({ type: "data", machine, result });
          return result;
        }
        // `data` is what the app should render: `writeServerSnapshot` re-injects unsynced local
        // records and overlays optimistic payloads onto incoming rows, which is right for display and
        // wrong for any question of the form "is this on the sheet?". `serverPayload` is the GAS
        // response untouched — key-for-key, so a caller can also tell an absent collection from an
        // empty one, which the normalizer collapses. Both branches carry it, so the answer does not
        // depend on whether IndexedDB happened to be writable.
        // `present` describes THIS response and must reach the caller, but it is not part of the
        // cached snapshot: `writeServerSnapshot` rebuilds its return value from `emptyServerData`,
        // so anything not explicitly carried across is dropped here. It was — which closed the
        // cold-launch gate on every healthy device and opened it only when IndexedDB was broken.
        // Both fields were added for Task 7's save gate, and Task 8 deleted that gate: nothing in
        // the app reads either one today. They stay because they answer a question the merged
        // snapshot cannot ("is this on the sheet?", "did the server send this collection at all?"),
        // Task 10's conflict UI is the next caller to need it, and both are pinned by the seam
        // tests — not because a caller is hiding somewhere. Do not read them from the CACHE branch:
        // a stored snapshot says nothing about what the server most recently sent.
        const result = { data: { ...stored, present: data.present }, source: "server", fetchedAt: stored.fetchedAt, stale: false, serverPayload: raw };
        emit({ type: "data", machine, result });
        return result;
      } catch (error) {
        // Reading the cache here is a courtesy — it lets subscribers show the last known data
        // alongside the failure. It must not be able to replace the fault being reported: when the
        // database itself is what cannot be opened, this read throws too, and an unguarded `await`
        // would surface "IndexedDB open timed out" for what was really a network or permission
        // failure, and skip the error events entirely.
        let result = null;
        try { result = cachedResult(await readServerSnapshot(await openDb(), machine)); }
        catch (cacheError) { /* no cache to offer; the original fault is what matters */ }
        const event = { type: "error", machine, error, result };
        emit(event);
        emitError(event);
        throw error;
      }
    },
    mutate,
    resolveConflict,
    // A terminal validation/permanent error stays the head of its domain and shadows every later
    // mutation on that key, so there must be a way to put the work back in flight once the cause is
    // fixed — an oversized field shortened, a repaired sheet row, a realigned time zone.
    // It enqueues a SUCCESSOR with a fresh requestId rather than re-sending the original: GAS stores
    // its response in the idempotency ledger, so re-posting the same requestId would replay the same
    // terminal error forever. Explicitly user-driven; nothing resets a terminal mutation on its own.
    async retryMutation(requestId, { payload } = {}) {
      const db = await openDb();
      const original = await getMutation(db, requestId);
      if (!original) throw new Error(`Unknown mutation ${requestId}`);
      if (![MUTATION_STATUS.VALIDATION_ERROR, MUTATION_STATUS.PERMANENT_ERROR].includes(original.status)) {
        throw new Error(`Mutation ${requestId} is ${original.status}, not a retryable error`);
      }
      const successorInput = {
        entityType: original.entityType, operation: original.operation, machine: original.machine,
        recordId: original.recordId, baseVersion: original.baseVersion,
        payload: payload && typeof payload === "object" ? payload : original.payload, actorId: original.actorId,
      };
      const domainKey = requireMutationEnvelope(successorInput);
      if (domainKey !== original.domainKey) throw new Error(`Retry payload changes the record identity from ${original.domainKey} to ${domainKey}`);
      const retriedAt = now();
      const { mutation } = await retryMutationAsSuccessor(db, {
        originalRequestId: requestId,
        successor: { ...successorInput, requestId: createRequestId(), domainKey, deviceId: await getDeviceId(db), createdAtLocal: retriedAt },
        retriedAt,
      });
      emit({ type: "mutation", requestId: mutation.requestId, status: mutation.status, domainKey });
      return mutation;
    },
    async getMutation(requestId) { return getMutation(await openDb(), requestId); },
    async getEntity(domainKey) { return getEntity(await openDb(), domainKey); },
    async getConflict(conflictId) { return getConflict(await openDb(), conflictId); },
    async getDueMutations(at) { return listDueMutations(await openDb(), at); },
    async claimDueMutations(options) { return claimDueMutations(await openDb(), options); },
    async updateMutation(requestId, update, options) { return updateMutation(await openDb(), requestId, update, options); },
    applySyncSuccess,
    applyConflict,
    async getSyncSummary() { return { online: Boolean(online()), ...(await getSyncCounts(await openDb())) }; },
    async setSyncMetaValue(key, value) { return setSyncMetaValue(await openDb(), key, value); },
  };
}
