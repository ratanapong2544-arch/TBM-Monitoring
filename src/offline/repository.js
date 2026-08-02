import { fetchServerSnapshot as defaultFetchServerSnapshot } from "./apiTransport";
import { openOfflineDb as defaultOpenDb } from "./db";
import { getOrCreateDeviceId as defaultGetDeviceId } from "./device";
import { reconcileLegacyStage as defaultReconcileLegacy } from "./legacyMigration";
import { MACHINE_ENTITY_TYPES, makeDomainKey } from "./domainKey";
import { claimDueMutations, confirmMutation, discardMutation as discardStoredMutation, getConflict, getEntity, getMutation, getSyncCenterView, getSyncCounts, listDueMutations, putOptimisticMutation, resolveConflictAndEnqueue, resolveStoredConflict, retryMutationAsSuccessor, saveConflict, setLastSyncedAt, setSyncMetaValue, updateMutation } from "./mutationStore";
import { MUTATION_STATUS, stuckStatuses } from "./schema";
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
  // `OfflineProvider` stages the legacy caches at boot; reconciling them needs a server payload to
  // compare against, and this is the first place one exists. Once per repository — the pass is
  // idempotent, but re-running it every refresh would re-read every staged family for nothing.
  const reconcileLegacy = deps.reconcileLegacy || defaultReconcileLegacy;
  let legacyReconciled = false;
  const wallClock = deps.now || (() => new Date().toISOString());
  // Monotonic, because two of this module's rules are ORDERINGS between a request going out and a
  // write being confirmed, and both stamps come from here. A device clock can step backwards — an
  // NTP correction on a phone waking after an eight-hour shift is the ordinary case — and a
  // confirmation stamped before the request that preceded it makes a refresh discard rows it should
  // have kept, or keep a ring the crew deleted. Never going backwards costs a millisecond of drift
  // and removes the whole class.
  let lastStamp = 0;
  const now = () => {
    const parsed = Date.parse(wallClock());
    lastStamp = Number.isNaN(parsed) ? lastStamp + 1 : Math.max(parsed, lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  // What the last COMPLETED refresh for a machine was asked at. A slower earlier request must not
  // overwrite the cache a later one already wrote: `useOfflineData` drops the stale answer from
  // React state, but the snapshot write happens underneath it, so a relaunch in between showed the
  // older sheet — with rows another device added in the meantime missing.
  const lastCompletedRequest = new Map();
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
    // the same list `makeDomainKey` keys by, imported rather than repeated: a type added there and
    // not here would queue a machineless envelope that only GAS could refuse. (Not the same set as
    // `MACHINE_SCOPED_COLLECTIONS` in `snapshotStore.js`, which is about which collections getData
    // returns per machine.)
    if (MACHINE_ENTITY_TYPES.has(input.entityType) && !input.machine) throw new Error("Mutation requires machine");
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

  // Whether the record is GONE afterwards. Normally that is the operation the crew performed, but a
  // conflict resolved in the server's favour replays this path with the SERVER's record, and then it
  // is the server that decides: a delete the server refused, resolved by keeping the server's copy,
  // must leave a live row and a live key. Reading it from the operation instead marked the key as a
  // tombstone at that version — so the next record for the ring claimed it, and GAS read a create
  // whose base matches as a post-conflict successor and applied it onto the row the crew had just
  // chosen to keep.
  function makeResolvesToDeleted(options) {
    return (mutation, response) => {
      // resolved by taking the server's copy: the server's record is the outcome, and a record it
      // returned without a `deleted` marker is one that still exists
      if (options && options.fromServerRecord) return Boolean(response.record && response.record.deleted);
      return mutation.operation === "delete";
    };
  }

  async function applySyncSuccess(requestId, response, options) {
    const resolvesToDeleted = makeResolvesToDeleted(options);
    const mutation = await confirmMutation(await openDb(), requestId, response, { ...options, confirmedAtLocal: now(), resolvesToDeleted });
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
      // `deleted` rides with the version because the NEXT create on this key reads it. A tombstone
      // is not inert on the server — a create that does not claim its version is refused — and a
      // create built from a version WITHOUT the flag claims 0 and is refused. Dropping it here left
      // exactly one window open: from a delete confirming until the next full getData, which since
      // Task 8 removed the last refresh caller is normally the rest of the session.
      deleted: resolvesToDeleted(mutation, response),
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
      // `fromServerRecord`: what the crew chose IS the server's row, so whether the record ends up
      // deleted is the server's answer and not the operation they originally attempted
      await applySyncSuccess(
        conflict.requestId,
        { record: conflict.serverRecord, version: conflict.currentVersion, updatedAt: conflict.serverRecord && conflict.serverRecord.updatedAt },
        { fromServerRecord: true },
      );
      await resolveStoredConflict(db, conflictId, { resolvedAt: now(), strategy, before, after: conflict.serverRecord });
      // stamped so the history can say the crew's values were dropped in favour of the server's,
      // rather than listing it beside the writes that actually reached the sheet
      await updateMutation(db, conflict.requestId, { strategy });
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
    // Task 10's Sync Center surfaces these; nothing subscribes today, like `retryMutation` and
    // `resolveConflict` beside it.
    subscribeErrors(listener) { errorSubscribers.add(listener); return () => errorSubscribers.delete(listener); },
    async load(machine) {
      const data = await readServerSnapshot(await openDb(), machine);
      return cachedResult(data) || { data: emptyServerData(machine), source: "empty", fetchedAt: null, stale: true };
    },
    async refresh(machine, { signal } = {}) {
      try {
        // stamped BEFORE the request goes out: the queue drains in parallel with it, so anything
        // confirmed after this instant is newer than the answer that comes back, and the snapshot
        // write has to know which is which or it discards the crew's own confirmed rings
        const requestedAt = now();
        const raw = await fetchServerSnapshot(machine, { signal });
        const data = normalizeServerData(raw, machine);
        const fetchedAt = now();
        // `data`, not `stored`: `writeServerSnapshot` re-injects this device's unsynced records into
        // what it returns, so reconciling against that would let a queued local record confirm
        // itself as already on the sheet — the exact record reconciliation exists to protect. Its
        // failure is never the crew's problem: the payload is already in hand.
        // Latched only by a pass that found something: `OfflineProvider` stages at boot and
        // `useOfflineData` refreshes from its own effect, neither waiting for the other, so a
        // refresh can win the race and see an empty stage — and latching there would spend the
        // upgrade launch, the one that matters, on a database with nothing in it yet.
        if (!legacyReconciled) {
          try {
            const outcome = await reconcileLegacy(await openDb(), data);
            // Latched only by a COMPLETE pass. A response carries one machine's scalar configs, so a
            // TBM1-first session that latched on its own pass left the staged TBM2 plan compared
            // against nothing and never revisited — the family it skipped is the reason to ask
            // again. A deployment that never carries a family keeps the pass cheap and repeating,
            // which is two getAlls on small stores and the correct end.
            legacyReconciled = Boolean(outcome && outcome.reconciled && !outcome.pending);
          } catch (error) { /* best-effort, like staging */ }
        }
        // A later request may already have finished while this one was still out — a quick machine
        // switch back and forth is enough. Its answer is the newer description of the sheet, and
        // writing this one over it would put the older one in the cache, where a relaunch would find
        // it. So the cache keeps what the newer request wrote, and this call returns that same
        // newer snapshot rather than the payload it happens to be holding: two callers describing
        // one machine differently is worse than one of them being a moment behind.
        const previousRequest = lastCompletedRequest.get(machine);
        // no `|| 0` sentinel: `Date.parse(0)` is `Date.parse("0")`, which is the year 2000, so on a
        // phone whose clock has not been set yet EVERY first refresh would look overtaken
        const overtaken = Boolean(previousRequest) && Date.parse(previousRequest) > Date.parse(requestedAt);
        let stored;
        try {
          // The `||` is belt and braces, and unreachable as written: `lastCompletedRequest` is only
          // recorded once a write has actually landed, so an overtaking request that failed on quota
          // never claims to have overtaken anything. It stays because the alternative — handing the
          // caller a null it then reads `fetchedAt` off — turns a good server response into
          // "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" and leaves the device with no cache at all.
          stored = (overtaken && await readServerSnapshot(await openDb(), machine))
            || await writeServerSnapshot(await openDb(), machine, data, fetchedAt, requestedAt);
          // recorded only once the cache actually holds this answer, so a request that failed to
          // write does not make a later, slower one defer to a snapshot that was never produced
          if (!overtaken) lastCompletedRequest.set(machine, requestedAt);
        } catch (writeError) {
          // The server data is already in hand. Throwing here would show an empty app to a crew
          // whose payload arrived fine, just because the cache could not be written (quota, private
          // browsing, blocked upgrade). The payload is server-fresh, so `stale` stays false per the
          // documented contract; `cacheError` reports that it could not be persisted.
          const result = { data: { ...data, fetchedAt }, source: "server", fetchedAt, stale: false, cacheError: writeError };
          emit({ type: "data", machine, result });
          return result;
        }
        // `data` is what the app should render: `writeServerSnapshot` re-injects unsynced local
        // records and overlays optimistic payloads onto incoming rows.
        // `present` describes THIS response — which collections it actually carried, since the
        // normalizer maps an absent key to `[]` and so collapses "the server has none" into "this
        // response omitted them". It is not part of the cached snapshot: `writeServerSnapshot`
        // rebuilds its return value from `emptyServerData`, so anything not explicitly carried
        // across is dropped here. It was once, and that closed Task 7's cold-launch gate on every
        // healthy device while opening it only when IndexedDB was broken.
        // That gate is gone — Task 8 deleted it — and `serverPayload`, which existed only for it,
        // went with it: Step 4 says remove it once nothing reads it, and nothing does. `present`
        // stays under the same step's other instruction, because Task 9 reconciles the legacy
        // caches and an absent collection is not an empty one there either. Never read it from the
        // CACHE branch: a stored snapshot says nothing about what the server most recently sent.
        const result = { data: { ...stored, present: data.present }, source: "server", fetchedAt: stored.fetchedAt, stale: false };
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
      if (!stuckStatuses.has(original.status) || original.status === MUTATION_STATUS.CONFLICT) {
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
    async getEntity(domainKey, recordId) { return getEntity(await openDb(), domainKey, recordId); },
    async getConflict(conflictId) { return getConflict(await openDb(), conflictId); },
    async getDueMutations(at) { return listDueMutations(await openDb(), at); },
    async claimDueMutations(options) { return claimDueMutations(await openDb(), options); },
    // Announced like the others. This is the only path to `validation_error` and `permanent_error`,
    // and the summary is recomputed on repository events — so without an event, a write that had
    // just died terminally went on being counted as pending, and the status strip went on reporting
    // it as still on its way. Every malformed response, oversized field and GAS permission page
    // arrives here; conflicts were the only stuck writes the crew could see.
    async updateMutation(requestId, update, options) {
      const mutation = await updateMutation(await openDb(), requestId, update, options);
      if (mutation) emit({ type: "mutation", requestId, status: mutation.status, domainKey: mutation.domainKey });
      return mutation;
    },
    applySyncSuccess,
    applyConflict,
    async getSyncSummary() { return { online: Boolean(online()), ...(await getSyncCounts(await openDb())) }; },
    async getSyncCenter(options) { return getSyncCenterView(await openDb(), options); },
    // A staged legacy difference is not a queued write: there is no mutation to resolve and nothing
    // to discard, so nothing could ever clear it and the status strip counted it for ever on every
    // upgraded phone. Reviewing is the action it actually has — the crew has compared the two and
    // carried anything that mattered into the record by hand.
    async reviewLegacyDifference(conflictId) {
      const db = await openDb();
      const conflict = await getConflict(db, conflictId);
      if (!conflict || conflict.status !== "open") throw new Error(`Unknown open conflict ${conflictId}`);
      if (conflict.requestId) throw new Error(`Conflict ${conflictId} เป็นรายการที่รอส่ง — ต้องเลือกว่าจะเก็บของใคร`);
      await resolveStoredConflict(db, conflictId, { resolvedAt: now(), strategy: "reviewed", before: { serverRecord: conflict.server, localRecord: conflict.local }, after: null });
      emit({ type: "conflict", conflictId, status: "resolved" });
      return { status: "resolved" };
    },
    async discardMutation(requestId) {
      const mutation = await discardStoredMutation(await openDb(), requestId, { discardedAt: now() });
      emit({ type: "mutation", requestId, status: MUTATION_STATUS.DISCARDED, domainKey: mutation.domainKey });
      return mutation;
    },
    async setSyncMetaValue(key, value) { return setSyncMetaValue(await openDb(), key, value); },
  };
}
