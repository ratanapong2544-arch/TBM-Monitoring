import { isTerminalStatus, MUTATION_STATUS, STORES } from "./schema";
import { entityKeyForRecord, isOptimisticKey, optimisticEntityKey } from "./entityKeys";
import { toSyncVersion } from "./syncVersion";
import { FIELD_FOR_ENTITY_TYPE, isMachineScopedEntityType, snapshotScopeKey } from "./snapshotStore";

function complete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// `load` rebuilds each collection from the stored snapshot's key list, so a queued write that only
// touches the entities store is invisible to it: a ring created offline vanished on the next launch
// and a ring deleted offline came back. Patch the list in the SAME transaction as the mutation —
// split across two, a crash in between leaves the queue and the snapshot disagreeing about what the
// crew recorded, which is the one state neither side can detect afterwards.
// Which stored snapshots a mutation touches. A machine-scoped entity belongs to its own machine's
// snapshot; everything else comes back from getData for every machine, so every scope has to agree.
// A machine whose first refresh has not happened — TBM2 on a fresh install — has no snapshot at
// all, and without one the write has nothing to hang off: the ring the crew just recorded is simply
// gone on the next launch, and the version the server confirmed for it is forgotten too. Start the
// scope here rather than lose either. `fetchedAt: null` is the truth about it: nothing has come from
// the server for this machine yet.
function scopesFor(stored, mutation) {
  const machineScoped = isMachineScopedEntityType(mutation.entityType);
  const scoped = machineScoped ? stored.filter(snapshot => snapshot.machine === mutation.machine) : stored;
  if (scoped.length || !machineScoped || !mutation.machine) return scoped;
  return [{ scopeKey: snapshotScopeKey(mutation.machine), machine: mutation.machine, fetchedAt: null, entityKeys: {} }];
}

function patchSnapshotKeys(snapshots, entities, stored, mutation) {
  const field = FIELD_FOR_ENTITY_TYPE.get(mutation.entityType);
  if (!field) return;
  // Keys this patch takes OUT of a list, so their rows can be taken out of the entities store too.
  // `writeServerSnapshot` only deletes what the previous snapshot named, so a key removed here was
  // never deleted afterwards — and an orphan row is not inert: the merge can still find it and put
  // it back on screen as if it were the crew's own queued work.
  const dropped = new Set();
  const survivingKeys = new Map();
  const scoped = scopesFor(stored, mutation);
  const optimisticKey = optimisticEntityKey(mutation.domainKey, mutation.recordId);
  // A mutation is about ONE row, and a row is named by its domain AND its record id — a record id
  // alone is not unique on a live sheet. So "mine" is a single question with a single answer, and
  // both branches below can ask it without any per-operation special case, which is what the last
  // three defects in this function all came from.
  const mine = key => entityKeyForRecord(key, mutation.domainKey, mutation.recordId);
  scoped.forEach(snapshot => {
    const keys = (snapshot.entityKeys && snapshot.entityKeys[field]) || [];
    let next;
    if (mutation.operation === "delete") {
      // Only the named row. A row the sheet returned without an id cannot be matched to a delete
      // that names one, and removing it anyway would take a record off screen that nobody asked to
      // delete — `deletePending` in the snapshot merge makes the same choice, and the two halves of
      // one rule disagreeing is how a row flickers off on refresh and back on relaunch.
      next = keys.filter(key => !mine(key));
    } else {
      // The optimistic copy takes THIS row's place, or joins the list if the row has none yet — a
      // record made offline. It never takes another row's place: the record it would displace is a
      // confirmed one, and the record replacing it is one the server may well refuse.
      const slot = keys.findIndex(key => mine(key) || key === optimisticKey);
      next = slot === -1 ? keys.concat(optimisticKey) : keys.map((key, index) => (index === slot ? optimisticKey : key));
    }
    // a Set, because this runs on every queued write over the whole collection's key list: with 373
    // segments the `includes` it replaced cost ~70k comparisons per ring saved (each key short-
    // circuits at its own index, so n(n+1)/2, not n²), and it grows with the sheet
    const surviving = new Set(next);
    keys.forEach(key => { if (key !== optimisticKey && !surviving.has(key)) dropped.add(key); });
    survivingKeys.set(snapshot.scopeKey, next);
    // an unchanged list is not worth a write, and the second save of one record produces exactly that
    if (next.length === keys.length && next.every((key, index) => key === keys[index])) return;
    snapshots.put({ ...snapshot, entityKeys: { ...snapshot.entityKeys, [field]: next } });
  });
  if (!dropped.size) return;
  // Read the lists AS PATCHED. A server key embeds the machine of the snapshot that produced it, and
  // a project-wide mutation patches every scope, so in practice a dropped key survives in no other
  // list — but a row deleted while something still names it is unrecoverable, and this costs one
  // pass over lists that are already in hand.
  const stillNamed = new Set();
  survivingKeys.forEach(list => list.forEach(key => stillNamed.add(key)));
  dropped.forEach(key => { if (!stillNamed.has(key)) entities.delete(key); });
}

