import React, { useState, useMemo, useEffect, useRef } from "react";
import { FileText, CloudUpload, Save, Edit, Trash2, Plus, Users, Activity, Clock, Download, Loader2, Printer, X } from "lucide-react";
import { formatDisplayDate, formatDisplayTime } from "../../utils/formatters";
import { getLogicalShiftDate, getRingNumeric, loadHtml2Canvas } from "../../utils/helpers";
import { apiCall } from "../../utils/api";
import { fitAndPrint } from "../../utils/printFit";

// Key order is not part of a record's identity: the cached copy and the server copy can serialize
// the same data differently, and a plain JSON.stringify would read that as a competing edit.
const stableKey = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

// Save bookkeeping lives OUTSIDE the component, because a save outlives the form that started it:
// any nav tap unmounts this view while the request is still travelling. Per-instance state let the
// remounted form mint a second id for a report the sheet already has — two rows for one shift, which
// double-counts it and its delay minutes, and which only the first row ever receives updates for.
// Keyed per report (machine|date|shift), so a different report is a different entry.
const shiftSaveState = new Map();
const shiftSaveStateFor = (key) => {
  let state = shiftSaveState.get(key);
  if (!state) { state = { draftId: null, savedIds: new Set(), chain: Promise.resolve() }; shiftSaveState.set(key, state); }
  return state;
};
// module state persists across tests in one file, which would make them order-dependent
export const __resetShiftSaveStateForTests = () => { shiftSaveState.clear(); };

// `apiCall` has no deadline of its own, and the failure it needs one for is the same one the
// snapshot fetch is bounded against: a captive portal or a quiet tunnel link completes the handshake
// and then never answers. Without a deadline that request never settles, so the save button stays
// disabled reading "Saving…", every later auto-save queues behind it and is silently swallowed, and
// because the bookkeeping deliberately outlives the mount, navigating away and back does not clear
// it — only a page reload does, which throws away everything the crew has typed.
// 45 s, and the reasoning matters because a false positive here is expensive: the request is not
// cancelled (apiCall has no abort path), so giving up early on a request that later lands leaves the
// report in the "outcome unknown" state below until the server answers again. The write itself is
// small — a shift report is kilobytes, not the 463 KB snapshot — but it queues behind
// `LockService` (10 s of tryLock in GAS) on top of an Apps Script cold start, so a healthy save can
// legitimately take tens of seconds on the same slow link the 90 s snapshot ceiling is sized for.
// Like that one, this number is reasoned rather than measured; Task 12's matrix should time it.
export const SHIFT_SAVE_TIMEOUT_MS = 45000;
const withDeadline = (promise) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("SHIFT_SAVE_TIMEOUT")), SHIFT_SAVE_TIMEOUT_MS);
  promise.then(
    value => { clearTimeout(timer); resolve(value); },
    error => { clearTimeout(timer); reject(error); }
  );
});

