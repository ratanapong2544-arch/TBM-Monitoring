import { MUTATION_STATUS, STORES, hidesRecord, isFinishedStatus, isRetryableErrorStatus, isTerminalStatus, stuckStatuses } from "./schema";
import { entityKeyForRecord, isOptimisticKey, optimisticEntityKey } from "./entityKeys";
import { PHOTOS } from "./displayRecord";
import { toSyncVersion } from "./syncVersion";
import { applyConfigToSnapshot, CONFIG_FIELD_FOR_ENTITY_TYPE, FIELD_FOR_ENTITY_TYPE, isMachineScopedEntityType, snapshotScopeKey } from "./snapshotStore";

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
// A synthesised scope is a NEW object every call, so two writers in one transaction that both
// synthesise get different objects and the second `put` discards the first — the same race the
// mutate-then-put discipline closes for stored ones. Memoised against the `stored` array, which is
// read once per transaction, so both writers see one object.
const synthesisedScopes = new WeakMap();

function synthesiseScope(stored, machine) {
  let byMachine = synthesisedScopes.get(stored);
  if (!byMachine) { byMachine = new Map(); synthesisedScopes.set(stored, byMachine); }
  let scope = byMachine.get(machine);
  if (!scope) {
    scope = { scopeKey: snapshotScopeKey(machine), machine, fetchedAt: null, entityKeys: {} };
    byMachine.set(machine, scope);
  }
  return scope;
}

function scopesFor(stored, mutation) {
  const machineScoped = isMachineScopedEntityType(mutation.entityType);
  const scoped = machineScoped ? stored.filter(snapshot => snapshot.machine === mutation.machine) : stored;
  // The synthesised scope is not only for machine-scoped rows. A project-wide family — issue, daily
  // report, prep task, the instrument families — written on a device that has never completed a
  // getData had NO snapshot to be patched into, so the write reached the queue and no screen: on
  // relaunch the crew sees nothing and enters it again, which is a duplicate row on the sheet. That
  // is exactly the fresh-install-at-the-shaft state App is written to render into.
  // "This machine has no snapshot", not "the device has none". A project-wide family's scope list is
  // every stored snapshot, so on a phone that has been used on TBM1 and never on TBM2 the list is
  // already non-empty and the write filed into TBM1's snapshot alone — leaving it off TBM2's screen,
  // which is the machine the crew is on. `patchSnapshotConfig` ten lines down had this right.
  if (!mutation.machine || scoped.some(snapshot => snapshot.machine === mutation.machine)) return scoped;
  return [...scoped, synthesiseScope(stored, mutation.machine)];
}

// A config is a singleton, not a row: there is no entity key to add to a list, so the value goes
// straight into the snapshot's own field. Without this a config edited offline reached the mutation
// log and nothing else, and the next launch showed the server's old config — or, with no server
// config at all, `DEFAULT_ROUTE_LEGS` standing in for the route the crew had saved (open item 3o).
function patchSnapshotConfig(snapshots, stored, mutation) {
  const recordMachine = String(mutation.domainKey).split(":")[1];
  // A machine whose first refresh has not happened has no snapshot, and a config written to it would
  // land nowhere — `scopesFor` synthesises a scope for a machine-scoped COLLECTION in that state,
  // but the config types are not collections, so they fell through it. The crew can reach the Route
  // page on such a machine (the load-failure banner is additive, every view renders under it), and
  // with no snapshot `routeConfigFor` shows `DEFAULT_ROUTE_LEGS` in place of what they saved.
  const scopes = recordMachine && !stored.some(snapshot => snapshot.machine === recordMachine)
    ? [...stored, synthesiseScope(stored, recordMachine)]
    : stored;
  scopes.forEach(snapshot => {
    const applied = applyConfigToSnapshot(snapshot, mutation.entityType, mutation.payload, recordMachine, snapshot.machine);
    if (applied) snapshots.put(snapshot);
  });
}

function patchSnapshotKeys(snapshots, entities, stored, mutation) {
  if (CONFIG_FIELD_FOR_ENTITY_TYPE.has(mutation.entityType)) return patchSnapshotConfig(snapshots, stored, mutation);
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
    // MUTATED, then put — the same reason `restoreDeletedKey` does. `confirmMutation` can write this
    // one snapshot twice in a single transaction, and an IndexedDB put replaces the whole record, so
    // two writers each spreading their own copy of the object read at the top means the second
    // silently discards the first.
    snapshot.syncMeta = { ...snapshot.syncMeta, [mutation.domainKey]: entry };
    snapshots.put(snapshot);
  });
}

