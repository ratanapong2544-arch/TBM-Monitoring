# Tunnel Monitoring Mobile PWA with Offline Sync — Design

**Date:** 2026-07-29

**Status:** Approved in conversation

**Target repository:** `TunnelBoringMonitoring`

## 1. Objective

Convert the existing React web application into an installable internal mobile application without publishing it to Google Play or the Apple App Store.

The application must:

- Install from the existing Vercel HTTPS URL on Android and iPhone.
- Keep every current application page available on mobile.
- Open previously loaded application pages and data while offline.
- Save business records locally when a request cannot reach the server.
- Synchronize pending records when connectivity returns without creating duplicates.
- Detect concurrent edits and require a user to resolve conflicts instead of silently overwriting engineering data.
- Support an initial team of approximately ten users without login.
- Preserve a clear path to user authentication and authorization later.

## 2. Current Context

The current application uses:

- React 18 and Create React App.
- Vercel for the frontend deployment over HTTPS.
- Google Apps Script (GAS) as the backend.
- Responsive mobile navigation and layouts already present in the UI.
- A basic Web App Manifest with standalone display mode.
- Direct `fetch` calls and a mixture of server-backed data and `localStorage`-backed business data.

The application does not currently have a registered service worker, a durable offline mutation queue, a unified data repository, or server-side version checks for concurrent edits.

## 3. Selected Approach

Implement a full Progressive Web App (PWA) around the existing React application.

This approach reuses the current frontend and backend, avoids app-store distribution, and keeps deployment centralized on Vercel. A Capacitor wrapper and a native rewrite are outside the selected approach because iPhone distribution outside the App Store would add certificate and device-management overhead without providing a necessary benefit for the current requirements.

## 4. Scope

### Included

- Android and iPhone Home Screen installation.
- Offline application shell and previously loaded static assets.
- Offline snapshots for all application pages.
- Durable IndexedDB storage for business data, pending mutations, conflicts, and sync metadata.
- Queueing of all business-data writes.
- Automatic and manual synchronization.
- Idempotent GAS writes.
- Optimistic concurrency checks and interactive conflict resolution.
- App-wide network and sync status.
- Safe service-worker updates and IndexedDB schema migrations.
- Migration of existing device-local business records from `localStorage` to IndexedDB.
- Device identification before login is introduced.
- Automated and real-device verification.

### Excluded

- Google Play or Apple App Store publishing.
- Native Android or iOS packages.
- Mobile-device-management distribution.
- User login, role management, and account administration.
- Guaranteed background execution while the PWA is closed.
- Bulk offline download of third-party map tiles.
- Offline execution of features that require an external online service, including server-side AI analysis.

## 5. Architecture

The existing React views remain the presentation layer. Business-data access moves behind a single repository interface so components no longer need to decide whether to use the network, IndexedDB, or cached data.

### 5.1 Application Shell and Service Worker

A custom service worker, built with Workbox `injectManifest` after the Create React App build, will:

- Precache versioned application-shell assets.
- Use navigation fallback so installed routes open offline.
- Runtime-cache fonts, icons, images, 3D assets, and previously viewed permitted map tiles with bounded size and age limits.
- Never treat cached API responses as the authoritative business-data store.
- Announce an available application update without deleting IndexedDB data or activating an incompatible schema silently.

### 5.2 IndexedDB

IndexedDB is the durable on-device store. It contains:

- `snapshots`: the latest confirmed server data by machine, entity type, and query scope.
- `entities`: normalized local business records used by views.
- `mutations`: pending, in-flight, failed-validation, and resolved mutation records.
- `conflicts`: unresolved and resolved conflict records.
- `syncMeta`: last successful synchronization, retry metadata, and server cursors.
- `deviceMeta`: installation-specific device ID and optional user-facing device label.

UI-only preferences such as the active tab, collapsed sections, and display options may remain in `localStorage`. Business records must not remain solely in `localStorage`.

The application requests persistent browser storage where the platform supports it and reports storage usage in the sync center. Browser-managed storage can still be lost if a device is reset, the user clears website data, or the operating system removes site data. Therefore, the UI distinguishes “saved on this device” from “confirmed by the server,” and the emergency export remains available while records are pending.

### 5.3 Data Repository

The repository exposes stable operations such as:

- Read a collection or record with freshness metadata.
- Create or update a business record locally.
- Observe local changes and sync-state changes.
- Request a refresh from the server.
- Resolve a conflict.