// The stored snapshot carries `syncMeta` as a singleton, and `readServerSnapshot` hands it straight
// back — so writing a confirmed version here is what makes it outlive the tab.
function patchSnapshotSyncMeta(snapshots, stored, mutation, version, deleted) {
  const scoped = scopesFor(stored, mutation);
  scoped.forEach(snapshot => {
    const current = (snapshot.syncMeta && snapshot.syncMeta[mutation.domainKey]) || null;
    // a snapshot fetched after this write already knows a later version; never walk it backwards
    if (current && toSyncVersion(current.version) >= version) return;
    // `deleted` travels with the version because the next create on this key reads it: a tombstone
    // is not inert on the server, and a create that does not claim its version is refused.
    const entry = { ...current, version, deleted };
    snapshots.put({ ...snapshot, syncMeta: { ...snapshot.syncMeta, [mutation.domainKey]: entry } });
  });
}

function optimisticEntity(mutation, status = mutation.status) {
  return {
    key: optimisticEntityKey(mutation.domainKey, mutation.recordId),
    entityType: mutation.entityType,
    machine: mutation.machine || "GLOBAL",
    domainKey: mutation.domainKey,
    payload: {
      ...mutation.payload,
      recordId: mutation.recordId,
      entityType: mutation.entityType,
      machine: mutation.machine,
      domainKey: mutation.domainKey,
      version: mutation.baseVersion,
      syncStatus: status,
    },
  };
}

export async function putOptimisticMutation(db, input) {
  const transaction = db.transaction([STORES.entities, STORES.mutations, STORES.syncMeta, STORES.snapshots], "readwrite");
  const sequenceStore = transaction.objectStore(STORES.syncMeta);
  const snapshotStoreHandle = transaction.objectStore(STORES.snapshots);
  // Both reads are issued together and awaited before anything is written. A transaction stays
  // alive while its own requests are outstanding, so interleaving reads after writes would leave
  // the queue's durability resting on how promptly a microtask happens to run — and a
  // TransactionInactiveError here surfaces to the crew as a save that failed, for a save that had
  // already been composed. All four stores are written below, in one atomic step: split the
  // snapshot patch into a second transaction and a crash between them leaves the queue and the
  // snapshot disagreeing about what was recorded, which is the one state neither side can detect.
  const [sequence, snapshots] = await Promise.all([
    requestResult(sequenceStore.get("mutationSequence")),
    requestResult(snapshotStoreHandle.getAll()),
  ]);
  const mutation = {
    ...input,
    status: MUTATION_STATUS.PENDING,
    attemptCount: input.attemptCount || 0,
    nextAttemptAt: input.nextAttemptAt || null,
    lastError: null,
    queueSequence: (sequence && sequence.value || 0) + 1,
  };
  const entity = optimisticEntity(mutation);
  transaction.objectStore(STORES.entities).put(entity);
  transaction.objectStore(STORES.mutations).put(mutation);
  sequenceStore.put({ key: "mutationSequence", value: mutation.queueSequence });
  patchSnapshotKeys(snapshotStoreHandle, transaction.objectStore(STORES.entities), snapshots, mutation);
  await complete(transaction);
  return { mutation, entity };
}

