# Plan Review Log: TBM System — 3 ฟีเจอร์ใหม่
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

## Round 1 — Codex
_(round 1a: sandbox blocked FS reads — spurious REVISE; re-ran round 1b feeding PLAN + 14 source files inline via stdin. Below = the real review.)_

23 findings, VERDICT: REVISE:
1. GAS edits pointed at `gas/Code.js` but authoritative = `../gas-live/Code.js`.
2. `ensureSheet_` never adds headers to existing populated sheets → new head fields/secondary sheet silently fail.
3. Secondary actions assume sheet exists (add/update should ensure inline).
4. `SecondaryGrouts` headers under-specified → need exact list.
5. Removing Re-Grout + allowing dup primary → ambiguous "latest primary per ring".
6. Secondary "no ratio" but dashboard/badges/buckets/edit modal assume ratio → 0.0% reads as fail-spec.
7. Data Log edit/delete-by-groutType but GroutDashboardView owns only setGroutRecords (no secondary setter).
8. RingVisualizer positions tied to old Re-Grout semantics — undefined for standalone secondary.
9. Analysis "All" aggregation undefined (sum-per-ring vs independent).
10. `doPost` `lock.tryLock(10000)` return unchecked → race risk.
11. `parseRingNo` numeric-only rejects "P41"; F3 needs P41.
12. `latestRingState` uses parseRingNo → empty for P-prefixed rings (head cards blank).
13. `deviationSeries` global-filters on headV → art/tail/vrt-only entries vanish.
14. Segment form reset doesn't clear head fields → stale carry to next ring.
15. Adding SEG_HEADERS alone won't save fields already dropped; audit payload vs headers.
16. Viewer/nav for new `head_level` tab incomplete (default tab, mobile More).
17. routeConfig localStorage per-machine key vs project-wide table — contradiction.
18. GAS PlanConfig key/value; saveRouteConfig keys + migration/fallback undefined.
19. Cross-machine progress reads both sheets each fetch — perf.
20. "latestRing ≥ ringEnd" unsafe with overlapping/prefix ranges.
21. Route actual-distance rollup semantics unresolved (showActual insufficient for parents).
22. `TOTAL_ROUTE_DISTANCE` has many consumers (charts/forecast/bars/Y-axis) — not just "move hardcode".
23. Config editor allows arbitrary order/level/ranges — no validation.
+ #24 observability (writes return only success); #25 missing files (App.jsx/api.js/tests) blocked full review.

### Claude's response
Verified 4 highest-impact claims against real code before acting (arbiter, not blind-accept):
- `getRingNumeric` (helpers.js:50 `/\d+/`) vs `parseRingNo` (profileSection.js:13 `/^\d+$/`) — **#11/#12 confirmed**.
- `appendRow` (GAS:184-188) maps by header name → unknown keys dropped — **#15 confirmed**.
- `ensureSheet_` (GAS:39-47) only seeds headers on new/empty sheet — **#2 confirmed**.
- `lock.tryLock(10000)` (GAS:118) return unchecked — **#10 confirmed**.

