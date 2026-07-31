import { MUTATION_STATUS, STORES } from "./schema";
import { entityKeyBelongsToDomain, optimisticEntityKey } from "./entityKeys";
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
async function patchSnapshotKeys(transaction, mutation) {
  const field = FIELD_FOR_ENTITY_TYPE.get(mutation.entityType);
  if (!field) return;
  const snapshots = transaction.objectStore(STORES.snapshots);
  const stored = await requestResult(snapshots.getAll());
  // a machine-scoped entity belongs to its own machine's snapshot; everything else comes back from
  // getData for every machine, so every scope has to agree
  const machineScoped = isMachineScopedEntityType(mutation.entityType);
  let scoped = machineScoped ? stored.filter(snapshot => snapshot.machine === mutation.machine) : stored;
  // A machine whose first refresh has not happened — TBM2 on a fresh install — has no snapshot to
  // patch, and without one the optimistic row has nothing to hang off: the ring the crew just
  // recorded is simply gone on the next launch. Start the scope here rather than lose the record.
  // `fetchedAt: null` is the truth about it: nothing has come from the server for this machine yet.
  if (machineScoped && !scoped.length && mutation.machine) {
    scoped = [{ scopeKey: snapshotScopeKey(mutation.machine), machine: mutation.machine, fetchedAt: null, entityKeys: {} }];
  }
  const optimisticKey = optimisticEntityKey(mutation.domainKey);
  scoped.forEach(snapshot => {
    const keys = (snapshot.entityKeys && snapshot.entityKeys[field]) || [];
    let next;
    if (mutation.operation === "delete") {
      next = keys.filter(key => !entityKeyBelongsToDomain(key, mutation.domainKey));
    } else {
      // Create and update are the same operation as far as this list is concerned: put the
      // optimistic copy where the domain's row already sits, or append it if the domain has none.
      // Replacing rather than appending is what stops a create over a row the sheet already holds
      // from reading as two rings, and it is the only way an update becomes visible at all — its
      // optimistic copy lives under a different key from the server row it supersedes.
      // Only the FIRST matching key is replaced: a live sheet legitimately holds two rows sharing a
      // ring identity, and `writeServerSnapshot` overlays at most one of them for the same reason.
      const slot = keys.findIndex(key => entityKeyBelongsToDomain(key, mutation.domainKey));
      if (slot === -1) next = keys.concat(optimisticKey);
      else if (keys[slot] === optimisticKey) next = keys;
      else next = keys.map((key, index) => (index === slot ? optimisticKey : key));
    }
    if (next === keys) return;
    snapshots.put({ ...snapshot, entityKeys: { ...snapshot.entityKeys, [field]: next } });
  });
}

function optimisticEntity(mutation, status = mutation.status) {
  return {
    key: optimisticEntityKey(mutation.domainKey),
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
  const sequence = await requestResult(sequenceStore.get("mutationSequence"));
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
  await patchSnapshotKeys(transaction, mutation);
  await complete(transaction);
  return { mutation, entity };
}

export async function getMutation(db, requestId) {
  const transaction = db.transaction(STORES.mutations, "readonly");
  const result = await requestResult(transaction.objectStore(STORES.mutations).get(requestId));
  await complete(transaction);
  return result || null;
}

export async function getEntity(db, domainKey) {
  const transaction = db.transaction(STORES.entities, "readonly");
  const result = await requestResult(transaction.objectStore(STORES.entities).get(optimisticEntityKey(domainKey)));
  await complete(transaction);
  return result || null;
}

export async function getConflict(db, conflictId) {
  const transaction = db.transaction(STORES.conflicts, "readonly");
  const result = await requestResult(transaction.objectStore(STORES.conflicts).get(conflictId));
  await complete(transaction);
  return result || null;
}

export async function listDueMutations(db, now) {
  const transaction = db.transaction(STORES.mutations, "readonly");
  const mutations = await requestResult(transaction.objectStore(STORES.mutations).getAll());
  await complete(transaction);
  return domainHeads(mutations)
    .filter(mutation => isClaimable(mutation, now))
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0) || String(left.createdAtLocal).localeCompare(String(right.createdAtLocal)));
}

function isTerminal(mutation) {
  return mutation.status === MUTATION_STATUS.SYNCED || mutation.status === MUTATION_STATUS.RESOLVED;
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

export async function confirmMutation(db, requestId, response, { owner } = {}) {
  const transaction = db.transaction([STORES.entities, STORES.mutations], "readwrite");
  const mutationStore = transaction.objectStore(STORES.mutations);
  const entityStore = transaction.objectStore(STORES.entities);
  const [mutation, mutations] = await Promise.all([requestResult(mutationStore.get(requestId)), requestResult(mutationStore.getAll())]);
  if (!mutation) { transaction.abort(); throw new Error(`Unknown mutation ${requestId}`); }
  if (owner && (mutation.status !== MUTATION_STATUS.SYNCING || mutation.syncOwner !== owner)) {
    await complete(transaction);
    return null;
  }
  const next = { ...mutation, status: MUTATION_STATUS.SYNCED, syncedAt: response.updatedAt || null, lastError: null, syncOwner: null, leaseExpiresAt: null };
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
  const confirmedVersion = Number.isInteger(response.version) ? response.version : null;
  if (confirmedVersion !== null) {
    mutations
      .filter(item => item.domainKey === mutation.domainKey && item.requestId !== requestId && !isTerminal(item))
      .forEach(item => {
        const patched = { ...item, baseVersion: confirmedVersion };
        rebased.set(item.requestId, patched);
        mutationStore.put(patched);
      });
  }
  const newestOutstanding = mutations
    .map(item => (item.requestId === requestId ? next : rebased.get(item.requestId) || item))
    .filter(item => item.domainKey === mutation.domainKey && !isTerminal(item))
    .sort((left, right) => (right.queueSequence || 0) - (left.queueSequence || 0))[0];
  if (newestOutstanding) {
    entityStore.put(optimisticEntity(newestOutstanding));
  } else {
    const record = response.record || {};
    entityStore.put({
      key: optimisticEntityKey(mutation.domainKey),
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
  return {
    pending: mutations.filter(item => item.status === MUTATION_STATUS.PENDING).length,
    syncing: mutations.filter(item => item.status === MUTATION_STATUS.SYNCING).length,
    conflicts: conflicts.filter(item => item.status === "open").length,
    errors: mutations.filter(item => item.status === MUTATION_STATUS.VALIDATION_ERROR || item.status === MUTATION_STATUS.PERMANENT_ERROR).length,
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