export async function getMutation(db, requestId) {
  const transaction = db.transaction(STORES.mutations, "readonly");
  const result = await requestResult(transaction.objectStore(STORES.mutations).get(requestId));
  await complete(transaction);
  return result || null;
}

// `recordId` is optional so a caller that only knows the domain still gets an answer. Two records
// can share a domain, and then this returns an ARBITRARY one of them — `getAll` yields IndexedDB key
// order, so it is the highest record id lexicographically, which has no relation to time. Nothing in
// the app takes that form; name the record if which one matters.
export async function getEntity(db, domainKey, recordId) {
  const transaction = db.transaction(STORES.entities, "readonly");
  const store = transaction.objectStore(STORES.entities);
  const result = recordId != null
    ? await requestResult(store.get(optimisticEntityKey(domainKey, recordId)))
    : (await requestResult(store.getAll()))
      .filter(record => record.domainKey === domainKey && isOptimisticKey(record.key))
      .pop();
  await complete(transaction);
  return result || null;
}

export async function getConflict(db, conflictId) {
  const transaction = db.transaction(STORES.conflicts, "readonly");
  const result = await requestResult(transaction.objectStore(STORES.conflicts).get(conflictId));
  await complete(transaction);
  return result || null;
}

// The same selection `claimDueMutations` makes, without claiming it. Nothing in the app reads it —
// the runner claims — so it exists to let a test (and Task 10's Sync Center) ask what the queue would
// post next without changing the queue by asking.
export async function listDueMutations(db, now) {
  const transaction = db.transaction(STORES.mutations, "readonly");
  const mutations = await requestResult(transaction.objectStore(STORES.mutations).getAll());
  await complete(transaction);
  return domainHeads(mutations)
    .filter(mutation => isClaimable(mutation, now))
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0) || String(left.createdAtLocal).localeCompare(String(right.createdAtLocal)));
}

function isTerminal(mutation) {
  return isTerminalStatus(mutation.status);
}

function domainHeads(mutations) {
  const heads = new Map();
  mutations
    .filter(mutation => !isTerminal(mutation))
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0) || String(left.createdAtLocal).localeCompare(String(right.createdAtLocal)))
    .forEach(mutation => {
      if (!heads.has(mutation.domainKey)) heads.set(mutation.domainKey, mutation);
    });
  return [...heads.values()];
}

function isClaimable(mutation, now) {
  if (mutation.status === MUTATION_STATUS.PENDING) return !mutation.nextAttemptAt || Date.parse(mutation.nextAttemptAt) <= now;
  return mutation.status === MUTATION_STATUS.SYNCING && (!mutation.leaseExpiresAt || Date.parse(mutation.leaseExpiresAt) <= now);
}

export async function claimDueMutations(db, { owner, now, leaseMs }) {
  if (!owner) throw new Error("Mutation claim requires owner");
  const transaction = db.transaction(STORES.mutations, "readwrite");
  const store = transaction.objectStore(STORES.mutations);
  const mutations = await requestResult(store.getAll());
  const leaseExpiresAt = new Date(now + leaseMs).toISOString();
  const claimed = domainHeads(mutations)
    .filter(mutation => isClaimable(mutation, now))
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0) || String(left.createdAtLocal).localeCompare(String(right.createdAtLocal)))
    .map(mutation => ({ ...mutation, status: MUTATION_STATUS.SYNCING, syncOwner: owner, leaseExpiresAt }));
  claimed.forEach(mutation => store.put(mutation));
  await complete(transaction);
  return claimed;
}