export function optimisticEntity(mutation) {
  return {
    key: optimisticEntityKey(mutation.domainKey, mutation.recordId),
    entityType: mutation.entityType,
    machine: mutation.machine || "GLOBAL",
    domainKey: mutation.domainKey,
    payload: {
      ...mutation.payload,
      recordId: mutation.recordId,
      entityType: mutation.entityType,
      // The ROW's own tag wins, and the envelope's is the fallback. `machine` on an envelope is a
      // scope hint — which snapshot the write belongs in — while `machine` on the payload is the
      // record's own column, and for a project-wide family they are different questions: an issue
      // tagged TBM2 or ทั้งโครงการ is raised from whichever machine is on screen. Stamping the hint
      // over the column erased it, `forMachine` reads a missing machine as TBM1, and an edit made
      // from there wrote TBM1 into the sheet for good. Where a family has no column of its own —
      // segment, grout, shift report — the payload has no `machine` and the hint is what lands.
      machine: (mutation.payload && mutation.payload.machine) ?? mutation.machine,
      domainKey: mutation.domainKey,
      version: mutation.baseVersion,
      syncStatus: mutation.status,
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

// Everything the queue is holding, in one read. `listDueMutations` answers a different question —
// what may be posted NOW — and the recovery export has to carry writes that are not due and never
// will be: a refused one, a conflicted one, a claim whose worker never came back.
// ONE transaction over both stores. `saveConflict` and `resolveConflictAndEnqueue` write the two
// together, so reading them apart can catch a write mid-move: a queued row can appear in the export's
// `pendingMutations` AND its `conflicts` — the double replay the export is written to prevent — or in
// neither, which is a queued write missing from the file that exists so nothing goes missing.
export async function listUnsynced(db) {
  const transaction = db.transaction([STORES.mutations, STORES.conflicts], "readonly");
  const [mutations, conflicts] = await Promise.all([
    requestResult(transaction.objectStore(STORES.mutations).getAll()),
    requestResult(transaction.objectStore(STORES.conflicts).getAll()),
  ]);
  await complete(transaction);
  return { mutations, conflicts: conflicts.filter(row => row.status === "open") };
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

// `domainHeads` asks "is this write still in the way", which a DISCARDED one is not — the crew threw
// it away precisely so the record could move. Asking `isTerminalStatus` left it as the head for
// ever: everything queued behind it was never posted again, while the counts reclassified those
// rows from "ติดค้าง" to "กำลังส่ง" and said nothing.
function isTerminal(mutation) {
  return isFinishedStatus(mutation.status);
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

/**
 * A delete that has stopped hiding its record puts the record's key back.
 *
 * "On its way it hides; stuck it shows" was enforced on the getData path alone. Queuing a delete
 * takes the record's key out of every snapshot list, and `readServerSnapshot` rebuilds each
 * collection from those lists — so once the server REFUSED the delete, the Sync Center said
 * "เซิร์ฟเวอร์ปฏิเสธ" while the data log, both dashboards and the ring count went on hiding the
 * record, across relaunches, until a successful getData. Underground that is the next shift, and it
 * is one record answered two opposite ways on two screens.
 *
 * Every function that can change a mutation's status calls this — `updateMutation` and
 * `saveConflict`, the refusal and the conflict — because a rule with two entrances and one guard is
 * how this branch has lost a fix in every review round.
 */
async function restoreIfNoLongerHiding(transaction, mutation, next) {
  if (mutation.operation !== "delete" || hidesRecord(next)) return false;
  const snapshots = transaction.objectStore(STORES.snapshots);
  // `newestFollower`, not `next`: the row that speaks for the record is the newest write still
  // queued for it, which is how `confirmMutation` and `discardMutation` both decide. A second delete
  // behind this one means the record is still going, and restoring the key would leave the store
  // contradicting both the merge and the confirmation the crew reads.
  const [stored, all] = await Promise.all([
    requestResult(snapshots.getAll()),
    requestResult(transaction.objectStore(STORES.mutations).getAll()),
  ]);
  const standing = newestFollower(all, mutation) || next;
  if (hidesRecord(standing)) return false;
  restoreDeletedKey(snapshots, stored, mutation, optimisticEntityKey(mutation.domainKey, mutation.recordId), standing);
  return true;
}

export async function updateMutation(db, requestId, update, { owner } = {}) {
  // `snapshots` is in scope for one case only — a delete that stops hiding its record, see
  // `restoreIfNoLongerHiding` — but a transaction's stores are fixed when it opens, so it is named
  // here and left unread for every other write. Not `entities`: the restore writes snapshot key
  // lists alone, and naming a store widens the lock on the hottest status-write path for nothing.
  const transaction = db.transaction([STORES.mutations, STORES.snapshots], "readwrite");
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
  // `restoredRecord` rides back to the caller so the repository can say so on the event: the store
  // half of "a refused delete stops hiding its record" was fixed without the screen half, and
  // nothing re-reads on its own — `useOfflineData` hydrates on mount and machine switch only.
  const restored = await restoreIfNoLongerHiding(transaction, mutation, next);
  store.put(next);
  await complete(transaction);
  return restored ? { ...next, restoredRecord: true } : next;
}

export async function confirmMutation(db, requestId, response, { owner, confirmedAtLocal, resolvesToDeleted, strategy, closeConflict } = {}) {
  // whether the record is gone afterwards. The caller decides, because a conflict resolved in the
  // server's favour replays this path with the server's record and the operation no longer says.
  const leavesDeleted = mutation => (resolvesToDeleted ? resolvesToDeleted(mutation, response) : mutation.operation === "delete");
  // `conflicts` only when this confirmation IS a resolution. The two used to be separate
  // transactions, and a kill between them left a SYNCED mutation under an OPEN conflict: the panel
  // offered all three buttons and two of them rejected with `Unknown open conflict`, while ประวัติ
  // listed the same write as superseded. One transaction, so that window does not exist.
  const transaction = db.transaction(
    closeConflict ? [STORES.entities, STORES.mutations, STORES.snapshots, STORES.conflicts] : [STORES.entities, STORES.mutations, STORES.snapshots],
    "readwrite",
  );
  const mutationStore = transaction.objectStore(STORES.mutations);
  const entityStore = transaction.objectStore(STORES.entities);
  const snapshotStoreHandle = transaction.objectStore(STORES.snapshots);
  const conflictStore = closeConflict ? transaction.objectStore(STORES.conflicts) : null;
  const [mutation, mutations, snapshots, storedConflict] = await Promise.all([
    requestResult(mutationStore.get(requestId)),
    requestResult(mutationStore.getAll()),
    requestResult(snapshotStoreHandle.getAll()),
    conflictStore ? requestResult(conflictStore.get(closeConflict.conflictId)) : null,
  ]);
  if (!mutation) { transaction.abort(); throw new Error(`Unknown mutation ${requestId}`); }
  if (owner && (mutation.status !== MUTATION_STATUS.SYNCING || mutation.syncOwner !== owner)) {
    await complete(transaction);
    return null;
  }
  // `syncedAt` is the SERVER's clock, which is the right thing to show a crew and the wrong thing to
  // compare against anything local. `confirmedAtLocal` is this device's own reading of when the
  // confirmation landed, and it is what tells a snapshot write whether a response predates it.
  // `version` is the version the SERVER gave this write. Nothing stored it, so the Sync Center's
  // history could never print the "· เวอร์ชัน N" its own row was written to show.
  // Stamped, not re-derived. `deletePending` in the merge asks the same question and asked it of the
  // OPERATION, so a delete the crew resolved by keeping the server's row — the button that means
  // KEEP THE RING — still read as a delete there, and a getData already in flight dropped the ring
  // from the data log, both dashboards and the ring count until the next successful one.
  // `strategy` rides along rather than following in a second transaction: a kill between the two
  // left a SYNCED mutation with no strategy, which ประวัติ then lists as "ซิงก์สำเร็จ" for a write
  // that never reached the sheet.
  const next = { ...mutation, status: MUTATION_STATUS.SYNCED, ...(strategy ? { strategy } : {}), leavesDeleted: leavesDeleted(mutation), version: response.version ?? null, syncedAt: response.updatedAt || null, confirmedAtLocal: confirmedAtLocal || null, lastError: null, syncOwner: null, leaseExpiresAt: null };
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
    // The same hole round 11 closed in `discardMutation`, in the sibling function that shares this
    // helper: the restore sat in the LAST branch only. So "เก็บของเซิร์ฟเวอร์" on a conflicted
    // delete — the button that means KEEP THE RING — put the row back and left it named by no
    // snapshot whenever anything else was still queued for that record, which is exactly what a
    // retry or a resolution successor is. `patchSnapshotSyncMeta` above is outside the branches and
    // this was not, so the version was remembered for a ring that had vanished from the data log.
    restoreDeletedKey(snapshotStoreHandle, snapshots, mutation, optimisticEntityKey(mutation.domainKey, mutation.recordId), newestOutstanding);
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
        // The confirmed row has to keep saying WHICH row it is. GAS answers a config write with the
        // canonical body alone — no `id`, no `recordId` — and a row without one has no slot, so
        // `confirmedAfterRequest` cannot match it against a refresh still in flight and the older
        // answer overwrites the config the crew just saved.
        recordId: record.recordId ?? record.id ?? mutation.recordId,
        version: response.version ?? record.version,
        updatedAt: response.updatedAt ?? record.updatedAt,
        updatedByDevice: response.updatedByDevice ?? record.updatedByDevice ?? null,
        syncStatus: MUTATION_STATUS.SYNCED,
      },
    });
    // The record is STAYING. If it got here through a delete — the crew pressed "เก็บของเซิร์ฟเวอร์"
    // on a conflicted one, which is the button that means keep the ring — its key came out of every
    // snapshot's list when the delete was queued, and putting the row back without the key leaves it
    // named by nothing: the ring is off the data log, both dashboards and the ring count, with every
    // counter reading zero, until a successful getData.
    restoreDeletedKey(snapshotStoreHandle, snapshots, mutation, optimisticEntityKey(mutation.domainKey, mutation.recordId));
  }
  // read in the opening batch like everything else — this module states the rule three times and
  // `discardMutation` follows it verbatim
  if (storedConflict) conflictStore.put({ ...storedConflict, ...closeConflict.update, status: "resolved" });
  await complete(transaction);
  return next;
}

export async function saveConflict(db, requestId, response, { owner } = {}) {
  // `snapshots` for `restoreIfNoLongerHiding`: a CONFLICTED delete has stopped hiding its record
  // too, and conflict is the commoner refusal of the two.
  const transaction = db.transaction([STORES.mutations, STORES.conflicts, STORES.snapshots], "readwrite");
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
  const next = { ...mutation, status: MUTATION_STATUS.CONFLICT, lastError: null, syncOwner: null, leaseExpiresAt: null };
  const restored = await restoreIfNoLongerHiding(transaction, mutation, next);
  mutations.put(next);
  conflicts.put(conflict);
  await complete(transaction);
  return restored ? { ...conflict, restoredRecord: true } : conflict;
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

// The photo bytes come back from the original unless the incoming payload carries its own. Neither
// editor that produces one can show them — they are megabytes and both are controlled textareas —
// so a payload without them means "I did not touch the photo", never "remove it". Without this a
// corrected retry, or a manual conflict resolution, silently destroyed the picture of the ring.
function carryPhotosFrom(original, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return PHOTOS.reduce((carried, [base64, name]) => {
    if (carried[base64] !== undefined) return carried; // the crew supplied their own
    const bytes = original && original.payload ? original.payload[base64] : undefined;
    if (bytes === undefined) return carried;
    // Only while the row still NAMES the photo. Clearing `imageName` is how a crew removes one from
    // this editor — the base64 key is never shown to them — and GAS needs both keys to upload
    // anything, so bytes with no name would ride the wire for nothing and upload nothing.
    if (!carried[name]) return carried;
    return { ...carried, [base64]: bytes };
  }, { ...payload });
}

export async function resolveConflictAndEnqueue(db, { conflictId, originalRequestId, successor, resolvedAt, strategy, before, after }) {
  const transaction = db.transaction([STORES.entities, STORES.mutations, STORES.conflicts, STORES.syncMeta, STORES.snapshots], "readwrite");
  const entities = transaction.objectStore(STORES.entities);
  const mutations = transaction.objectStore(STORES.mutations);
  const conflicts = transaction.objectStore(STORES.conflicts);
  const sequenceStore = transaction.objectStore(STORES.syncMeta);
  const snapshotStoreHandle = transaction.objectStore(STORES.snapshots);
  const [conflict, original, sequence, snapshots] = await Promise.all([
    requestResult(conflicts.get(conflictId)),
    requestResult(mutations.get(originalRequestId)),
    requestResult(sequenceStore.get("mutationSequence")),
    requestResult(snapshotStoreHandle.getAll()),
  ]);
  if (!conflict || conflict.status !== "open" || !original || original.requestId !== conflict.requestId || original.status !== MUTATION_STATUS.CONFLICT) {
    transaction.abort();
    throw new Error(`Unknown open conflict ${conflictId}`);
  }
  const payload = carryPhotosFrom(original, successor.payload);
  const mutation = {
    ...successor,
    payload,
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
  // The third enqueue path, patching the keys like the first. A successor is a queued write like any
  // other, and for a DELETE that means taking the record's key back out: since the refusal restores
  // it, "เก็บของเครื่องนี้ (ส่งใหม่)" on a conflicted delete otherwise put the ring back on the data
  // log at the moment the crew pressed the button meaning delete it anyway — the merge hid it, the
  // stored snapshot still named it, and the two disagreed until the next successful getData.
  patchSnapshotKeys(snapshotStoreHandle, entities, snapshots, mutation);
  await complete(transaction);
  return { mutation, entity, original: resolvedOriginal };
}

// Replace a terminal error with a fresh attempt in one transaction. A successor rather than a reset
// because GAS stores its response per requestId, so re-posting the original would replay the same
// terminal error; the original is retained as an audit record pointing at its retry.
export async function retryMutationAsSuccessor(db, { originalRequestId, successor, retriedAt }) {
  const transaction = db.transaction([STORES.entities, STORES.mutations, STORES.syncMeta, STORES.snapshots], "readwrite");
  const entities = transaction.objectStore(STORES.entities);
  const mutations = transaction.objectStore(STORES.mutations);
  const sequenceStore = transaction.objectStore(STORES.syncMeta);
  const snapshotStoreHandle = transaction.objectStore(STORES.snapshots);
  const [original, sequence, snapshots] = await Promise.all([
    requestResult(mutations.get(originalRequestId)),
    requestResult(sequenceStore.get("mutationSequence")),
    requestResult(snapshotStoreHandle.getAll()),
  ]);
  const retryable = original && isRetryableErrorStatus(original.status);
  if (!retryable) { transaction.abort(); throw new Error(`Mutation ${originalRequestId} is not a retryable error`); }
  const mutation = {
    ...successor,
    payload: carryPhotosFrom(original, successor.payload),
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
  // like the other two enqueue paths — see `resolveConflictAndEnqueue`
  patchSnapshotKeys(snapshotStoreHandle, entities, snapshots, mutation);
  await complete(transaction);
  return { mutation, entity };
}

// Which records cannot move: the status button's number and the ติดค้าง tab's list are the same
// question asked twice, and each had its own copy of the answer.
function blockedDomainsOf(mutations) {
  return new Set(mutations.filter(item => stuckStatuses.has(item.status)).map(item => item.domainKey));
}

// Rows that are queued but cannot move, and the ones that can. The two surfaces asked this the same
// way and from different sets — the button from PENDING alone, the panel from PENDING or SYNCING —
// so the same row could be counted as travelling by one and filed under ติดค้าง by the other. It is
// unreachable today (`claimDueMutations` claims domain heads only, and a stuck head is never
// claimable again) and it stops being a question at all if there is one function.
export function splitByBlocked(mutations, blockedDomains) {
  const queued = mutations.filter(item => item.status === MUTATION_STATUS.PENDING || item.status === MUTATION_STATUS.SYNCING);
  return {
    moving: queued.filter(item => !blockedDomains.has(item.domainKey)),
    blocked: queued.filter(item => blockedDomains.has(item.domainKey)),
  };
}

// Writes for the same record that a discard of THIS one takes with it. `discardMutation` cascades
// them and the confirmation the crew reads has to name how many — the same question in two places,
// asked once here.
// What a discard of THIS write takes with it. Only a create cascades — its followers can only ever
// post an edit against a row the sheet has never held — and that "only" was spelled in three places:
// the discard itself and both surfaces that have to disclose the count.
export function cascadeOf(mutations, mutation) {
  return mutation.operation === "create" ? followersOf(mutations, mutation) : [];
}

// The write that speaks for the record once THIS one is gone: the newest still queued for it. Both
// the discard itself and the confirmation the crew reads have to agree on which row that is.
export function newestFollower(mutations, mutation) {
  return [...followersOf(mutations, mutation)]
    .sort((left, right) => (right.queueSequence || 0) - (left.queueSequence || 0))[0] || null;
}

export function followersOf(mutations, mutation) {
  return mutations.filter(item => item.requestId !== mutation.requestId
    && item.domainKey === mutation.domainKey
    && String(item.recordId) === String(mutation.recordId)
    && !isFinishedStatus(item.status));
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
  const blockedDomains = blockedDomainsOf(mutations);
  const split = splitByBlocked(mutations, blockedDomains);
  return {
    pending: split.moving.filter(item => item.status === MUTATION_STATUS.PENDING).length,
    // from the same split as the two beside it, so the three numbers partition the queue by
    // construction. A SYNCING mutation cannot share a domain with a stuck one today —
    // `claimDueMutations` returns one head per domain and a stuck head is never claimable again — but
    // counting it outside the split left the one row that could be in both `travellingCount` and
    // `stuckCount`, which are added together on the button.
    syncing: split.moving.filter(item => item.status === MUTATION_STATUS.SYNCING).length,
    conflicts: conflicts.filter(item => item.status === "open").length,
    errors: mutations.filter(item => isRetryableErrorStatus(item.status)).length,
    // queued behind a head that will never move, so reported with the stuck ones rather than as work
    // still travelling
    blocked: split.blocked.length,
    lastSyncedAt: syncMeta && syncMeta.value || null,
  };
}

/**
 * Everything the Sync Center shows, in one read.
 *
 * Four questions the crew can act on, and the grouping IS the answer to each: what is on its way,
 * what cannot move, what the server disagrees with, what has landed. `blocked` is its own group for
 * the reason `getSyncCounts` already gives — a record queued behind a refused head is never posted,
 * so listing it under "on its way" is a lie the crew would act on.
 *
 * Every row carries `requestId`, `entityType`, `machine`, `recordId` and `domainKey`: the plan's
 * Step 4 says never to hide the record identifier in diagnostic detail, and a row the crew cannot
 * name is a row they cannot decide about.
 */
export async function getSyncCenterView(db, { recentLimit = 50 } = {}) {
  const transaction = db.transaction([STORES.mutations, STORES.conflicts], "readonly");
  const [mutations, conflicts] = await Promise.all([
    requestResult(transaction.objectStore(STORES.mutations).getAll()),
    requestResult(transaction.objectStore(STORES.conflicts).getAll()),
  ]);
  await complete(transaction);

  // A phone photo rides inside the envelope at some megabytes — `handleFileUpload` reads the file
  // whole and never resizes it. `displayRecord` exists to keep those bytes out of React state for
  // exactly one reason: a phone that runs out of storage underground stops being able to record
  // anything at all. The Sync Center puts a payload in a controlled textarea that re-serialises it
  // on every keystroke, which is the worst place in the app to hand them to.
  const withoutPhotoBytes = payload => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
    if (!PHOTOS.some(([base64]) => payload[base64])) return payload;
    const clean = { ...payload };
    // OMITTED, not replaced. A marker string is round-trippable: `retryMutation` replaces the
    // payload wholesale, so the marker went to the sheet as the photo while `imageName` survived
    // beside it, and GAS's `invalidSyncImage_` then refused the successor for ever — the record
    // dead-ended with discard as its only exit. Omitting means `retryMutationAsSuccessor` can see
    // that the editor never carried the bytes and re-attach the originals.
    PHOTOS.forEach(([base64]) => { delete clean[base64]; });
    return clean;
  };

  const identity = item => ({
    requestId: item.requestId,
    entityType: item.entityType,
    machine: item.machine || "GLOBAL",
    recordId: item.recordId,
    domainKey: item.domainKey,
  });
  const blockedDomains = blockedDomainsOf(mutations);
  const byQueueOrder = (left, right) => (left.queueSequence || 0) - (right.queueSequence || 0);
  const newestFirst = (left, right) => String(right.confirmedAtLocal || "").localeCompare(String(left.confirmedAtLocal || ""));

  const split = splitByBlocked(mutations, blockedDomains);
  const rowOf = item => ({
    ...identity(item),
    status: item.status,
    operation: item.operation,
    createdAtLocal: item.createdAtLocal,
    // how many other queued writes go with it if this one is discarded — nothing for anything but a
    // create, since only a create's followers cascade
    cascadeCount: cascadeOf(mutations, item).length,
    // Whether discarding this one really puts the record back on screen. The confirmation used to
    // answer from the operation alone and promised "ข้อมูลนี้จะกลับมาแสดงบนหน้าจอ" for every delete
    // — but a second delete standing behind this one means the record is still going, and the store
    // deliberately does not restore it. Answered where the rule lives, with the same predicate.
    restoresRow: item.operation !== "delete" || !hidesRecord(newestFollower(mutations, item)),
    attemptCount: item.attemptCount || 0,
    nextAttemptAt: item.nextAttemptAt || null,
    lastError: item.lastError || null,
  });

  // Every open conflict, listed once. `legacyMigration` files its staged differences in this same
  // store with NO requestId — keyed on that, all of them collapsed onto `undefined` and the tab
  // showed a single blank row while the count said three.
  const openConflicts = conflicts.filter(item => item.status === "open");
  const mutationByRequest = new Map(mutations.map(item => [item.requestId, item]));
  return {
    pending: split.moving.sort(byQueueOrder).map(rowOf),
    blocked: split.blocked.sort(byQueueOrder).map(rowOf),
    // The payload rides along for these and only these: a validation error means the server refused
    // THESE VALUES, so the crew has to see and correct them. Resending them unchanged reproduces the
    // refusal, and the mutation stays the head of its record — so re-entering it through the normal
    // form does not help either; the new write just queues behind the stuck one.
    errors: mutations
      .filter(item => isRetryableErrorStatus(item.status))
      .sort(byQueueOrder)
      .map(item => ({ ...rowOf(item), payload: withoutPhotoBytes(item.payload) })),
    // Both sides, so the crew compares rather than guesses, WITH the three facts design §9 names:
    // when the server's copy was written, by which device, and when this one saved its own. A
    // comparison without them cannot tell "someone else edited this an hour ago" from "I edited it
    // twice". A conflict whose mutation has been pruned still lists — the record is what they are
    // deciding about, not the request.
    conflicts: openConflicts.map(conflict => {
      // the operation decides what discarding does to the row, and the resolver has to say which
      const mutation = conflict.requestId ? mutationByRequest.get(conflict.requestId) : null;
      // A legacy row spells its two sides `local`/`server`; a queued one `localRecord`/`serverRecord`.
      // Reading only the queued names gave the crew two panels of `null` to choose between.
      const localRecord = conflict.localRecord ?? conflict.local ?? (mutation && mutation.payload) ?? null;
      const serverRecord = conflict.serverRecord ?? conflict.server ?? null;
      return {
        conflictId: conflict.conflictId,
        requestId: conflict.requestId || null,
        operation: mutation ? mutation.operation : null,
        cascadeCount: mutation ? cascadeOf(mutations, mutation).length : 0,
        restoresRow: !mutation || mutation.operation !== "delete" || !hidesRecord(newestFollower(mutations, mutation)),
        // No mutation behind it means the write actions do not apply: nothing to resolve through the
        // queue and nothing to discard. A legacy staged difference is reviewed, not resolved.
        // The MUTATION, not the id: the line above contemplates a conflict whose mutation is gone,
        // and offering that row "เลือกว่าจะเก็บอันไหน" gives the crew three buttons that all throw
        // `Unknown mutation` while `reviewLegacyDifference` refuses it too — an unclearable row.
        actionable: Boolean(mutation),
        ...(mutation ? identity(mutation) : {
          entityType: conflict.entityType || String(conflict.domainKey || "").split(":")[0] || null,
          machine: conflict.machine || String(conflict.domainKey || "").split(":")[1] || "GLOBAL",
          recordId: conflict.recordId ?? (localRecord && localRecord.id) ?? String(conflict.domainKey || "").split(":").slice(2).join(":"),
          domainKey: conflict.domainKey,
        }),
        currentVersion: conflict.currentVersion ?? null,
        // Both sides go through the same strip: `SyncCenter` renders them into a <pre> the moment
        // the tab opens, and `ConflictResolver` loads either into a controlled textarea.
        serverRecord: withoutPhotoBytes(serverRecord) || null,
        localRecord: withoutPhotoBytes(localRecord) || null,
        reason: conflict.reason || null,
        // `createdAt` is what `saveConflict` writes and `createdAtLocal` what `legacyMigration` does
        savedAtLocal: conflict.createdAt || conflict.createdAtLocal || null,
        serverUpdatedAt: conflict.currentUpdatedAt || null,
        serverUpdatedByDevice: conflict.currentUpdatedByDevice || null,
      };
    }),
    // "discarded" is its own answer. Neither sent nor waiting — the crew threw it away, and the
    // queue is the only record that they recorded it at all.
    discarded: mutations
      .filter(item => item.status === MUTATION_STATUS.DISCARDED)
      .sort(byQueueOrder)
      .map(item => ({ ...rowOf(item), discardedAt: item.discardedAt || null })),
    // Replaced, not sent. `RESOLVED` marks the mutation a conflict resolution or a retry queued a
    // successor for — the server refused it and never confirmed it. Listing it with the synced ones
    // put one ring on screen twice at once: "กำลังส่ง" for the successor, "ซิงก์สำเร็จ" for this.
    superseded: mutations
      .filter(item => item.status === MUTATION_STATUS.RESOLVED || (item.status === MUTATION_STATUS.SYNCED && item.strategy === "server"))
      .sort(byQueueOrder)
      .map(item => ({ ...rowOf(item), resolvedAt: item.resolvedAt || null, strategy: item.strategy || null })),
    // `strategy: "server"` means the crew chose the server's row and their own values were dropped:
    // `applySyncSuccess` marks the mutation SYNCED, but nothing this device wrote reached the sheet,
    // so it belongs with the replaced ones rather than borrowing the word that means it went.
    recent: mutations
      .filter(item => item.status === MUTATION_STATUS.SYNCED && item.strategy !== "server")
      .sort(newestFirst)
      .slice(0, recentLimit)
      .map(item => ({ ...rowOf(item), confirmedAtLocal: item.confirmedAtLocal || null, version: item.version ?? null })),
  };
}

/**
 * Drop a write nothing can move, at the crew's word.
 *
 * Only a STUCK mutation: a conflicted, refused or invalid one is never claimable again, so leaving
 * it is leaving a permanent number in the status strip. A pending write is still going to be sent,
 * and discarding one would take a record off the sheet's future with no trace on this device — so
 * it is refused here rather than guarded only in the UI.
 *
 * The mutation is kept, marked, not deleted. The queue is the only record that the crew ever
 * recorded this at all, and "discarded" is a different fact from "sent" — a row that vanished would
 * read as neither, and a row marked synced would read as the wrong one.
 */
/**
 * Put a deleted record's key back into the snapshots that named it.
 *
 * Queuing a delete takes the key OUT of every snapshot's list and drops the cached server row,
 * because the row is meant to be going. Every path that decides the record is STAYING has to undo
 * that — discarding the delete, and choosing the server's row for a conflicted one — or
 * `readServerSnapshot`, which rebuilds each collection from those lists alone, leaves the ring
 * missing from the data log, both dashboards and the ring count until a successful getData, which
 * underground is the next shift. One function because it was two before, and the second one was
 * written a review round after the first.
 */
function restoreDeletedKey(snapshots, stored, mutation, optimisticKey, standingRow) {
  if (!snapshots || mutation.operation !== "delete") return;
  // `standingRow` is the write whose values the entity row now holds — the newest one still queued
  // for that record. If IT is hiding the record, naming the key again would put a row back on the
  // data log that the crew has asked twice to remove. `hidesRecord`, the same predicate the merge
  // uses, so "on its way hides, stuck shows" cannot mean two things in two files. The module's rule
  // everywhere else is that the newest write speaks for the row; this is that rule, decided in the
  // one place that knows whether the key comes back rather than spelled at each call site.
  if (hidesRecord(standingRow)) return;
  const field = FIELD_FOR_ENTITY_TYPE.get(mutation.entityType);
  if (!field) return;
  // `scopesFor`, not every stored snapshot: a machine-scoped ring belongs to its own machine's list
  // and putting it in the other one shows TBM1's ring on TBM2's data log.
  scopesFor(stored, mutation).forEach(snapshot => {
    const keys = (snapshot.entityKeys && snapshot.entityKeys[field]) || [];
    // Already named: adding it again renders the ring twice. Reachable — `deletePending` does not
    // hide a delete that is stuck, so any refresh while it sits conflicted puts the key back, and
    // the crew is online by definition to have received that conflict. Asked about the RECORD, the
    // way `patchSnapshotKeys` asks it: after such a refresh the list holds the SERVER key for this
    // record, not the optimistic one, and comparing only the optimistic key added a second name for
    // one ring — the duplicate row this whole feature exists to prevent.
    if (keys.some(key => entityKeyForRecord(key, mutation.domainKey, mutation.recordId))) return;
    // MUTATED, then put. `confirmMutation` writes this same snapshot twice in one transaction —
    // `patchSnapshotSyncMeta` first, this second — and an IndexedDB `put` replaces the whole record.
    // The two are safe together only because BOTH mutate the object read at the top of the
    // transaction; a spread here is equivalent today for that reason alone, and stops being so the
    // moment either one reads its own copy. The failure it guards against is real and was seen: the
    // next edit of that ring stamped `baseVersion: 0` against a server that had moved on, and the
    // conflict that came back parked at the head of the ring's domain.
    snapshot.entityKeys = { ...snapshot.entityKeys, [field]: [...keys, optimisticKey] };
    snapshots.put(snapshot);
  });
}

export async function discardMutation(db, requestId, { discardedAt } = {}) {
  const transaction = db.transaction([STORES.mutations, STORES.entities, STORES.conflicts, STORES.snapshots], "readwrite");
  const mutations = transaction.objectStore(STORES.mutations);
  const snapshots = transaction.objectStore(STORES.snapshots);
  const [mutation, allMutations, stored] = await Promise.all([
    requestResult(mutations.get(requestId)),
    requestResult(mutations.getAll()),
    requestResult(snapshots.getAll()),
  ]);
  if (!mutation) { transaction.abort(); throw new Error(`Unknown mutation ${requestId}`); }
  if (!stuckStatuses.has(mutation.status)) { transaction.abort(); throw new Error(`Mutation ${requestId} ยังไม่ติดค้าง — ทิ้งได้เฉพาะรายการที่ส่งไม่ได้แล้ว`); }
  const followers = followersOf(allMutations, mutation);
  // Throwing away the CREATE takes its followers with it. They can only ever post an edit against a
  // row the sheet has never held — refused when they get there, and called "รอส่งขึ้นเซิร์ฟเวอร์"
  // until then. Refusing the discard instead left the record with no exit at all: the follower is
  // PENDING, so it cannot be discarded either and the panel offers it no button, and both rows sat
  // in the count for the life of the install.
  const cascaded = cascadeOf(allMutations, mutation);
  const entities = transaction.objectStore(STORES.entities);
  const conflicts = transaction.objectStore(STORES.conflicts);
  const optimisticKey = optimisticEntityKey(mutation.domainKey, mutation.recordId);

  // Second read batch, still BEFORE the first write. What to read depends on what the first batch
  // said, so it cannot be one `Promise.all` — but reading after a write is what this module's rule
  // is about: an `await` there can hand the transaction back to the event loop between the writes
  // that have to land together, and a `TransactionInactiveError` reaches the crew as a discard that
  // failed on the one write they pressed to get a record unstuck.
  const closing = [requestId, ...cascaded.map(item => item.requestId)];
  const [kept, openConflicts] = await Promise.all([
    requestResult(entities.get(optimisticKey)),
    Promise.all(closing.map(id => requestResult(conflicts.get(id)))),
  ]);

  mutations.put({ ...mutation, status: MUTATION_STATUS.DISCARDED, discardedAt: discardedAt || null, syncOwner: null, leaseExpiresAt: null, nextAttemptAt: null });

  // The optimistic key is per RECORD, not per request, and deleting it unconditionally lost rows
  // that had nothing to do with this write:
  //   - another mutation still queued for the same ring rendered from it, and its row vanished;
  //   - and for an UPDATE, `patchSnapshotKeys` has already replaced the cached SERVER key with this
  //     one, so it is the device's only copy of a ring the sheet holds. Discarding a refused
  //     correction took the whole ring off the data log for the rest of the shift, and the
  //     predictable response — re-enter it — is the duplicate row Tasks 7-9 exist to stop.
  // So: hand the row to whatever is still queued for that record; failing that, keep the values the
  // write was about, unless it was a CREATE, which is the one case where no server row exists.
  cascaded.forEach(item => mutations.put({
    ...item, status: MUTATION_STATUS.DISCARDED, discardedAt: discardedAt || null,
    syncOwner: null, leaseExpiresAt: null, nextAttemptAt: null,
  }));
  const survivor = newestFollower(followers.filter(item => !cascaded.includes(item)), { requestId: null, domainKey: mutation.domainKey, recordId: mutation.recordId });
  if (survivor) {
    entities.put(optimisticEntity(survivor));
  } else if (mutation.operation === "create") {
    entities.delete(optimisticKey);
  } else if (kept) {
    // The row stays so the ring does not vanish, but it has to say what it now IS. `preserveLocal`
    // reads the STORED row's `syncStatus`, not the mutation, so a kept row still stamped "pending"
    // made every later refresh replace the sheet's row with the values the crew threw away — for
    // ever, badged as still on its way, and a correction another crew made later never arrived.
    entities.put({ ...kept, payload: { ...kept.payload, syncStatus: MUTATION_STATUS.DISCARDED } });
  }
  // Outside the branches, because the record is staying in BOTH of them and the key has to come
  // back either way. It sat in the last branch only, so a discarded delete that still had a write
  // queued behind it — which is what "เก็บของเครื่องนี้" then a refused delete produces — put the
  // row back and left it named by no snapshot: gone from the data log, both dashboards and the ring
  // count, across relaunches, while the confirmation the crew had just read said the opposite.
  // `restoreDeletedKey` no-ops for anything but a delete and for a key already named.
  if (survivor || kept) restoreDeletedKey(snapshots, stored, mutation, optimisticKey, survivor);
  // every request this discard covers, not only the one the crew tapped: a cascaded follower can
  // hold its own open conflict, and leaving it open is a row whose buttons can then only throw
  openConflicts.forEach(conflict => {
    if (conflict && conflict.status === "open") conflicts.put({ ...conflict, status: "resolved", resolvedAt: discardedAt || null, strategy: "discard" });
  });
  await complete(transaction);
  return mutation;
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
