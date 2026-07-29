import { MUTATION_STATUS, STORES } from "./schema";

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

function optimisticEntity(mutation) {
  return {
    key: `entity:optimistic:${mutation.domainKey}`,
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
      syncStatus: MUTATION_STATUS.PENDING,
    },
  };
}

export async function putOptimisticMutation(db, input) {
  const transaction = db.transaction([STORES.entities, STORES.mutations, STORES.syncMeta], "readwrite");
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
  const result = await requestResult(transaction.objectStore(STORES.entities).get(`entity:optimistic:${domainKey}`));
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
  return mutations
    .filter(mutation => mutation.status === MUTATION_STATUS.PENDING && (!mutation.nextAttemptAt || Date.parse(mutation.nextAttemptAt) <= now))
    .sort((left, right) => (left.queueSequence || 0) - (right.queueSequence || 0) || String(left.createdAtLocal).localeCompare(String(right.createdAtLocal)));
}

export async function updateMutation(db, requestId, update) {
  const transaction = db.transaction(STORES.mutations, "readwrite");
  const store = transaction.objectStore(STORES.mutations);
  const mutation = await requestResult(store.get(requestId));
  if (!mutation) {
    transaction.abort();
    throw new Error(`Unknown mutation ${requestId}`);
  }
  const next = { ...mutation, ...update };
  store.put(next);
  await complete(transaction);
  return next;
}

export async function confirmMutation(db, requestId, response) {
  const transaction = db.transaction([STORES.entities, STORES.mutations], "readwrite");
  const mutationStore = transaction.objectStore(STORES.mutations);
  const entityStore = transaction.objectStore(STORES.entities);
  const mutation = await requestResult(mutationStore.get(requestId));
  if (!mutation) { transaction.abort(); throw new Error(`Unknown mutation ${requestId}`); }
  const record = response.record || {};
  entityStore.put({
    key: `entity:optimistic:${mutation.domainKey}`,
    entityType: record.entityType || mutation.entityType,
    machine: record.machine || mutation.machine || "GLOBAL",
    domainKey: record.domainKey || mutation.domainKey,
    payload: { ...record, version: response.version ?? record.version, updatedAt: response.updatedAt ?? record.updatedAt, syncStatus: MUTATION_STATUS.SYNCED },
  });
  const next = { ...mutation, status: MUTATION_STATUS.SYNCED, syncedAt: response.updatedAt || null, lastError: null };
  mutationStore.put(next);
  await complete(transaction);
  return next;
}

export async function saveConflict(db, requestId, response) {
  const transaction = db.transaction([STORES.mutations, STORES.conflicts], "readwrite");
  const mutations = transaction.objectStore(STORES.mutations);
  const conflicts = transaction.objectStore(STORES.conflicts);
  const mutation = await requestResult(mutations.get(requestId));
  if (!mutation) { transaction.abort(); throw new Error(`Unknown mutation ${requestId}`); }
  const conflict = {
    conflictId: requestId,
    requestId,
    status: "open",
    domainKey: mutation.domainKey,
    serverRecord: response.serverRecord,
    localRecord: response.localRecord || mutation.payload,
    conflictingFields: response.conflictingFields || [],
    currentVersion: response.currentVersion,
    createdAt: response.createdAt || mutation.createdAtLocal,
  };
  mutations.put({ ...mutation, status: MUTATION_STATUS.CONFLICT, lastError: null });
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