export async function updateMutation(db, requestId, update, { owner } = {}) {
  const transaction = db.transaction(STORES.mutations, "readwrite");
  const store = transaction.objectStore(STORES.mutations);
  const mutation = await requestResult(store.get(requestId));
  if (!mutation) {
    transaction.abort();
    throw new Error(`Unknown mutation ${requestId}`);
  }
  if (owner && (mutation.status !== MUTATION_STATUS.SYNCING || mutation.syncOwner !== owner)) {
    await complete(transaction);
    return null;
  }
  const nextStatus = update.status || mutation.status;
  const next = { ...mutation, ...update, ...(nextStatus === MUTATION_STATUS.SYNCING ? {} : { syncOwner: null, leaseExpiresAt: null }) };
  store.put(next);
  await complete(transaction);
  return next;
}

export async function confirmMutation(db, requestId, response, { owner, confirmedAtLocal, resolvesToDeleted } = {}) {
  // whether the record is gone afterwards. The caller decides, because a conflict resolved in the
  // server's favour replays this path with the server's record and the operation no longer says.
  const leavesDeleted = mutation => (resolvesToDeleted ? resolvesToDeleted(mutation, response) : mutation.operation === "delete");
  const transaction = db.transaction([STORES.entities, STORES.mutations, STORES.snapshots], "readwrite");
  const mutationStore = transaction.objectStore(STORES.mutations);
  const entityStore = transaction.objectStore(STORES.entities);
  const snapshotStoreHandle = transaction.objectStore(STORES.snapshots);
  const [mutation, mutations, snapshots] = await Promise.all([
    requestResult(mutationStore.get(requestId)),
    requestResult(mutationStore.getAll()),
    requestResult(snapshotStoreHandle.getAll()),
  ]);
  if (!mutation) { transaction.abort(); throw new Error(`Unknown mutation ${requestId}`); }
  if (owner && (mutation.status !== MUTATION_STATUS.SYNCING || mutation.syncOwner !== owner)) {
    await complete(transaction);
    return null;
  }
  // `syncedAt` is the SERVER's clock, which is the right thing to show a crew and the wrong thing to
  // compare against anything local. `confirmedAtLocal` is this device's own reading of when the
  // confirmation landed, and it is what tells a snapshot write whether a response predates it.
  const next = { ...mutation, status: MUTATION_STATUS.SYNCED, syncedAt: response.updatedAt || null, confirmedAtLocal: confirmedAtLocal || null, lastError: null, syncOwner: null, leaseExpiresAt: null };
  mutationStore.put(next);
  // Rebase what is still queued behind this one on the same record. Offline, a whole chain of edits
  // is stamped with the only version the device knows — the one the last full snapshot carried, or 0
  // for a record it created itself — because nothing confirms while there is no link. The first
  // mutation then lands and moves the record on, and every one behind it still claims the old
  // version: the server compares base against current exactly and answers `conflict` for a row
  // nobody else has touched. That conflict becomes the head of its domain and blocks every later
  // edit of the record for good, with no conflict UI until Task 10 to show any of it. The core TBM
  // flow walks straight into it — a ring saved In Progress at excavation and Completed at install —
  // and so does every time bar after the first on an offline shift report.
  //
  // Rebasing on the CONFIRMED version is what makes the chain linear: each queued edit was composed
  // against the local state the previous one produced, not against anything the server has. The
  // confirmed version is also always the freshest the device has seen, since the server hands back
  // the version it just wrote.
  const rebased = new Map();
  const confirmedVersion = response.version == null ? null : toSyncVersion(response.version);
  // does not vary with the item being filtered; read once
  const confirmedLeavesDeleted = leavesDeleted(mutation);
  if (confirmedVersion !== null) {
    mutations
      .filter(item => item.domainKey === mutation.domainKey && item.requestId !== requestId
        // only what is still on its way. A conflicted or refused mutation is not queued behind this
        // one — it is parked, and whatever resolves it composes its own base from the server's copy.
        && (item.status === MUTATION_STATUS.PENDING || item.status === MUTATION_STATUS.SYNCING)
        // and never a create onto a key this write left LIVE. A create claims a version only to lift
        // a tombstone; handing it the version of a record that now exists tells GAS it is a
        // post-conflict successor, and GAS then applies it onto that row and discards its own id —
        // two rings recorded, one row kept, `success` reported. `createBaseVersion` closes exactly
        // that door on the way in, and rebasing indiscriminately reopened it for this device's own
        // second create. A create behind a confirmed DELETE is the opposite case: the key really was
        // vacated, and the version it must claim is the one the delete just wrote.
        // `leavesDeleted`, not the operation: a delete the server refused and the crew resolved by
        // keeping the server's copy leaves the record ALIVE, and rebasing a queued create onto that
        // version would tell GAS it is a post-conflict successor for a row that still exists
        && (item.operation !== "create" || confirmedLeavesDeleted))
      .forEach(item => {
        const patched = { ...item, baseVersion: confirmedVersion };
        rebased.set(item.requestId, patched);
        mutationStore.put(patched);
      });
    // ...and record it where a relaunch will find it. `confirmedVersions` in App is React state, so
    // a backgrounded PWA that gets killed — an eight hour shift on a phone — comes back knowing only
    // what the last full `getData` carried. The next edit of this record would stamp the version
    // from before its own write, the server would answer `conflict` for a row nobody else touched,
    // and that conflict would block the record's domain with nothing on screen to show it.
    patchSnapshotSyncMeta(snapshotStoreHandle, snapshots, mutation, confirmedVersion, confirmedLeavesDeleted);
  }
  // The newest write still queued FOR THIS RECORD. Asking per ring answered with a neighbouring
  // row's mutation whenever two rows shared one — so the row that had just synced kept an optimistic
  // copy describing a different record, badged unsent and carrying a stale version, while the row
  // that actually had one queued was written under this one's key.
  const newestOutstanding = mutations
    .map(item => (item.requestId === requestId ? next : rebased.get(item.requestId) || item))
    .filter(item => item.domainKey === mutation.domainKey && String(item.recordId) === String(mutation.recordId) && !isTerminal(item))
    .sort((left, right) => (right.queueSequence || 0) - (left.queueSequence || 0))[0];
  if (newestOutstanding) {
    entityStore.put(optimisticEntity(newestOutstanding));
  } else if (confirmedLeavesDeleted) {
    // a confirmed delete has no row left to describe. Writing one would leave an entity nothing
    // points at — `patchSnapshotKeys` took its key out of the list when the delete was queued — and
    // the next refresh only deletes the keys the previous snapshot named, so it would simply sit
    // there. `leavesDeleted`, not the operation: a delete the server refused and the crew resolved
    // by keeping the server's copy ends with the row still there, and dropping it here would remove
    // from the screen the very record they chose to keep.
    entityStore.delete(optimisticEntityKey(mutation.domainKey, mutation.recordId));
  } else {
    const record = response.record || {};
    entityStore.put({
      key: optimisticEntityKey(mutation.domainKey, mutation.recordId),
      entityType: record.entityType || mutation.entityType,
      machine: record.machine || mutation.machine || "GLOBAL",
      domainKey: record.domainKey || mutation.domainKey,
      payload: {
        ...record,
        version: response.version ?? record.version,
        updatedAt: response.updatedAt ?? record.updatedAt,
        updatedByDevice: response.updatedByDevice ?? record.updatedByDevice ?? null,
        syncStatus: MUTATION_STATUS.SYNCED,
      },
    });
  }
  await complete(transaction);
  return next;
}