Every view reads through this layer. Existing direct `fetch` calls and business-data `localStorage` access are migrated incrementally behind the same interface.

### 5.4 Sync Manager

The sync manager:

- Processes queued mutations in creation order while allowing independent entity types to proceed safely.
- Starts on application launch, return to foreground, browser `online` events, successful data refreshes, and the user's “Sync now” action.
- Uses exponential backoff with jitter for retryable network and server failures.
- Does not retry validation failures or conflicts automatically.
- Persists every state transition before updating the UI.
- Does not depend on Background Sync being available or consistently scheduled by the operating system.

### 5.5 Google Apps Script

GAS remains the system of record and adds:

- A mutation endpoint that accepts an idempotency key.
- Version checks for updates.
- Stable record identifiers.
- Server timestamps in the Asia/Bangkok domain context.
- Structured validation, conflict, and retryable-error responses.
- An idempotency ledger that returns the original result when the same request is submitted again.

For ring-based data, the stable domain identity includes machine, entity type, and ring number. Existing records receive stable IDs and an initial version during migration or first normalized read.

## 6. Data Contracts

### 6.1 Business Record

Each synchronized business record contains:

- `recordId`: stable server identifier.
- `entityType`: record category.
- `machine`: TBM context where applicable.
- `domainKey`: unique domain identity, such as a ring-scoped key.
- `version`: monotonically increasing server version.
- `updatedAt`: server-confirmed timestamp.
- `updatedBy`: future user identifier; initially absent.
- `updatedByDevice`: installation-specific device identifier.
- `data`: validated domain fields.

### 6.2 Mutation

Each local mutation contains:

- `requestId`: globally unique idempotency key generated before local save.
- `recordId` or new-record domain identity.
- `operation`: create, update, or delete where deletion is supported.
- `baseVersion`: server version on which the edit was based.
- `deviceId`.
- `actorId`: absent until authentication is implemented.
- `createdAtLocal`.
- `attemptCount`, `nextAttemptAt`, and `lastError`.
- `status`: `pending`, `syncing`, `synced`, `validation_error`, `conflict`, or `permanent_error`.
- The complete intended record payload required to replay the mutation.

## 7. Read Flow

### Online

1. Render the most recent local snapshot immediately when available.
2. Request current data from GAS.
3. Validate and normalize the server response.
4. Update IndexedDB atomically.
5. Refresh subscribed views and show the new server-confirmed timestamp.
6. If the request fails, keep the local snapshot visible and show a non-blocking stale-data warning.

### Offline

1. Load the application shell from the service-worker cache.
2. Render data from IndexedDB.
3. Show offline status, snapshot age, pending mutation count, and conflict count.
4. If the requested content has never been loaded, show a page-specific empty state explaining that it must be opened online once.

Map pages may show previously viewed permitted tiles only. The route, markers, engineering values, and other application-owned data remain available from IndexedDB even when an uncached background tile is unavailable.

## 8. Write and Synchronization Flow

1. Validate domain constraints in the client, including ring identity and engineering number formats.
2. Generate `requestId`.
3. Write the intended entity change and mutation to IndexedDB in one transaction.
4. Confirm “Saved on this device” to the user.
5. If online, request immediate synchronization.
6. GAS validates the request, checks idempotency, and compares `baseVersion`.
7. On success, replace the optimistic local entity with the server-confirmed record and mark the mutation `synced`.
8. On a retryable failure, retain the mutation and schedule another attempt.
9. On validation failure, stop retrying and identify the fields the user must correct.
10. On conflict, retain both versions and create a conflict record.

The queue entry is not removed until GAS confirms success or the user explicitly discards it after a warning. The sync center provides an exportable JSON backup of unsynchronized mutations for emergency recovery.

## 9. Conflict Resolution

GAS rejects an update when its `baseVersion` is older than the current server version. It returns:

- The current server record.
- The submitted local record.
- The conflicting fields.
- Current version and timestamp metadata.

The sync center presents a field-by-field comparison with server time, local save time, and device label. The user may:

- Keep the server version.
- Apply the complete local version.
- Edit a new merged version manually.

The application never merges ring or engineering fields silently. A resolution creates a new mutation against the latest server version. The conflict record retains the decision and before/after values for auditability.

## 10. Installation and Update Experience

### Android

- Show an in-app Install action when the browser exposes the install prompt.
- Provide fallback browser instructions if the prompt is unavailable.