const ShiftReportView = ({ projectInfo, segmentRecords, shiftReports, setShiftReports, machine = "TBM1", isCurrentMachine, onRefresh, snapshotReady = true, readOnly = false }) => {
  // WHICH reports are being saved, not merely "a save is running": a save stalled on the 30th used
  // to leave the button disabled for the 31st too, for as long as the deadline lasts. A single slot
  // was not enough either — starting B cleared the indication for A while A was still travelling.
  const [savingKeys, setSavingKeys] = useState(() => new Set());
  const markSaving = (key, saving) => setSavingKeys(prev => {
    if (saving === prev.has(key)) return prev;
    const next = new Set(prev);
    if (saving) next.add(key); else next.delete(key);
    return next;
  });
  const [isExportingImage, setIsExportingImage] = useState(false);

  const defaultManpower = { Engineer: '', Operator: '', Surveyor: '', Machanic: '', Electrician: '', Foreman: '', Worker: '', CraneOp: '' };
  const defaultResult = { startSta: '', finishSta: '', numberRing: '', totalDistance: '', progressRate: '' };

  const [meta, setMeta] = useState({ date: projectInfo.date || new Date().toISOString().split('T')[0], tbmNo: projectInfo.tbmNo || 'TBM1', location: projectInfo.location || 'อุโมงค์จากบ่อ IS4 ถึง บ่อ IS2', shift: projectInfo.shift || 'Day' });
  const [events, setEvents] = useState({});
  const [activeModal, setActiveModal] = useState(null);
  const [manpower, setManpower] = useState(defaultManpower);
  const [result, setResult] = useState(defaultResult);
  // result fields the crew typed into, or already saved: the auto-derived values must not overwrite
  // these. A ref, not state — the auto-fill effect runs in the same commit as a form load, so a
  // state update would not be visible to it yet and the seeded flags would arrive one render late.
  const touchedRef = useRef({});
  const [editingEventId, setEditingEventId] = useState(null);

  const existingReport = useMemo(() => {
    return shiftReports.find(r => formatDisplayDate(r.date) === meta.date && String(r.shift) === String(meta.shift));
  }, [shiftReports, meta.date, meta.shift]);

  const deduplicatedSegments = useMemo(() => {
    const map = new Map();
    segmentRecords.forEach(rec => map.set(rec.ringNo, rec));
    return Array.from(map.values());
  }, [segmentRecords]);

  const autoResult = useMemo(() => {
    const shiftSegs = deduplicatedSegments.filter(r => {
      const instStart = formatDisplayTime(r.installStartTime || r.startTime);
      let inShift = r.installShift;
      if (!inShift && instStart) {
        const [h] = instStart.split(':').map(Number);
        inShift = (h >= 7 && h < 19) ? "Day" : "Night";
      } else if (!inShift) {
        inShift = r.shift;
      }

      const logicalDate = getLogicalShiftDate(instStart, inShift, r.date, r.shift);

      return logicalDate === meta.date &&
        (inShift === meta.shift || (!r.installShift && r.shift === meta.shift)) &&
        r.status !== "In Progress" &&
        r.installType !== "Temporary";
    });
    if (shiftSegs.length > 0) {
      const sorted = [...shiftSegs].sort((a, b) => getRingNumeric(a.ringNo) - getRingNumeric(b.ringNo));
      const startSta = sorted[0].startCH;
      const finishSta = sorted[sorted.length - 1].finishCH;
      const numRings = sorted.length;
      const totalDist = sorted.reduce((sum, r) => sum + parseFloat(r.length || 0), 0).toFixed(2);
      return { startSta: startSta || '', finishSta: finishSta || '', numberRing: numRings.toString(), totalDistance: totalDist, progressRate: totalDist };
    }
    return defaultResult;
  }, [deduplicatedSegments, meta.date, meta.shift]);

  // location and tbmNo are in the payload, so this rewrite also means the form no longer holds what
  // an in-flight save sent
  useEffect(() => {
    setMeta({ date: projectInfo.date, tbmNo: projectInfo.tbmNo, location: projectInfo.location, shift: projectInfo.shift });
    formSerialRef.current += 1;
  }, [projectInfo.date, projectInfo.shift, projectInfo.tbmNo, projectInfo.location]);

  // Load the form ONLY when the report being edited changes — its id, or the date/shift that
  // selects it. `existingReport` and `autoResult` are derived from segmentRecords/shiftReports, and
  // App re-mirrors those with a new array identity on every snapshot (the offline cache pass, then
  // the server pass, then each machine switch). Depending on them reset the form mid-edit and
  // silently wiped typed manpower and result values, or reverted unsaved corrections to the last
  // saved copy — and manpower/result have no auto-save to recover from, unlike events.
  // Which report the crew asked for (their own choice) versus which row currently matches it (which
  // a landing snapshot can change underneath them). Loading on the second is what destroyed typed
  // reports: a device with no cached copy starts on a blank form, the server answers mid-typing,
  // and the arriving row replaced everything.
  const selectorKey = `${machine}|${meta.date}|${meta.shift}`;
  // keyed on CONTENT, not just the row id: the cache pass and the server pass can carry the same id
  // with different content, and keying on the id alone left the stale copy on screen and wrote it
  // back on the next save
  const reportKey = existingReport ? stableKey([existingReport.id, existingReport.location, existingReport.manpower, existingReport.result, existingReport.events]) : null;
  // which report is on screen right now, so a save that resolves later can tell whether the form it
  // started from is still the one being edited
  const selectorKeyRef = useRef(selectorKey);
  selectorKeyRef.current = selectorKey;
  // The block lives in module scope so it survives a nav tap, and module state cannot trigger a
  // render on its own — this does.
  const [, bumpUnresolved] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  // Captured per save in `prepareSave`, never read at execution time: this prop describes the
  // machine currently selected, and a queued save belongs to whichever machine it was started on.
  // Reading it late discarded a time bar belonging to the other machine's report.
  const snapshotReadyRef = useRef(snapshotReady);
  snapshotReadyRef.current = snapshotReady;
  const autoResultRef = useRef(autoResult);
  autoResultRef.current = autoResult;
  const existingReportRef = useRef(existingReport);
  existingReportRef.current = existingReport;
  const dirtyRef = useRef(false);
  // Counts every change to what the form DISPLAYS, whether the crew made it or the ring records did.
  // The dirty flag is about the crew's own edits; this is about whether the form still holds what an
  // in-flight save sent. A ring recorded mid-save rewrites the derived Result without any typing, so
  // counting only typed edits would let a save claim its own row and make the view skip loading it —
  // screen and sheet then disagree on a report that gets printed. (There used to be a separate edit
  // serial as well; every one of its bumps also bumped this one, so it decided nothing.)
  const formSerialRef = useRef(0);
  // counts form loads, so a save can tell whether the form was reloaded from the stored copy while
  // its request was in flight — after which the form no longer holds what that save sent
  const loadGenerationRef = useRef(0);
  const markDirty = () => { dirtyRef.current = true; formSerialRef.current += 1; };
  // the key of the row this view last wrote, so its own save is never announced as a server copy
  const ownWriteKeyRef = useRef(null);
  // App answers this, because a save can resolve after this view unmounts (any nav tap) and a local
  // ref would be frozen at the machine selected then. The local fallback is for standalone renders.
  const machineRef = useRef(machine);
  machineRef.current = machine;
  const stillOnMachine = (m) => (isCurrentMachine ? isCurrentMachine(m) : machineRef.current === m);
  const [serverCopyPending, setServerCopyPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const loadForm = React.useCallback(() => {
    const report = existingReportRef.current;
    if (report) {
      setEvents(report.events || {});
      // merge over the defaults: a row carrying a partial (or empty) manpower object would
      // otherwise render only the roles it happens to contain, with no way to fill the rest
      setManpower({ ...defaultManpower, ...(report.manpower || {}) });
      const savedRes = report.result || {};
      // the figure derived from the rings recorded this shift wins over a stored one, so a report
      // always reflects what was actually excavated (confirmed as the intended behaviour)
      setResult({ startSta: autoResultRef.current.startSta || savedRes.startSta || '', finishSta: autoResultRef.current.finishSta || savedRes.finishSta || '', numberRing: autoResultRef.current.numberRing || savedRes.numberRing || '', totalDistance: autoResultRef.current.totalDistance || savedRes.totalDistance || '', progressRate: autoResultRef.current.progressRate || savedRes.progressRate || '' });
      if (report.location) setMeta((prev) => (prev.location === report.location ? prev : { ...prev, location: report.location }));
    } else {
      setEvents({});
      setManpower(defaultManpower);
      setResult(autoResultRef.current);
    }
    // A typed Result value is protected from the auto-derived figure only until the form reloads.
    // Reloading includes the row coming back from the crew's own save, so a correction typed and
    // then auto-saved (any time-bar edit) is re-derived on the next pass. That follows from the
    // confirmed rule — the Result reflects the rings actually recorded — and is why a correction
    // has to be made against the ring records, not typed over the total.
    touchedRef.current = {};
    dirtyRef.current = false;
    loadGenerationRef.current += 1;
    // the key of the last row written is no longer the one to compare arrivals against. The draft id
    // and the set of ids already on the sheet are NOT cleared here: they are keyed per report, so a
    // different report already reads a different entry, and wiping them would let a save queued for
    // the old report append a second row for one the sheet already has.
    ownWriteKeyRef.current = null;
    setServerCopyPending(false);
    setConfirmDiscard(false);
    setCheckFailed(false); // a different report; the last check's failure says nothing about it
    // eslint-disable-next-line
  }, []);

  // the crew picked a different date/shift, or switched machine — load that machine's report.
  // ShiftReportView has no other machine reset, so without `machine` here a report typed for one
  // machine stayed on screen and was saved into the other machine's sheet.
  useEffect(() => { loadForm(); }, [selectorKey, loadForm]);

  // a snapshot changed the stored copy of the report for the current date/shift. Only take it over a
  // form the crew has not started filling in; otherwise keep what they typed and tell them.
  useEffect(() => {
    // The row this view just wrote is the crew's own, even if they kept typing during the request.
    // Clear any notice still up from an earlier arrival: that save has just overwritten the copy it
    // was pointing at, so leaving the warning on screen offers a row that no longer exists.
    if (reportKey && reportKey === ownWriteKeyRef.current) { setServerCopyPending(false); return; }
    if (!dirtyRef.current) loadForm();
    // a row that DISAPPEARED from the snapshot is not a competing copy — offering to "load" it
    // would just wipe the form. Clear any notice raised by an earlier arrival for the same reason:
    // its "load the server copy" action would now have nothing behind it.
    else setServerCopyPending(Boolean(existingReportRef.current));
    // eslint-disable-next-line
  }, [reportKey]);

  // Keep the auto-derived result fields current as rings are recorded during the shift, but never
  // overwrite a field the crew typed into or already saved.
  useEffect(() => {
    let rewritten = false;
    setResult((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(autoResult).forEach((key) => {
        if (touchedRef.current[key]) return;
        if (autoResult[key] && autoResult[key] !== prev[key]) { next[key] = autoResult[key]; changed = true; }
      });
      rewritten = changed;
      return changed ? next : prev;
    });
    // This rewrites the form without the crew touching it, so it counts as the form no longer
    // holding what an in-flight save sent — see formSerialRef. The bump is here rather than inside
    // the updater because StrictMode double-invokes updaters, and a counter incremented there
    // advances differently in development and production.
    if (rewritten) formSerialRef.current += 1;
  }, [autoResult]);

  const handleMetaChange = (e) => {
    markDirty();
    setMeta({ ...meta, [e.target.name]: e.target.value });
  };

  // One id per report being composed. Both save paths mint their own before `existingReport` turns
  // truthy, so Save to Cloud overlapping a time-bar auto-save used to create two rows for the same
  // date and shift — after which only the first was ever updated and the dashboards double-counted.
  const reportIdForSave = () => {
    if (existingReportRef.current) return existingReportRef.current.id;
    const state = shiftSaveStateFor(selectorKey);
    if (!state.draftId) state.draftId = `shift_${Date.now()}`;
    return state.draftId;
  };

  // Sharing the id was not enough on its own: `addShiftReport` appends to the sheet without checking
  // the id, and two saves in flight together both saw a falsy `existingReport` and both sent `add` —
  // two rows for the same date and shift. Every later update hits only the first (the sheet scan
  // stops at the first match), so the second stays frozen with a partial event set and the shift and
  // its delay minutes are counted twice on the next refresh. Saves therefore run one at a time.
  // One chain PER REPORT, not one for everything. A single chain meant a save stalled on the 30th
  // held back the 31st, and both machines with it — one dead request blocking records it has nothing
  // to do with. Ordering only ever mattered within one report anyway: that is where append-versus-
  // update is decided.
  // Releasing this block by INFERENCE has now been wrong three rounds running — a prop identity, a
  // mount-scoped counter, and a completion timestamp were each a different fact from the one needed.
  // The question is causal: was the sheet read after our request reached it? Only one fetch in the
  // app has a knowable answer — one the crew issues from here, after we gave up waiting. Every
  // ambient snapshot may have read the sheet long before, so an absent row in it proves nothing.
  // Both notices call this. Only one can be ON SCREEN at a time — the cold-launch banner renders
  // behind `!saveUnresolved`, which is the block itself — but that says nothing about what happens
  // ACROSS the await: a save already travelling can give up while this fetch is in the air, arming
  // the block after the press. This fetch was issued before that give-up, so it cannot speak to it,
  // and clearing the block would let the next time bar append a second row for the shift. Hence the
  // capture below: release only a block that was already armed when the question was asked.
  const checkWithServer = async () => {
    if (!onRefresh) return;
    const key = selectorKey;
    const state = shiftSaveStateFor(key);
    // WHICH block, not merely whether one existed. Two checks can be in flight at once — press, nav
    // tap (which remounts and re-enables the button), press again — and a boolean lets the older one
    // release a block armed after it asked. The epoch only ever increases, so it cannot be recycled.
    const blockEpochAtCheck = state.blocked ? (state.blockSerial || 0) : null;
    const dateAtCheck = meta.date;
    const shiftAtCheck = meta.shift;
    setChecking(true);
    setCheckFailed(false);
    try {
      const fresh = await onRefresh();
      // still unreachable; the block stands. Say so on the notice itself — a button that looks
      // unchanged reads as broken, and the crew's next move would be a reload, which drops the
      // block along with everything they have typed since.
      if (!fresh || !fresh.serverPayload) { setCheckFailed(true); return; }
      // The SERVER's own answer, not the snapshot the app renders: that one re-injects unsynced
      // local records and overlays optimistic payloads, so a row could be our own echo of the very
      // write we are asking about.
      const payload = fresh.serverPayload;
      // An absent collection is not an empty one. The normalizer maps a missing key to [], so an
      // older GAS deployment or a partial doGet would otherwise read as "the row never landed" and
      // release the block — the same ambiguity App refuses to act on when mirroring collections.
      if (!Object.prototype.hasOwnProperty.call(payload, "shiftReports")) { setCheckFailed(true); return; }
      // Ask the question that matters — "does this shift have a row?" — rather than matching an id
      // this device chose. An update-path block may have no draft id at all.
      const rows = Array.isArray(payload.shiftReports) ? payload.shiftReports : [];
      const landed = rows.find(r => formatDisplayDate(r.date) === dateAtCheck && String(r.shift) === String(shiftAtCheck));
      if (landed && landed.id) state.savedIds.add(landed.id);
      if (blockEpochAtCheck !== null && state.blocked && (state.blockSerial || 0) === blockEpochAtCheck) state.blocked = false;
      bumpUnresolved(n => n + 1);
    } catch (error) {
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  };

  const queueSave = (key, run) => {
    const state = shiftSaveStateFor(key);
    const next = state.chain.then(run, run);
    state.chain = next.then(() => {}, () => {});
    return next;
  };

  // A save resolves seconds after it starts. If the crew switched machine meanwhile, writing the
  // result back would put one machine's crew counts and surveyed chainage into the other's state —
  // the async door into the contamination the machine reset closes on the synchronous side.
  const commitSaved = (machineAtSave, payloadId, savedRecord) => {
    if (!stillOnMachine(machineAtSave)) return false;
    setShiftReports(prev => (prev.some(r => r.id === payloadId)
      ? prev.map(r => (r.id === payloadId ? savedRecord : r))
      : [...prev, savedRecord]));
    return true;
  };

  // Everything about WHICH row this save is and WHAT it carries is decided here, when the crew acts —
  // never when the queued request finally starts. Deciding the id later was worse than the duplicate
  // it was meant to prevent: a queued save whose payload held the 30th could pick up the id minted
  // for the 31st after the crew changed the date, and overwrite the wrong day's report with it.
  // Only one thing is read at execution time, and it cannot be known earlier: whether this exact id
  // has reached the sheet yet, which is what decides append versus update.
  // `eventsForSave` lets the auto-save send the event set it just produced, which is not in state yet
  const prepareSave = (eventsForSave) => {
    const formAtSave = formSerialRef.current;
    const loadAtSave = loadGenerationRef.current;
    const machineAtSave = machine;
    const keyAtSave = selectorKey;
    const snapshotReadyAtSave = snapshotReadyRef.current;
    const id = reportIdForSave();
    const existedAtSave = Boolean(existingReportRef.current && existingReportRef.current.id === id);
    const payload = { id, date: meta.date, shift: meta.shift, tbmNo: meta.tbmNo, location: meta.location, events: JSON.stringify(eventsForSave), manpower: JSON.stringify(manpower), result: JSON.stringify(result) };
    const savedRecord = { ...payload, events: eventsForSave, manpower, result };
    const ownKey = stableKey([savedRecord.id, savedRecord.location, savedRecord.manpower, savedRecord.result, savedRecord.events]);

    return async () => {
      const state = shiftSaveStateFor(keyAtSave);
      // A timed-out request was NOT cancelled — `apiCall` has no abort path, so it is still
      // travelling and may yet append the row. Sending again before that is resolved would append a
      // SECOND row for the same date and shift, which is the defect the whole queue exists to
      // prevent, and the auto-save path would do it on the crew's behalf with nothing on screen.
      // Cleared only by an explicit check against the server (see checkWithServer).
      if (state.blocked) throw new Error("SHIFT_SAVE_UNRESOLVED");
      // No snapshot for this machine yet. This needs no server fault at all and is the wider hazard:
      // a cold launch (fresh install, cleared storage, private mode, blocked IndexedDB) renders an
      // editable BLANK form for as long as the snapshot takes — up to the 90 s fetch ceiling — so a
      // crew filling in a shift that already has a row would append a second one. `existingReport`
      // cannot be trusted until this machine's rows have arrived.
      //
      // Only APPENDS are gated, and only on what was true when the crew acted. An update carries an
      // id already known to be on the sheet, so it cannot duplicate anything — refusing it would
      // just discard a recorded time bar. And reading this at execution time broke the rule stated
      // above: a machine switch while a save was queued flipped it to false and threw away a bar
      // belonging to the OTHER machine's report, which the switch had already cleared from the form.
      //
      // "Ready" means a SERVER answer this session, not merely rows on screen. A cached snapshot can
      // be hours old — yesterday's cache does not contain the report the other crew filed at 19:00,
      // so `existingReport` is null and an append would duplicate it. Requiring the server costs
      // nothing offline, where `apiCall` rejects immediately anyway. Online it is usually the seconds
      // between launch and the snapshot landing — but on a link where the 463 KB snapshot times out
      // while this kilobyte write would land, a report that does not yet exist cannot be created
      // until a fetch succeeds. The notice's button is the only retry. Updates are never gated.
      const willAppend = !existedAtSave && !state.savedIds.has(id);
      if (willAppend && !snapshotReadyAtSave) throw new Error("SHIFT_SAVE_NO_SNAPSHOT");
      try {
        await withDeadline(apiCall(willAppend ? "addShiftReport" : "updateShiftReport", { ...payload, machine: machineAtSave }));
      } catch (error) {
        // Deliberately a counter, not a timestamp: nothing compares times any more (that comparison
        // was wrong in three separate rounds), but a block needs an IDENTITY. Two checks can be in
        // flight at once — a press, a nav tap that remounts and re-enables the button, a second
        // press — and a boolean cannot tell an older check that the block it is about to release is
        // a different one, armed after it asked.
        if (error.message === "SHIFT_SAVE_TIMEOUT") {
          state.blocked = true;
          state.blockSerial = (state.blockSerial || 0) + 1;
          bumpUnresolved(n => n + 1);
        }
        throw error;
      }
      state.savedIds.add(id);
      // Only speak for the form if it is still showing this report AND still holding what was sent.
      // Both conditions matter. The crew may have moved to another date, shift or machine, where
      // clearing the dirty flag would invite the next snapshot to load over what they typed there.
      // Or the form may have reloaded — leaving this report and coming back is enough — in which
      // case it now shows the stored copy WITHOUT this write. Claiming the own-write key then made
      // the effect below skip loading the row this save produced, so the next save rebuilt its
      // payload from the stale form and erased the event that had just been recorded.
      const formStillHoldsThisWrite = selectorKeyRef.current === keyAtSave
        && loadGenerationRef.current === loadAtSave
        && formSerialRef.current === formAtSave;
      if (formStillHoldsThisWrite) {
        // The row that comes back carries this write, so the effect watching for a server copy
        // recognises it by key and leaves the form alone. Anything typed or reloaded since the
        // payload was frozen is NOT in the sheet, so the form has to stay dirty and take the arriving
        // row instead — at worst that shows the crew their own write as a "server copy", which is
        // cheap next to silently dropping a recorded time bar.
        dirtyRef.current = false;
        ownWriteKeyRef.current = ownKey;
      }
      return commitSaved(machineAtSave, id, savedRecord);
    };
  };

  const isSaving = savingKeys.has(selectorKey);
  // Derived from the module-scope map, not from component state: the block belongs to the report and
  // outlives this mount, so a notice held in state showed nothing after a nav tap while writes were
  // still being refused, and cleared on a different report's successful save.
  const reportSaveState = shiftSaveState.get(selectorKey) || {};
  const saveUnresolved = Boolean(reportSaveState.blocked);
  // The gate is against CREATING a second report for a shift that already has one, so it applies
  // only when this save would append. Disabling the button whenever a snapshot is missing gated
  // updates too, which is the opposite of the rule the save path states: on a marginal link the
  // 463 KB snapshot can time out while a kilobyte write would land, and a crew correcting manpower
  // — the one field group with no auto-save — would have found Save dead and lost it on the next
  // nav tap.
  const wouldAppend = !existingReport
    && !(reportSaveState.draftId && reportSaveState.savedIds && reportSaveState.savedIds.has(reportSaveState.draftId));
  const appendBlocked = wouldAppend && !snapshotReady;

  const handleSaveToCloud = () => {
    const keyAtSave = selectorKey;
    markSaving(keyAtSave, true);
    const machineAtSave = machine;
    const send = prepareSave(events);
    return queueSave(keyAtSave, async () => {
      try {
        if (await send()) alert("บันทึก Shift Report สำเร็จ");
        // a save that landed after a machine switch reached the sheet, but its row was deliberately
        // not written into the other machine's state — say so rather than saying nothing
        else if (!stillOnMachine(machineAtSave)) alert("บันทึกแล้ว (สลับเครื่องระหว่างบันทึก — ข้อมูลอยู่ในกะของเครื่องเดิม)");
      } catch (e) {
        // A timed-out request may still be travelling, so its outcome is genuinely unknown: saving
        // again could append a second row for the shift, because the legacy write is not idempotent
        // (Task 8's queue is what makes a retry safe).
        alert(e.message === "SHIFT_SAVE_NO_SNAPSHOT" ? "ยังไม่ได้ข้อมูลรายงานกะของเครื่องนี้จากเซิร์ฟเวอร์ — รอสักครู่ก่อนบันทึก มิฉะนั้นอาจสร้างรายงานซ้ำกับที่มีอยู่แล้ว"
          : e.message === "SHIFT_SAVE_TIMEOUT" ? "หมดเวลารอเซิร์ฟเวอร์ — ไม่ทราบว่าบันทึกสำเร็จหรือไม่ กรุณาตรวจสอบรายงานกะนี้ก่อนบันทึกซ้ำ"
          : e.message === "SHIFT_SAVE_UNRESOLVED" ? "ยังไม่ทราบผลการบันทึกครั้งก่อน — กดปุ่ม “ตรวจสอบกับเซิร์ฟเวอร์” ในแถบเตือนด้านบนก่อน จึงจะบันทึกต่อได้"
          : "บันทึกไม่สำเร็จ: " + e.message);
      }
      markSaving(keyAtSave, false);
    });
  };

  const triggerAutoSaveEvents = (updatedEvents) => {
    const keyAtSave = selectorKey;
    const send = prepareSave(updatedEvents);
    return queueSave(keyAtSave, async () => {
      try { await send(); }
      catch (e) {
        // This path had nothing on screen at all, which is how a timed-out auto-save could leave the
        // crew adding time bars that were never stored — and, before the guard above, re-appending
        // the report. A time bar is data the crew has already recorded; it may not fail in silence.
        console.error("Auto-save failed", e);
      }
    });
  };

  const displayEvents = useMemo(() => {
    const merged = { ...events };

    // Check all segments to find matching logical dates, not just those matching meta.date tightly
    const dateSegs = deduplicatedSegments.filter(r => {
      const exDate = getLogicalShiftDate(formatDisplayTime(r.excavStartTime), r.excavShift || r.shift, r.date, r.shift);
      const inDate = getLogicalShiftDate(formatDisplayTime(r.installStartTime || r.startTime), r.installShift || r.shift, r.date, r.shift);
      return exDate === meta.date || inDate === meta.date;
    });
    const autoExcav = [];
    const autoInst = [];

    dateSegs.forEach(rec => {
      const extStart = formatDisplayTime(rec.excavStartTime);
      const extEnd = formatDisplayTime(rec.excavEndTime);
      let exShift = rec.excavShift;
      if (!exShift && extStart) {
        const [h] = extStart.split(':').map(Number);
        exShift = (h >= 7 && h < 19) ? "Day" : "Night";
      } else if (!exShift) {
        exShift = rec.shift;
      }
      const excavLogicalDate = getLogicalShiftDate(extStart, exShift, rec.date, rec.shift);

      const instStart = formatDisplayTime(rec.installStartTime || rec.startTime);
      const instEnd = formatDisplayTime(rec.installEndTime || rec.endTime);
      let inShift = rec.installShift;
      if (!inShift && instStart) {
        const [h] = instStart.split(':').map(Number);
        inShift = (h >= 7 && h < 19) ? "Day" : "Night";
      } else if (!inShift) {
        inShift = rec.shift;
      }
      const installLogicalDate = getLogicalShiftDate(instStart, inShift, rec.date, rec.shift);

      if ((exShift === meta.shift || meta.shift === "All") && excavLogicalDate === meta.date) {
        if (extStart && extEnd) autoExcav.push({ id: `auto_ex_${rec.id}`, start: extStart, end: extEnd, label: String(rec.ringNo), isAuto: true });
      }

      if ((inShift === meta.shift || meta.shift === "All") && installLogicalDate === meta.date) {
        if (instStart && instEnd) autoInst.push({ id: `auto_in_${rec.id}`, start: instStart, end: instEnd, label: String(rec.ringNo), isAuto: true });
      }
    });

    merged['Excavation'] = [...(merged['Excavation'] || []), ...autoExcav];
    merged['Segment Erection'] = [...(merged['Segment Erection'] || []), ...autoInst];
    return merged;
  }, [events, deduplicatedSegments, meta.date, meta.shift]);

  const hoursDay = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const hoursNight = [19, 20, 21, 22, 23, 24, 1, 2, 3, 4, 5, 6];
  const currentHours = meta.shift === 'Day' ? hoursDay : hoursNight;

  const activityCategories = [
    { group: 'Main Activities', items: ['Excavation', 'Segment Erection', 'Locomotive / Rail System', 'Survey', 'Other 1', 'Other 2'] },
    { group: 'Delay Activities', items: ['Power Supply', 'TBM Equipment', 'Clean Area', 'Muck Full', 'Other 3'] },
    { group: 'TBM Service / Maintenance', items: ['Cleaning Belt conveyor', 'Service / Maintenance', 'Other 4'] }
  ];

  const getMinutesFromShiftStart = (timeStr, shift) => {
    if (!timeStr) return 0;
    let [h, m] = timeStr.split(':').map(Number);
    let shiftStartH = shift === 'Day' ? 7 : 19;
    if (shift === 'Day') { if (h < 7) h += 24; } else { if (h < 19) h += 24; }
    return (h * 60 + m) - (shiftStartH * 60);
  };

  const calculateBarStyles = (start, end, shift) => {
    let startMins = getMinutesFromShiftStart(start, shift);
    let endMins = getMinutesFromShiftStart(end, shift);
    startMins = Math.max(0, Math.min(startMins, 720));
    endMins = Math.max(0, Math.min(endMins, 720));
    if (endMins < startMins) endMins = startMins;
    let left = (startMins / 720) * 100;
    let width = ((endMins - startMins) / 720) * 100;
    return { left: `${left}%`, width: `${width}%`, duration: endMins - startMins };
  };

  const getTotalMinutes = (activityName) => {
    if (!Array.isArray(displayEvents[activityName])) return 0;
    return displayEvents[activityName].reduce((total, ev) => {
      if (!ev || !ev.start || !ev.end) return total;
      const { duration } = calculateBarStyles(ev.start, ev.end, meta.shift);
      return total + duration;
    }, 0);
  };

  const getBarColorClasses = (groupIndex) => {
    switch (groupIndex) {
      case 0: return 'bg-stripe-blue border-navy text-navy';
      case 1: return 'bg-stripe-red border-code-d text-code-d';
      case 2: return 'bg-stripe-green border-sgreen-med text-sgreen-dark';
      default: return 'bg-surface-alt border-line text-ink';
    }
  };

  const handleManpowerChange = (e) => {
    markDirty();
    setManpower({ ...manpower, [e.target.name]: e.target.value });
  };
  const handleResultChange = (e) => {
    // remember the crew edited this field so the auto-derived value never overwrites it again
    markDirty();
    touchedRef.current = { ...touchedRef.current, [e.target.name]: true };
    setResult({ ...result, [e.target.name]: e.target.value });
  };
  const handlePrint = () => fitAndPrint(document.getElementById("shift-report-container"), { orientation: "portrait", onePage: true });

  const handleDownloadImage = async () => {
    const element = document.getElementById("shift-report-container");
    if (!element) return;
    const inputs = element.querySelectorAll("input:not([type='radio']):not([type='checkbox']), textarea");
    const valuesMap = new Map();
    inputs.forEach((inp, i) => { inp.setAttribute('data-html2canvas-id', i); valuesMap.set(i.toString(), inp.value); });
    try {
      setIsExportingImage(true);
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(element, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 1152,
        onclone: (clonedDoc) => {
          const clonedContainer = clonedDoc.getElementById("shift-report-container");
          if (!clonedContainer) return;
          clonedContainer.style.width = "1152px"; clonedContainer.style.maxWidth = "none";
          clonedContainer.querySelectorAll('.overflow-x-auto').forEach(el => el.style.overflow = 'visible');
          const clonedInputs = clonedContainer.querySelectorAll("input[data-html2canvas-id], textarea[data-html2canvas-id]");
          clonedInputs.forEach((input) => {
            const id = input.getAttribute('data-html2canvas-id');
            const val = valuesMap.get(id);
            const div = clonedDoc.createElement("div");
            div.innerText = val || "\u00A0"; div.className = input.className;
            div.style.border = "none"; div.style.borderBottom = input.classList.contains('grid-input') ? "none" : "1px dotted #94a3b8";
            div.style.background = "transparent"; div.style.color = "black"; div.style.fontWeight = "bold"; div.style.display = "inline-flex"; div.style.alignItems = "center"; div.style.minHeight = "24px";
            if (input.classList.contains("text-right")) div.style.justifyContent = "flex-end";
            else if (input.classList.contains("text-center") || input.classList.contains("grid-input")) div.style.justifyContent = "center";
            else div.style.justifyContent = "flex-start";
            input.parentNode.replaceChild(div, input);
          });
        }
      });
      inputs.forEach(inp => inp.removeAttribute('data-html2canvas-id'));
      const link = document.createElement("a");
      link.download = `Shift_Report_${meta.date}_${meta.shift}.jpg`; link.href = canvas.toDataURL("image/jpeg", 0.9); link.click();
    } catch (error) { alert("เกิดข้อผิดพลาดในการสร้างรูปภาพ: " + error.message); } finally { setIsExportingImage(false); }
  };

  const [newEvent, setNewEvent] = useState({ start: '', end: '', label: '' });

  const addEvent = (activityName) => {
    if (!newEvent.start || !newEvent.end) return alert('กรุณาระบุเวลาเริ่มและสิ้นสุด');
    const updatedEvents = { ...events };
    if (!updatedEvents[activityName]) updatedEvents[activityName] = [];
    if (editingEventId) updatedEvents[activityName] = updatedEvents[activityName].map(ev => ev.id === editingEventId ? { ...ev, start: newEvent.start, end: newEvent.end, label: newEvent.label } : ev);
    else updatedEvents[activityName].push({ ...newEvent, id: Date.now() });
    markDirty();
    setEvents(updatedEvents); setNewEvent({ start: '', end: '', label: '' }); setEditingEventId(null); triggerAutoSaveEvents(updatedEvents);
  };

  const deleteEvent = (activityName, id) => {
    const updatedEvents = { ...events };
    updatedEvents[activityName] = updatedEvents[activityName].filter(ev => ev.id !== id);
    if (updatedEvents[activityName].length === 0) delete updatedEvents[activityName];
    markDirty();
    setEvents(updatedEvents); triggerAutoSaveEvents(updatedEvents);
  };

  const handleEditEventClick = (ev) => {
    if (ev.isAuto) return;
    setNewEvent({ start: ev.start, end: ev.end, label: String(ev.label) }); setEditingEventId(ev.id);
  };

  const cancelEdit = () => { setNewEvent({ start: '', end: '', label: '' }); setEditingEventId(null); };
  const closeModal = () => { setActiveModal(null); cancelEdit(); };

  const renderInput = (value, onChange, name, placeholder = "", type = "text", className = "") => (
    <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className={`w-full bg-surface-alt border border-input rounded-input outline-none focus:border-navy focus:ring-2 focus:ring-cyan-tint transition-all print:bg-transparent print:border-b print:border-black print:border-x-0 print:border-t-0 print:rounded-none print:text-black ${className}`} />
  );

  return (
    <div className="max-w-[1123px] mx-auto font-sans text-sm pb-32 animate-fade-in">
      <style dangerouslySetInnerHTML={{ __html: '@media print { @page { size: A4 portrait; margin: 8mm; } }' }} />
      <div className="mb-6 bg-white p-5 rounded-card shadow-card border border-line flex flex-col sm:flex-row justify-between items-center gap-4 no-print">
        <h1 className="text-xl font-semibold text-ink flex items-center gap-3"><FileText className="text-navy" size={24} />ระบบบันทึก TBM Shift Report</h1>
        <div className="flex w-full sm:w-auto gap-3">
          <button onClick={handleDownloadImage} disabled={isExportingImage} className="flex-1 sm:flex-none bg-navy hover:bg-navy-deepest text-white px-5 py-2.5 rounded-input flex items-center justify-center gap-2 transition-colors shadow-card font-semibold">{isExportingImage ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} {isExportingImage ? "Saving..." : "เซฟรูปภาพ"}</button>
          {!readOnly && (<button onClick={handleSaveToCloud} disabled={isSaving || appendBlocked} className="flex-1 sm:flex-none bg-sgreen-dark hover:bg-sgreen-dark/90 disabled:opacity-60 text-white px-5 py-2.5 rounded-input flex items-center justify-center gap-2 transition-colors shadow-card font-semibold">{isSaving ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} />} {isSaving ? "Saving..." : "Save to Cloud"}</button>)}
          <button onClick={handlePrint} className="flex-1 sm:flex-none bg-navy hover:bg-navy-dark text-white px-5 py-2.5 rounded-input flex items-center justify-center gap-2 transition-colors shadow-card font-semibold"><Printer size={18} /> Print PDF</button>
        </div>
      </div>

      {appendBlocked && !saveUnresolved && !readOnly && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/40 text-amber-700 px-4 py-2 rounded-card text-[13px] no-print font-semibold">
          {/* No spinner: nothing retries on its own, so an endlessly spinning icon would promise a
              wait that never ends — the fetch may already have failed for good. The button is the
              way forward, the same one the unknown-outcome notice uses. */}
          <span>
            ยังไม่ได้ข้อมูลรายงานกะของเครื่องนี้จากเซิร์ฟเวอร์ — กรอกไว้ก่อนได้ แต่ยังบันทึกไม่ได้ เพื่อกันสร้างรายงานซ้ำกับที่มีอยู่แล้ว
            {checkFailed && <strong> · ดึงข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</strong>}
          </span>
          {onRefresh && (
            <button onClick={checkWithServer} disabled={checking} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-input font-semibold transition-colors">
              {checking ? "กำลังโหลด…" : "ดึงข้อมูลจากเซิร์ฟเวอร์"}
            </button>
          )}
        </div>
      )}

      {saveUnresolved && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/40 text-amber-700 px-4 py-2 rounded-card text-[13px] no-print font-semibold">
          {/* Says only what is true, including what the crew must not do: the bars added while this
              is up are on the device only, so leaving the screen loses them. The button is not a
              suggestion — it is the only thing that can resume saving, because its fetch is the only
              one issued after we gave up waiting. */}
          <span>
            ไม่ทราบผลการบันทึกล่าสุด (เซิร์ฟเวอร์ไม่ตอบ) — หยุดส่งชั่วคราวเพื่อกันรายงานซ้ำ สิ่งที่กรอกเพิ่มหลังจากนี้อยู่บนเครื่องนี้เท่านั้น <strong>อย่าเพิ่งออกจากหน้านี้</strong>
            {onRefresh ? " กด “ตรวจสอบกับเซิร์ฟเวอร์” เพื่อบันทึกต่อ" : " เมื่อเชื่อมต่อได้แล้วให้เปิดแอพใหม่และตรวจสอบรายงานกะนี้ก่อนบันทึกซ้ำ"}
            {checkFailed && <strong> · ตรวจสอบไม่สำเร็จ (ยังติดต่อเซิร์ฟเวอร์ไม่ได้) ลองใหม่อีกครั้ง</strong>}
          </span>
          {onRefresh && (
            <button onClick={checkWithServer} disabled={checking} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-input font-semibold transition-colors">
              {checking ? "กำลังตรวจสอบ…" : "ตรวจสอบกับเซิร์ฟเวอร์"}
            </button>
          )}
        </div>
      )}

      {serverCopyPending && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 bg-code-b/10 border border-code-b/30 text-code-b px-4 py-2 rounded-card text-[13px] no-print font-semibold">
          <span>มีรายงานกะนี้จากเซิร์ฟเวอร์ — ข้อมูลที่กรอกไว้ยังอยู่ ไม่ถูกทับ</span>
          {confirmDiscard ? (
            <span className="flex items-center gap-3">
              <span className="font-normal">ข้อมูลที่กรอกไว้จะหายทั้งหมด</span>
              <button type="button" onClick={() => { setConfirmDiscard(false); loadForm(); }} className="underline underline-offset-2">ยืนยันทับ</button>
              <button type="button" onClick={() => setConfirmDiscard(false)} className="underline underline-offset-2 text-ink-2">ยกเลิก</button>
            </span>
          ) : (
            // discarding unsaved field data takes a second, explicit action — there is no undo and
            // manpower/result have no auto-save behind them
            <button type="button" onClick={() => setConfirmDiscard(true)} className="underline underline-offset-2">โหลดข้อมูลจากเซิร์ฟเวอร์แทน</button>
          )}
        </div>
      )}
      <div id="shift-report-container" className={`bg-white border border-line shadow-modal print:shadow-none print:border-none rounded-modal overflow-hidden print:rounded-none ${readOnly ? "pointer-events-none" : ""}`}>
        <div className="p-8 border-b border-line print:border-black print:p-2 text-center bg-surface-alt print:bg-white">
          <h2 className="text-2xl print:text-lg font-semibold mb-2 tracking-tight text-ink print:text-black">บันทึกการทำงานการขุดเจาะอุโมงค์</h2>
          <p className="font-semibold text-ink-2 print:text-black text-sm mb-3">โครงการงานก่อสร้างอุโมงค์ระบายน้ำคลองเปรมประชากรจากคลองบางบัวลงสู่แม่น้ำเจ้าพระยา</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 text-xs sm:text-sm mt-4 text-ink-2 print:text-black items-center font-medium">
            <p><strong className="text-ink">ผู้ว่าจ้าง :</strong> สำนักการระบายน้ำ กรุงเทพมหานคร</p>
            <div className="flex items-center gap-2"><strong className="text-ink">ผู้ให้บริการควบคุมงานก่อสร้าง :</strong><div className="flex items-center bg-white px-3 py-1 rounded-input border border-line shadow-sm print:shadow-none print:border-gray-400"><span className="text-[#004a80] font-semibold tracking-tighter border-r border-gray-300 pr-2 text-xs">TEAM GROUP</span><span className="text-[#1a85b6] font-semibold pl-2 text-xs flex items-center gap-1"><div className="w-3 h-3 bg-gray-200 rounded-sm flex items-center justify-center relative overflow-hidden"><div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-transparent border-b-[#1a85b6] absolute bottom-0.5"></div></div>GFE</span></div></div>
            <p><strong className="text-ink">ผู้รับจ้าง :</strong> กิจการร่วมค้า ไอทีดี-เอ็นดับเบิลยูอาร์</p>
          </div>
        </div>

        <div className="p-5 sm:p-6 print:p-2 border-b border-line print:border-black flex flex-wrap gap-4 items-center bg-white text-sm font-medium">
          <div className="flex items-center gap-2 pointer-events-auto"><strong className="text-ink">วันที่:</strong><input type="date" name="date" value={meta.date} onChange={handleMetaChange} className="border border-input p-2 rounded-input bg-surface-alt print:border-none print:bg-transparent text-ink font-semibold outline-none focus:ring-2 focus:ring-cyan-tint focus:border-navy transition-all" /></div>
          <div className="flex items-center gap-2"><strong className="text-ink">หัวเจาะหมายเลข:</strong><span className="border border-line p-2 rounded-input bg-surface-alt w-24 print:border-none print:bg-transparent font-semibold text-center inline-block text-ink">{meta.tbmNo}</span></div>
          <div className="flex items-center gap-2 flex-grow"><strong className="text-ink">ตำแหน่ง:</strong><input type="text" name="location" value={meta.location} onChange={handleMetaChange} className="border border-input p-2 rounded-input bg-surface-alt w-full print:border-none print:bg-transparent font-semibold outline-none focus:ring-2 focus:ring-cyan-tint focus:border-navy transition-all" /></div>
          <div className="flex items-center gap-5 font-semibold bg-surface-alt p-2.5 rounded-input border border-line shadow-sm print:shadow-none print:border-none print:bg-transparent pointer-events-auto">
            <label className="flex items-center gap-1.5 cursor-pointer text-code-b hover:text-code-b/80 transition-colors"><input type="radio" name="shift" value="Day" checked={meta.shift === 'Day'} onChange={handleMetaChange} className="accent-code-b w-4 h-4" /> Day (07-19)</label>
            <label className="flex items-center gap-1.5 cursor-pointer text-navy hover:text-navy-dark transition-colors"><input type="radio" name="shift" value="Night" checked={meta.shift === 'Night'} onChange={handleMetaChange} className="accent-navy w-4 h-4" /> Night (19-07)</label>
          </div>
        </div>

        <div className="overflow-x-auto border-b border-line print:border-black">
          <table className="w-full text-[13px] print:text-[13px] border-collapse table-fixed min-w-[800px]">
            <thead>
              <tr className="bg-surface-alt">
                <th className="border border-line print:border-black p-2.5 text-left text-ink-2" style={{ width: '22%' }}>Time / Activities</th>
                {currentHours.map((hour, idx) => <th key={idx} className="border border-line print:border-black p-1 text-center font-semibold text-ink-2" style={{ width: '6%' }}>{hour}</th>)}
                <th className="border border-line print:border-black p-1 text-center text-ink-2" style={{ width: '6%' }}>Total Time<br />(min)</th>
              </tr>
            </thead>
            <tbody>
              {activityCategories.map((cat, cIdx) => (
                <React.Fragment key={cIdx}>
                  <tr className="bg-surface-alt"><td colSpan={14} className="border border-line print:border-black p-2 font-semibold pl-3 text-ink">{String(cat.group)}</td></tr>
                  {cat.items.map((item, iIdx) => {
                    const totalMins = getTotalMinutes(item);
                    return (
                      <tr key={`${cIdx}-${iIdx}`} className="group hover:bg-cyan-tint transition-colors">
                        <td className="border border-line print:border-black p-1.5 pl-5 relative bg-white font-medium text-ink-2 align-middle">
                          {String(item)}
                          <button onClick={() => setActiveModal(item)} className="absolute right-1.5 top-1.5 text-navy hover:text-navy-dark bg-cyan-tint hover:bg-cyan-tint/80 p-1 rounded-input no-print opacity-0 group-hover:opacity-100 transition-all shadow-sm" title="เพิ่มเวลาการทำงาน"><Plus size={14} /></button>
                        </td>
                        <td colSpan={12} className="border border-line print:border-black p-0 relative align-middle">
                          <div className="absolute inset-0 flex pointer-events-none">{currentHours.map((h, idx) => <div key={idx} className={`h-full w-[8.333%] ${idx < 11 ? 'border-r border-line print:border-gray-300' : ''}`} />)}</div>
                          <div className="relative grid items-center px-0.5 py-[3px] min-h-[40px]">
                            {(Array.isArray(displayEvents[item]) ? displayEvents[item] : []).filter(ev => ev != null).map((ev, index) => {
                              const { left, width } = calculateBarStyles(ev.start, ev.end, meta.shift);
                              const colorClasses = getBarColorClasses(cIdx);
                              return (
                                <div key={`${ev.id || index}-${index}`} className={`[grid-area:1/1] min-w-0 py-[3px] border-[1.5px] rounded-[4px] flex items-center justify-center text-center text-[12px] print:text-[12px] leading-[1.3] font-semibold break-words cursor-pointer z-10 hover:brightness-95 transition-all shadow-sm ${colorClasses}`} style={{ marginLeft: left, width }} onClick={() => !ev?.isAuto && setActiveModal(item)} title={`${ev.start} - ${ev.end}`}>
                                  <span className="px-1 py-0.5 tracking-tight">{String(ev.label || "")}</span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="border border-line print:border-black p-1 text-center bg-surface-alt print:bg-white font-semibold text-navy print:text-blue-800 text-[14px] font-mono align-middle">{totalMins > 0 ? totalMins : ''}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 border-b border-line print:border-black bg-surface-page">
          <div className="p-6 print:p-3 lg:border-r border-line print:border-black bg-white m-3 sm:m-4 rounded-card shadow-card print:shadow-none print:m-0 print:rounded-none">
            <h3 className="font-semibold text-ink flex items-center gap-2 mb-4 bg-surface-alt print:bg-transparent p-2 rounded-input print:p-0"><Users size={18} className="text-ink-3" /> Man Power (People)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs sm:text-sm print:text-[11px]">
              {Object.keys(manpower).map(role => (
                <div key={role} className="flex flex-col"><span className="text-ink-3 font-semibold mb-1.5">{String(role)}</span>{renderInput(manpower[role], handleManpowerChange, role, "0", "number", "text-center p-2 font-semibold")}</div>
              ))}
            </div>
          </div>
          <div className="p-6 print:p-3 bg-white m-3 sm:m-4 rounded-card shadow-card print:shadow-none print:m-0 print:rounded-none">
            <h3 className="font-semibold text-ink flex items-center gap-2 mb-4 bg-surface-alt print:bg-transparent p-2 rounded-input print:p-0"><Activity size={18} className="text-ink-3" /> Result</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-xs sm:text-sm print:text-[11px]">
              <div className="flex items-center justify-between border-b border-dashed border-line pb-2"><span className="font-medium text-ink-2">Start: Sta.</span><div className="w-28">{renderInput(result.startSta, handleResultChange, 'startSta', '', 'text', 'text-right font-semibold p-1')}</div></div>
              <div className="flex items-center justify-between border-b border-dashed border-line pb-2"><span className="font-medium text-ink-2">Finish: Sta.</span><div className="w-28">{renderInput(result.finishSta, handleResultChange, 'finishSta', '', 'text', 'text-right font-semibold p-1')}</div></div>
              <div className="flex items-center justify-between border-b border-dashed border-line pb-2"><span className="font-medium text-ink-2">Number of ring:</span><div className="w-28">{renderInput(result.numberRing, handleResultChange, 'numberRing', '', 'number', 'text-right font-semibold text-navy p-1 font-mono')}</div></div>
              <div className="flex items-center justify-between border-b border-dashed border-line pb-2"><span className="font-medium text-ink-2">Total Distance (m.):</span><div className="w-28">{renderInput(result.totalDistance, handleResultChange, 'totalDistance', '', 'text', 'text-right font-semibold p-1')}</div></div>
              <div className="flex items-center justify-between col-span-1 sm:col-span-2 border-b border-dashed border-line pb-2"><span className="font-medium text-ink-2">Progress Rate (m./shift):</span><div className="w-28">{renderInput(result.progressRate, handleResultChange, 'progressRate', '', 'text', 'text-right font-semibold p-1')}</div></div>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-10 print:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center text-xs print:text-[11px] bg-white">
          {['ผู้บันทึก (ผู้รับจ้าง)', 'วิศวกร (ผู้รับจ้าง)', 'วิศวกร (กลุ่มบริษัทที่ปรึกษา)', 'ผู้ควบคุมงาน สำนักการระบายน้ำ'].map((role, idx) => (
            <div key={idx} className="flex flex-col justify-end h-28 sm:h-32">
              <p className="text-ink-3 font-semibold mb-auto">{idx === 0 ? 'บันทึกโดย' : idx === 1 ? 'ตรวจสอบโดย' : ''}</p>
              <div className="border-b-[1.5px] border-dotted border-line print:border-black w-[80%] mx-auto pb-2 relative"><input type="text" className="absolute bottom-0 left-0 w-full text-center bg-transparent outline-none grid-input font-semibold text-ink-2 print:text-black border-none" placeholder="(ชื่อ-สกุล)" /></div>
              <p className="font-semibold text-ink mt-3">{String(role)}</p>
            </div>
          ))}
        </div>
      </div>

      {activeModal && (
        <div className="fixed inset-0 bg-navy-dark/50 backdrop-blur-sm flex items-center justify-center z-50 no-print p-4">
          <div className="bg-white rounded-modal shadow-modal p-6 sm:p-8 w-full max-w-md transform transition-all border border-line">
            <div className="flex justify-between items-center border-b border-line pb-4 mb-5">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-ink"><Clock className="text-navy" size={20} />{editingEventId ? 'แก้ไขเวลา:' : 'เพิ่มเวลา:'} <span className="text-cyan-med">{String(activeModal)}</span></h3>
              <button onClick={closeModal} className="text-ink-3 hover:text-code-d bg-surface-alt hover:bg-code-d/10 rounded-full p-1.5 transition-colors"><X size={20} /></button>
            </div>
            <div className="flex gap-4 mb-5">
              <div className="flex-1"><label className="block text-[10px] sm:text-xs font-semibold text-ink-3 mb-1.5 uppercase tracking-widest">เวลาเริ่ม (Start)</label><input type="time" value={newEvent.start} onChange={e => setNewEvent({ ...newEvent, start: e.target.value })} className="w-full border border-input rounded-input p-3 text-sm font-semibold text-ink-2 outline-none focus:ring-2 focus:ring-cyan-tint focus:border-navy transition-all" /></div>
              <div className="flex-1"><label className="block text-[10px] sm:text-xs font-semibold text-ink-3 mb-1.5 uppercase tracking-widest">เวลาสิ้นสุด (End)</label><input type="time" value={newEvent.end} onChange={e => setNewEvent({ ...newEvent, end: e.target.value })} className="w-full border border-input rounded-input p-3 text-sm font-semibold text-ink-2 outline-none focus:ring-2 focus:ring-cyan-tint focus:border-navy transition-all" /></div>
            </div>
            <div className="mb-8"><label className="block text-[10px] sm:text-xs font-semibold text-ink-3 mb-1.5 uppercase tracking-widest">ข้อความในกราฟ</label><input type="text" value={newEvent.label} onChange={e => setNewEvent({ ...newEvent, label: e.target.value })} placeholder="เช่น 108 หรือ K-14" className="w-full border border-input rounded-input p-3 text-sm font-semibold text-ink-2 outline-none focus:ring-2 focus:ring-cyan-tint focus:border-navy transition-all" /></div>
            <div className="flex flex-col gap-3 mb-6">
              <button onClick={() => addEvent(activeModal)} className={`w-full text-white rounded-input p-3.5 font-semibold transition-all shadow-card flex items-center justify-center gap-2 active:scale-[0.98] ${editingEventId ? "bg-sgreen-dark hover:bg-sgreen-dark/90" : "bg-navy hover:bg-navy-dark"}`}>{editingEventId ? <Save size={18} /> : <Plus size={18} />}{editingEventId ? "บันทึกการแก้ไข" : "เพิ่มช่วงเวลาลงกราฟ"}</button>
              {editingEventId && <button onClick={cancelEdit} className="w-full text-ink-3 hover:text-ink text-xs font-semibold py-2 underline transition-colors">ยกเลิกการแก้ไข</button>}
            </div>
            {Array.isArray(displayEvents[activeModal]) && displayEvents[activeModal].length > 0 && (
              <div className="bg-surface-alt rounded-input p-4 border border-line">
                <h4 className="font-semibold text-[10px] uppercase tracking-widest mb-3 text-ink-3">รายการที่บันทึกไว้แล้ว</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 hide-scrollbar">
                  {displayEvents[activeModal].filter(ev => ev != null).map((ev, index) => (
                    <div key={`${ev.id || index}-${index}`} className={`flex justify-between items-center bg-white p-3 rounded-input text-sm border shadow-sm transition-all ${editingEventId === ev?.id ? 'border-sgreen-med ring-2 ring-sgreen-med/20' : 'border-line hover:border-input'}`}>
                      <span className="font-medium text-ink-2 font-mono">{ev.start} - {ev.end} <strong className="ml-2 text-navy bg-cyan-tint px-2 py-0.5 rounded-badge border border-cyan-tint font-sans tracking-tight">[{String(ev.label || "")}]</strong></span>
                      {ev.isAuto ? <span className="text-[9px] text-sgreen-dark bg-sgreen-med/10 px-2 py-1 rounded-badge font-semibold border border-sgreen-med/30">Auto (System)</span> : <div className="flex items-center gap-1"><button onClick={() => handleEditEventClick(ev)} className="text-navy hover:bg-cyan-tint p-1.5 rounded-input transition-colors"><Edit size={16} /></button><button onClick={() => deleteEvent(activeModal, ev.id)} className="text-code-d hover:bg-code-d/10 p-1.5 rounded-input transition-colors"><Trash2 size={16} /></button></div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftReportView;