export async function saveConflict(db, requestId, response, { owner } = {}) {
  const transaction = db.transaction([STORES.mutations, STORES.conflicts], "readwrite");
  const mutations = transaction.objectStore(STORES.mutations);
  const conflicts = transaction.objectStore(STORES.conflicts);
  const mutation = await requestResult(mutations.get(requestId));
  if (!mutation) { transaction.abort(); throw new Error(`Unknown mutation ${requestId}`); }
  if (owner && (mutation.status !== MUTATION_STATUS.SYNCING || mutation.syncOwner !== owner)) {
    await complete(transaction);
    return null;
  }
  const conflict = {
    conflictId: requestId,
    requestId,
    status: "open",
    domainKey: mutation.domainKey,
    serverRecord: response.serverRecord,
    localRecord: response.localRecord || mutation.payload,
    conflictingFields: response.conflictingFields || [],
    currentVersion: response.currentVersion,
    // server time and the installation holding that version — design §9 shows both beside the
    // local save time in the field-by-field comparison
    currentUpdatedAt: response.currentUpdatedAt ?? null,
    currentUpdatedByDevice: response.currentUpdatedByDevice ?? null,
    createdAt: mutation.createdAtLocal,
  };
  mutations.put({ ...mutation, status: MUTATION_STATUS.CONFLICT, lastError: null, syncOwner: null, leaseExpiresAt: null });
  conflicts.put(conflict);
  await complete(transaction);
  return conflict;
}