### iPhone

- Detect that the app is not running in standalone mode.
- Show concise instructions to open in Safari, tap Share, and choose Add to Home Screen.
- Provide correctly sized PNG touch icons and standalone metadata.

### Updates

- The installed PWA checks for a new service worker.
- When a new version is ready, show “An update is available.”
- Activation occurs after the user chooses to reload or at the next safe launch.
- IndexedDB migrations are versioned, transactional, and backward-safe.
- Pending mutations and conflicts survive application updates.

## 11. Application UI

An app-wide status control appears in the shared shell and is reachable from every page. It shows:

- Online or offline state.
- Last successful server synchronization.
- Pending mutation count.
- Conflict count.
- A link to the sync center.

The sync center contains:

- Pending and retrying records.
- Validation and permanent errors.
- Conflicts requiring review.
- Recently synchronized records.
- “Sync now,” retry, edit, resolve, discard-with-confirmation, and emergency-export actions.

All timestamps shown to users follow Asia/Bangkok. Status text must not claim that data reached the server until GAS has confirmed it.

## 12. Error Handling

- Network exceptions, timeouts, HTTP 429, and server 5xx responses are retryable.
- Client or GAS validation failures require user correction.
- Version mismatches become conflicts.
- Malformed GAS responses become retained permanent errors with a diagnostic code.
- A timeout after the server accepted a write is safe because resubmitting the same `requestId` returns the original result.
- Queue processing failure for one entity does not block unrelated records.
- Storage-quota warnings are visible before writes become unsafe; bounded caches are evicted before business records.
- The application never evicts business records, pending mutations, or conflicts automatically.
- The user is warned that clearing browser/site data or losing the device can remove records that have not reached the server.

## 13. Security and Future Authentication

The first release has no login. The URL must therefore not be described as access control; anyone who obtains it may open the frontend, subject to any controls already applied to the GAS endpoint.

The design prepares for authentication by:

- Keeping `actorId` separate from `deviceId`.
- Passing actor context through the repository and mutation envelope.
- Keeping authorization decisions in GAS rather than React components.
- Avoiding client-side secrets.
- Preserving audit metadata required to associate earlier device-originated records with future users where organizational policy permits.

Authentication, authorization roles, session expiry, and account recovery require a separate approved design before implementation.

## 14. Testing Strategy

### Automated

- Repository tests for online, offline, stale, and first-load states.
- IndexedDB migration and transaction tests.
- Mutation-state-machine tests.
- Retry and backoff tests with deterministic time.
- Idempotency tests against the GAS handler.
- Version-conflict tests for create and update operations.
- Domain-validation regression tests for ring numbers and engineering fields.
- Service-worker precache and navigation-fallback checks against the production build.

### Integration

- Save offline, close the application, reopen, and retain queued records.
- Restore connectivity and synchronize without duplicates.
- Simulate a timeout after GAS accepts a mutation.
- Edit one record on two devices and resolve the resulting conflict.
- Deploy a new frontend version while pending mutations exist.
- Corrupt or reject a GAS response and retain actionable diagnostic state.

### Real Devices

- At least one current Android device and one current iPhone.
- Installation, standalone launch, safe-area layout, mobile navigation, and update behavior.
- Slow, intermittent, and disconnected network conditions.
- Every current view, form, chart, report, map, and 3D view at mobile sizes.
- Verification that fixed navigation and status controls do not hide content or submission actions.

## 15. Rollout

1. Validate locally and on a Vercel preview deployment.
2. Pilot on one Android device and one iPhone.
3. Run a field pilot with two or three users.
4. Review queue failures, conflicts, storage usage, and sync latency.
5. Roll out the same Vercel production URL to the approximately ten-person team.
6. Keep the existing browser workflow available during the pilot as an operational fallback.

## 16. Acceptance Criteria

The design is successfully implemented when:

- Android and iPhone users can install the Vercel application without an app store.
- Every current page opens in the installed app.
- Previously loaded pages and data remain usable offline.
- Offline writes survive normal application and device-browser restarts when site data has not been cleared or removed by the operating system.
- Returning online synchronizes every valid queued mutation exactly once.
- Concurrent edits produce a visible conflict and never silently overwrite data.
- App updates preserve local business data, pending mutations, and conflicts.
- Users can always distinguish local-only, pending, conflicted, and server-confirmed records.
- The initial ten-person team completes the staged pilot without lost or duplicated business records.