**Accepted ~all 23** — every finding is legitimate. Revised PLAN rev2:
- Added "Shared infrastructure" section: S1 idempotent `ensureHeaders_` migration + inline-ensure in every new action (#2,#3,#15); S2 switch profileSection to `getRingNumeric` (#11,#12); S3 lock-acquire check (#10); S4 error/observability contract (#24).
- F1: exact `SECONDARY_GROUT_HEADERS` (#4); dup-primary dedupe rule = latest-by-timestamp per ring (#5); ratio-UI branch on groutType (#6); explicit `secondaryGroutRecords`+setter props (#7); secondary RingVisualizer own positions secondary-colored (#8); All-mode = independent records + ratio primary-only (#9).
- F2: GAS target `../gas-live/Code.js` (#1); per-metric filter in deviationSeries (#13); reset head fields after save (#14); SEG_HEADERS audit noted (#15); full nav/viewer/mobile handling for head_level (#16).
- F3: storage per-machine legs + shared project total, precedence GAS→localStorage→seed w/ malformed fallback (#17,#18); leg status/actual from in-range permanent records not latest-ring (#20); deterministic rollup — planned for structural rows, actual for current leaf, parent=planned (matches report) (#21); enumerate TOTAL_ROUTE_DISTANCE consumers → active-machine total + shim (#22); config validation rules (#23); machineProgress numeric-only, cache=future (#19).
- Round 2: will attach api.js + App.jsx data-flow excerpt to close #25.
- **Rejected: none.** (#19 perf accepted as documented future-cache, not full solution now — TBM2=0/small data.)

## Round 2 — Codex
Resumed same thread with rev2 PLAN + api.js + App.jsx(1-360). Codex confirmed round-1 issues addressed. 12 new/finer findings, VERDICT: REVISE:
- R2.1 apiCall returns {status:error} as success + GAS returns success for unknown action → typo saves nothing silently.
- R2.2 viewer read-only client-side only; any GAS-URL holder can POST writes (no server auth).
- R2.3 getData.routeConfig singular per active machine, but project-wide table needs TBM1+TBM2 configs together.
- R2.4 App state/props defined for secondary but not machineProgress/routeConfigs/routeProjectTotal.
- R2.5 machineProgress naive count double-counts (client dedups duplicate ring rows, prefers Completed).
- R2.6 positions double-encoded (client stringifies + GAS stringifies again).
- R2.7 App fetch has no request guard; slow TBM1 response can overwrite TBM2 state after machine switch.
- R2.8 plan self-contradicts: "update all TOTAL_ROUTE_DISTANCE consumers" vs "don't touch graph/bar/forecast".
- R2.9 precision loss: TBM1 total 8874.683 → rev2 seed 8874.
- R2.10 toleranceBreaches checks only headV; trend/cards imply H/A/T breaches.
- R2.11 leg "completed if covers whole leg" vague — needs exact criterion.
- R2.12 importing getRingNumeric into pure profileSection.js pulls browser-only helpers module.

### Claude's response
**Accepted 11, revised PLAN rev3:**
- S2 → fix `parseRingNo` prefix-aware LOCALLY (don't import helpers — keeps profileSection pure) (R2.12).
- S4 → GAS unknown-action error branch + `apiCall` throws on status==='error' (R2.1).
- S5 (new) → AbortController/seq-id fetch guard in App.jsx (R2.7).
- S6 (new) → positions encode-once + parse legacy double-encoded (R2.6).
- F2 → toleranceBreaches metric-aware (any of H/A/T) (R2.10).
- F3 → getData returns `routeConfigs:{TBM1,TBM2}`+`routeProjectTotal` (R2.3); App state/pass-through for routeConfigs/routeProjectTotal/machineProgress (R2.4); machineProgress mirrors client `deduplicateRecords`+cross-check test (R2.5); resolve contradiction — chart/bar/forecast total swap is IN scope, redesign is not (R2.8); precise 8874.683 internal, round for display (R2.9); exact leg-complete criterion = max completed permanent ring in range ≥ ringEnd (R2.11).
- **Rejected 1 (logged): R2.2 server-side write auth** — pre-existing app-wide posture (every existing write endpoint is unauthenticated; viewer was always client-side-only). Not introduced by these 3 features; adding a write token touches all endpoints + front-end = separate security initiative. Documented in PLAN risks + out-of-scope; recommend dedicated follow-up task. Not expanding this plan's scope.

## Round 3 — Codex
Resumed with rev3. **Codex accepted the R2.2 scope boundary** ("fair to keep hardening out of this scope; just don't describe ?view=1 as security" — PLAN already frames it as client-side-only). 6 remaining consistency/completeness findings, VERDICT: REVISE:
- R3.1 head fields go through EXISTING addSegment/updateSegment, but S1 only ensured headers for "new" actions → head values can drop.
- R3.2 S6 encode-once only covered secondary; primary addGrout/updateGrout still double-encode.
- R3.3 latestRingState still filters on headV only (deviationSeries/toleranceBreaches were made metric-aware but not this).
- R3.4 totals inconsistent: 13,600 vs 8,874.683+4,726 → combined % can exceed 100%.
- R3.5 status uses "completed permanent" while actualDoneInLeg uses "permanent after dedupe (may include In Progress)" — different record sets.
- R3.6 precedence text still says singular `getData.routeConfig` after adding `routeConfigs:{TBM1,TBM2}`.

### Claude's response
**Accepted all 6, revised PLAN rev4 (no rejections):**
- S1 → explicitly ensure headers inside existing addSegment/updateSegment branches (R3.1).
- S6 → encode-once applies to ALL grout write paths incl. primary addGrout/updateGrout (R3.2).
- F2 → latestRingState metric-aware (latest ring with any of H/A/T/VRT, missing→"—") (R3.3).
- F3 → projectTotal authoritative + clamp all % to ≤100 + seed reconciliation note (R3.4); single `selected(machine)` record set (dedupe, prefer Completed, In-Progress frontier→"กำลังทำ") used by actual+status+machineProgress (R3.5); rename contract to `routeConfigs` plural everywhere + explicit save/load keys routeConfig_TBM1/_TBM2 + routeProjectTotal (R3.6).

## Round 4 — Codex
Resumed with rev4. Codex confirmed all round-3 issues resolved at plan level (segment header migration explicit; encode-once covers primary+secondary; latestRingState metric-aware; routeConfigs naming consistent; single selected record set for actual/status; total inconsistency bounded by authoritative projectTotal + clamped %). **VERDICT: APPROVED** (converged at round 4 of 5).
Codex's parting note — execution-discipline watch items (not blockers): keep GAS/client dedupe identical, preserve the fetch race guard, make route-total UI show seed machine totals are approximate.

---
**RESULT: converged — APPROVED round 4/5.** Plan hardened across 2 real Codex rounds (round 1a was a sandbox false-start). Awaiting user sign-off before any code.