export async function resolveStoredConflict(db, conflictId, update) {
  const transaction = db.transaction(STORES.conflicts, "readwrite");
  const store = transaction.objectStore(STORES.conflicts);
  const conflict = await requestResult(store.get(conflictId));
  if (!conflict) { transaction.abort(); throw new Error(`Unknown conflict ${conflictId}`); }
  const next = { ...conflict, ...update, status: "resolved" };
  store.put(next);
  await complete(transaction);
  return next;
}

export async function resolveConflictAndEnqueue(db, { conflictId, originalRequestId, successor, resolvedAt, strategy, before, after }) {
  const transaction = db.transaction([STORES.entities, STORES.mutations, STORES.conflicts, STORES.syncMeta], "readwrite");
  const entities = transaction.objectStore(STORES.entities);
  const mutations = transaction.objectStore(STORES.mutations);
  const conflicts = transaction.objectStore(STORES.conflicts);
  const sequenceStore = transaction.objectStore(STORES.syncMeta);
  const [conflict, original, sequence] = await Promise.all([
    requestResult(conflicts.get(conflictId)),
    requestResult(mutations.get(originalRequestId)),
    requestResult(sequenceStore.get("mutationSequence")),
  ]);
  if (!conflict || conflict.status !== "open" || !original || original.requestId !== conflict.requestId || original.status !== MUTATION_STATUS.CONFLICT) {
    transaction.abort();
    throw new Error(`Unknown open conflict ${conflictId}`);
  }
  const mutation = {
    ...successor,
    status: MUTATION_STATUS.PENDING,
    attemptCount: 0,
    nextAttemptAt: null,
    lastError: null,
    queueSequence: (sequence && sequence.value || 0) + 1,
  };
  const entity = optimisticEntity(mutation);
  const resolvedOriginal = {
    ...original,
    status: MUTATION_STATUS.RESOLVED,
    resolvedAt,
    strategy,
    resolutionRequestId: mutation.requestId,
    syncOwner: null,
    leaseExpiresAt: null,
  };
  mutations.put(resolvedOriginal);
  mutations.put(mutation);
  entities.put(entity);
  conflicts.put({
    ...conflict,
    status: "resolved",
    resolvedAt,
    strategy,
    before,
    after,
    resolutionRequestId: mutation.requestId,
  });
  sequenceStore.put({ key: "mutationSequence", value: mutation.queueSequence });
  await complete(transaction);
  return { mutation, entity, original: resolvedOriginal };
}

// Replace a terminal error with a fresh attempt in one transaction. A successor rather than a reset
// because GAS stores its response per requestId, so re-posting the original would replay the same
// terminal error; the original is retained as an audit record pointing at its retry.
export async function retryMutationAsSuccessor(db, { originalRequestId, successor, retriedAt }) {
  const transaction = db.transaction([STORES.entities, STORES.mutations, STORES.syncMeta], "readwrite");
  const entities = transaction.objectStore(STORES.entities);
  const mutations = transaction.objectStore(STORES.mutations);
  const sequenceStore = transaction.objectStore(STORES.syncMeta);
  const [original, sequence] = await Promise.all([
    requestResult(mutations.get(originalRequestId)),
    requestResult(sequenceStore.get("mutationSequence")),
  ]);
  const retryable = original && (original.status === MUTATION_STATUS.VALIDATION_ERROR || original.status === MUTATION_STATUS.PERMANENT_ERROR);
  if (!retryable) { transaction.abort(); throw new Error(`Mutation ${originalRequestId} is not a retryable error`); }
  const mutation = {
    ...successor,
    status: MUTATION_STATUS.PENDING,
    attemptCount: 0,
    nextAttemptAt: null,
    lastError: null,
    queueSequence: (sequence && sequence.value || 0) + 1,
  };
  const entity = optimisticEntity(mutation);
  mutations.put({ ...original, status: MUTATION_STATUS.RESOLVED, resolvedAt: retriedAt, strategy: "retry", resolutionRequestId: mutation.requestId, syncOwner: null, leaseExpiresAt: null });
  mutations.put(mutation);
  entities.put(entity);
  sequenceStore.put({ key: "mutationSequence", value: mutation.queueSequence });
  await complete(transaction);
  return { mutation, entity };
}

export async function getSyncCounts(db) {
  const transaction = db.transaction([STORES.mutations, STORES.conflicts, STORES.syncMeta], "readonly");
  const [mutations, conflicts, syncMeta] = await Promise.all([
    requestResult(transaction.objectStore(STORES.mutations).getAll()),
    requestResult(transaction.objectStore(STORES.conflicts).getAll()),
    requestResult(transaction.objectStore(STORES.syncMeta).get("lastSyncedAt")),
  ]);
  await complete(transaction);
  // A record queued behind a stuck one is stuck too. The queue orders per domain and a conflicted or
  // refused mutation is never claimable again, so everything after it on that record is never even
  // posted — it sits on screen marked pending, forever, and counting it as "on its way" is a
  // straight untruth. Until Task 10 can resolve the head, the honest number is how many records
  // cannot move: three rings stranded behind one conflict is three, not one.
  const blockedDomains = new Set(mutations
    .filter(item => item.status === MUTATION_STATUS.CONFLICT || item.status === MUTATION_STATUS.VALIDATION_ERROR || item.status === MUTATION_STATUS.PERMANENT_ERROR)
    .map(item => item.domainKey));
  const isBlocked = item => blockedDomains.has(item.domainKey);
  const pending = mutations.filter(item => item.status === MUTATION_STATUS.PENDING);
  return {
    pending: pending.filter(item => !isBlocked(item)).length,
    // not filtered: a SYNCING mutation cannot share a domain with a stuck one. `claimDueMutations`
    // returns one head per domain and a conflicted or refused head is never claimable again, so
    // nothing behind it can be in flight.
    syncing: mutations.filter(item => item.status === MUTATION_STATUS.SYNCING).length,
    conflicts: conflicts.filter(item => item.status === "open").length,
    errors: mutations.filter(item => item.status === MUTATION_STATUS.VALIDATION_ERROR || item.status === MUTATION_STATUS.PERMANENT_ERROR).length,
    // queued behind a head that will never move, so reported with the stuck ones rather than as work
    // still travelling
    blocked: pending.filter(isBlocked).length,
    lastSyncedAt: syncMeta && syncMeta.value || null,
  };
}

export async function setLastSyncedAt(db, value) {
  const transaction = db.transaction(STORES.syncMeta, "readwrite");
  transaction.objectStore(STORES.syncMeta).put({ key: "lastSyncedAt", value });
  await complete(transaction);
}

export async function setSyncMetaValue(db, key, value) {
  const transaction = db.transaction(STORES.syncMeta, "readwrite");
  transaction.objectStore(STORES.syncMeta).put({ key, value });
  await complete(transaction);
}
