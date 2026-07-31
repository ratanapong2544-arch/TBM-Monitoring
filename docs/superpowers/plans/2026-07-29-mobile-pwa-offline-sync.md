# Mobile PWA Offline Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ Tunnel Monitoring ติดตั้งจาก Vercel ได้บน Android/iPhone เปิดข้อมูลล่าสุดและบันทึกได้เมื่อออฟไลน์ ซิงก์แบบไม่สร้างข้อมูลซ้ำ และหยุดให้ผู้ใช้ตรวจสอบเมื่อข้อมูลชนกัน

**Architecture:** React เดิมอ่านและเขียนข้อมูลผ่าน offline repository กลาง ซึ่งใช้ IndexedDB เป็น durable store และ sync runner เป็นผู้ส่ง mutation ไป GAS. Service worker เก็บ application shell; GAS ใช้ request idempotency และ optimistic versioning โดยเก็บ metadata แยกจากชีตธุรกิจเดิมเพื่อรักษา backward compatibility.

**Tech Stack:** React 18, Create React App 5, Tailwind CSS 3.4.19, IndexedDB via `idb` 8.0.3, `fake-indexeddb` 6.2.5, Workbox Build 7.4.1, Google Apps Script V8, Google Sheets, Jest/jsdom, Node test runner

## Global Constraints

- Frontend repository root คือ `TunnelBoringMonitoring/`; GAS ตัวจริงคือ `D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live\Code.js`.
- ห้ามแก้ `TunnelBoringMonitoring/gas/`; โฟลเดอร์นี้มีเอกสารเท่านั้น.
- GAS deploy แบบ manual จาก `gas-live/`: `clasp push -f` แล้ว `clasp redeploy AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw`.
- Frontend production URL อยู่บน Vercel HTTPS และ PWA ใช้ `start_url`/`scope` เป็น `/`.
- รองรับ Android และ iPhone; iPhone ติดตั้งด้วย Safari → Share → Add to Home Screen.
- ทุกหน้าต้องเปิดได้จาก installed shell; ข้อมูลที่ไม่เคยโหลดมาก่อนต้องแสดง empty state ไม่สร้างข้อมูลสมมติ.
- Ring number และค่าทางวิศวกรรมต้องใช้ validation เดิม; ห้ามสร้างหรือแก้ค่าขึ้นเอง.
- เวลาใน UI และ domain logic ใช้ Asia/Bangkok; server audit timestamp ใช้ ISO string.
- ไม่มี login ใน release นี้; `actorId` เป็น `null` และ `deviceId` แยกเป็น installation identity.
- ห้ามเก็บ secret หรือ API key ใน client bundle.
- ข้อมูล business, pending mutation และ conflict ห้ามถูก app ลบอัตโนมัติ.
- Background Sync เป็น progressive enhancement เท่านั้น; sync หลักต้องทำตอน app เปิด, focus, online event และผู้ใช้กด “ซิงก์ตอนนี้”.
- ArcGIS tile URL ปัจจุบันไม่ถูก cache offline จนกว่าจะมีสิทธิ์ cache ที่ยืนยันแล้ว; หน้าแผนที่ยังเปิด route/marker จาก local data โดยพื้นหลังอาจว่าง.
- Baseline ณ 2026-07-29: `npm test -- --watchAll=false --runInBand` ผ่าน 50 suites / 600 tests.
- ทุก task ต้องจบด้วย test เฉพาะ task และ full regression ที่เกี่ยวข้องก่อน commit.
- **Promotion gate (เพิ่มหลัง review ของ Task 7): Task 7, 8 และ 9 ต้อง deploy พร้อมกัน — ห้าม deploy Task 7 เดี่ยวๆ.** Task 2 + 7 ทำให้แอพเปิดและใช้งาน offline ได้ ซึ่งเปิดทางให้ hole เดิมเกิดจริงเป็นครั้งแรก: server response ที่ไม่ว่างยังเขียนทับ localStorage-primary collections ทั้งชุด (`App.jsx`, สาขา `serverAuthoritative`) ดังนั้น record ที่สร้างตอน offline แล้ว `apiCall` ไม่เคยสำเร็จ จะถูกลบทิ้งทันทีที่ server ตอบครั้งแรก. offline **read** เป็นของใหม่ แต่ offline **write** ที่ทนทานมากับ mutation queue (Task 8) และ legacy reconciliation (Task 9). ดู `docs/superpowers/task7-completion.md` และ Task 12 Step 5.

---

## File and Interface Map

### Build and installability

- `tailwind.config.js` — local Tailwind theme/content scan; แทน CDN config ใน `public/index.html`.
- `tools/generate-pwa-icons.mjs` — สร้าง PNG 180/192/512 และ maskable 512 จาก `public/favicon.svg`.
- `tools/build-service-worker.mjs` — รัน Workbox `injectManifest` หลัง CRA build.
- `src/pwa/service-worker.js` — precache, navigation fallback, bounded same-origin runtime cache, update message.
- `src/pwa/registerServiceWorker.js` — registration/update callbacks.
- `src/pwa/useInstallPrompt.js` — Android prompt, iOS/standalone detection.

### Offline data core

- `src/offline/schema.js` — store names, entity types, mutation statuses, legacy keys.
- `src/offline/db.js` — เปิด/upgrade/close IndexedDB.
- `src/offline/device.js` — `getOrCreateDeviceId()` and device label.
- `src/offline/domainKey.js` — stable identity shared by client/GAS contract tests.
- `src/offline/snapshotStore.js` — confirmed snapshot/entity persistence.
- `src/offline/mutationStore.js` — queue/conflict state persistence.
- `src/offline/legacyMigration.js` — copy legacy business `localStorage` into IndexedDB and flag differences for review.
- `src/offline/apiTransport.js` — GAS read/sync transport and typed errors.
- `src/offline/normalizeServerData.js` — current `App.jsx` parsing moved to a pure module.
- `src/offline/repository.js` — read/refresh/mutate/resolve interface used by React.
- `src/offline/syncRunner.js` — deterministic queue processor and retry schedule.

### React integration

- `src/offline/OfflineProvider.jsx` — singleton repository/runner and observable app state.
- `src/offline/useOfflineData.js` — hydrate active machine from IndexedDB then refresh.
- `src/components/offline/NetworkStatusButton.jsx` — online/offline and counts.
- `src/components/offline/SyncCenter.jsx` — pending/error/conflict/recent tabs.
- `src/components/offline/ConflictResolver.jsx` — field comparison and resolution.
- `src/components/offline/InstallAppPanel.jsx` — Android/iPhone installation guidance.
- `src/components/offline/UpdateAvailableBanner.jsx` — safe service-worker reload.

### Backend

- `../gas-live/Code.js` — `SyncMeta`, `SyncRequests`, `syncMutation`, version checks, idempotency, backward-compatible metadata bump.
- `tools/gas-sync-contract.test.cjs` — imports guarded pure GAS helpers and checks shared contract vectors.
- `tools/sync-domain-vectors.json` — exact client/GAS identity vectors.

### Public contracts

```js
repository.load(machine)
// -> Promise<{ data, source: "indexeddb"|"empty", fetchedAt, stale }>

repository.refresh(machine, { signal })
// -> Promise<{ data, source: "server", fetchedAt, stale: false, cacheError?, serverPayload }>
// `data` is the merged snapshot to render; `serverPayload` is the raw GAS response, for callers
// asking "is this on the sheet?" (interim, added in Task 7 — Task 8 Step 4 removes it).
// `data.present` flags which collections the response actually CARRIED — the normalizer maps an
// absent key to [], so without it "the server has none" and "this response omitted them" are the
// same value. It must be carried across `writeServerSnapshot`, which rebuilds its return object
// from `emptyServerData` and silently drops anything not copied over.

repository.mutate({
  entityType, operation, machine, recordId, domainKey, baseVersion, payload
})
// -> Promise<{ requestId, status: "pending", optimisticRecord }>

repository.resolveConflict(conflictId, {
  strategy: "server"|"local"|"manual", payload
})
// -> Promise<{ status: "resolved"|"pending", requestId?: string }>

repository.getSyncSummary()
// -> Promise<{ online, lastSyncedAt, pending, syncing, conflicts, errors }>

repository.subscribe(listener)
// -> () => void

syncRunner.runNow()
// -> Promise<{ attempted, synced, conflicts, errors }>
```

Mutation envelope sent to GAS:

```js
{
  requestId,
  entityType,
  operation,
  machine,
  recordId,
  domainKey,
  baseVersion,
  deviceId,
  actorId: null,
  createdAtLocal,
  payload
}
```

---

### Task 1: Make the production bundle self-contained and installable

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tailwind.config.js`
- Modify: `public/index.html`
- Modify: `public/manifest.json`
- Create: `tools/generate-pwa-icons.mjs`
- Create: `public/icons/icon-180.png`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-maskable-512.png`
- Create: `tools/pwa-manifest.test.cjs`

**Interfaces:**
- Consumes: existing `src/styles/globals.css` Tailwind directives and `public/favicon.svg`.
- Produces: a CRA build with no Tailwind CDN dependency and a valid install manifest.

- [ ] **Step 1: Add the manifest/installability test first**

Create `tools/pwa-manifest.test.cjs`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

test("manifest is a standalone root-scoped installable app", () => {
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((x) => x.sizes === "192x192"));
  assert.ok(manifest.icons.some((x) => x.sizes === "512x512" && x.purpose === "maskable"));
});

test("production html has no runtime Tailwind CDN dependency", () => {
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.match(html, /apple-touch-icon/);
  for (const name of ["icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    assert.ok(fs.existsSync(path.join(root, "public/icons", name)), name);
  }
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `node --test tools/pwa-manifest.test.cjs`

Expected: FAIL because `manifest.id`, `scope`, PNG icons, and local Tailwind conversion do not exist yet.

- [ ] **Step 3: Install exact dependencies**

Run:

```powershell
npm install idb@8.0.3
npm install --save-dev fake-indexeddb@6.2.5 tailwindcss@3.4.19 workbox-build@7.4.1 sharp@0.35.3
```

Expected: `package.json` and `package-lock.json` change; no dependency install error.

- [ ] **Step 4: Move the existing CDN theme into `tailwind.config.js`**

Create:

```js
module.exports = {
  content: ["./public/index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT:"#003B84", dark:"#0C2C65", deepest:"#00246C", pressed:"#001A57" },
        cyan: { DEFAULT:"#38A7CE", med:"#1E80BD", tint:"#E5F1FF", vtint:"#F5FAFF" },
        sgreen: { dark:"#10463A", med:"#44C473" },
        code: { a:"#10463A", b:"#B8860B", c:"#C8500A", d:"#B91C1C" },
        ink: { DEFAULT:"#333333", 2:"#666666", 3:"#999999" },
        surface: { DEFAULT:"#FFFFFF", page:"#F8FAFD", alt:"#F5FAFF" },
        line: { DEFAULT:"#E8E8E8", input:"#D8D8D8", divider:"#F0F0F0" },
      },
      borderRadius: { badge:"4px", input:"6px", button:"6px", card:"8px", modal:"12px" },
      boxShadow: {
        card:"0 1px 2px rgba(0,59,132,0.04)",
        hover:"0 2px 8px rgba(0,59,132,0.06)",
        modal:"0 12px 32px rgba(12,44,101,0.18)",
      },
      fontFamily: {
        sans:['"IBM Plex Sans Thai"','"IBM Plex Sans"',"sans-serif"],
        mono:['"IBM Plex Mono"',"Consolas","monospace"],
      },
    },
  },
  plugins: [],
};
```

Remove the Tailwind `<script>` and inline `tailwind.config` block from `public/index.html`. Add:

```html
<meta name="theme-color" content="#0C2C65" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Tunnel Monitor" />
<link rel="apple-touch-icon" sizes="180x180" href="%PUBLIC_URL%/icons/icon-180.png" />
```

- [ ] **Step 5: Add reproducible icon generation**

Create `tools/generate-pwa-icons.mjs` using `sharp`:

```js
import sharp from "sharp";
import fs from "node:fs/promises";

await fs.mkdir("public/icons", { recursive: true });
const source = "public/favicon.svg";
for (const size of [180, 192, 512]) {
  await sharp(source)
    .resize(size, size, { fit: "contain", background: "#0C2C65" })
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
await sharp(source)
  .resize(320, 320, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 96, bottom: 96, left: 96, right: 96, background: "#0C2C65" })
  .png()
  .toFile("public/icons/icon-maskable-512.png");
```

Run: `node tools/generate-pwa-icons.mjs`

- [ ] **Step 6: Replace `public/manifest.json` with the approved contract**

```json
{
  "id": "/",
  "short_name": "Tunnel Monitor",
  "name": "Tunnel Monitoring System",
  "description": "TBM field monitoring and reporting",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#0C2C65",
  "background_color": "#F8FAFD",
  "icons": [
    { "src": "/icons/icon-192.png", "type": "image/png", "sizes": "192x192", "purpose": "any" },
    { "src": "/icons/icon-512.png", "type": "image/png", "sizes": "512x512", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 7: Verify manifest, build, and regression**

Run:

```powershell
node --test tools/pwa-manifest.test.cjs
npm run build
npm test -- --watchAll=false --runInBand
```

Expected: manifest test PASS, CRA build PASS with compiled Tailwind CSS, 50 existing suites / 600 existing tests still PASS.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json tailwind.config.js public/index.html public/manifest.json public/icons tools/generate-pwa-icons.mjs tools/pwa-manifest.test.cjs
git commit -m "build: make mobile bundle installable offline"
```

---

### Task 2: Build and register the service worker safely

**Files:**
- Modify: `package.json`
- Create: `src/pwa/service-worker.js`
- Create: `tools/build-service-worker.mjs`
- Create: `tools/pwa-build.test.cjs`
- Create: `src/pwa/registerServiceWorker.js`
- Create: `src/pwa/registerServiceWorker.test.js`
- Modify: `src/index.tsx`

**Interfaces:**
- Produces: `registerServiceWorker({ onUpdate, onOfflineReady }) -> unregister`.
- Produces: service-worker messages `SKIP_WAITING` and `CACHE_UPDATED`.
- Consumes: Task 1 self-contained assets.

- [ ] **Step 1: Write the registration tests**

Create `src/pwa/registerServiceWorker.test.js`:

```js
import { registerServiceWorker } from "./registerServiceWorker";

test("does not register outside production", async () => {
  const register = jest.fn();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  await registerServiceWorker({ env: "development" });
  expect(register).not.toHaveBeenCalled();
});

test("reports a waiting worker as an available update", async () => {
  const waiting = { postMessage: jest.fn() };
  const registration = { waiting, addEventListener: jest.fn() };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: jest.fn().mockResolvedValue(registration), addEventListener: jest.fn() },
  });
  const onUpdate = jest.fn();
  await registerServiceWorker({ env: "production", onUpdate });
  expect(onUpdate).toHaveBeenCalledWith(registration);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false --runInBand src/pwa/registerServiceWorker.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the service-worker source**

`src/pwa/service-worker.js` must:

- precache every `self.__WB_MANIFEST` URL;
- use cache-first for same-origin hashed static assets;
- use cached `/index.html` as navigation fallback;
- runtime-cache same-origin images, `.glb`, and `.html`;
- cap runtime entries at 80 by deleting oldest cache keys;
- exclude GAS POST, Gemini, localhost PDF helper, and ArcGIS tile requests;
- respond to `{ type: "SKIP_WAITING" }`.

Core structure:

```js
const MANIFEST = self.__WB_MANIFEST;
const hash = MANIFEST.map((x) => x.revision || x.url).join("|")
  .split("").reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 7).toString(16);
const PRECACHE = `tbm-precache-${hash}`;
const RUNTIME = "tbm-runtime-v1";
const PRECACHE_URLS = MANIFEST.map((x) => x.url);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tbm-precache-") && k !== PRECACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
```

Implement fetch branches explicitly; never cache non-GET requests.

- [ ] **Step 4: Add Workbox injection build**

Create `tools/build-service-worker.mjs`:

```js
import { injectManifest } from "workbox-build";

const result = await injectManifest({
  swSrc: "src/pwa/service-worker.js",
  swDest: "build/service-worker.js",
  globDirectory: "build",
  globPatterns: ["**/*.{html,js,css,json,svg,png,jpg,jpeg,webp,woff,woff2,ttf,glb}"],
  globIgnores: ["service-worker.js", "asset-manifest.json"],
  maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
});
if (!result.count) throw new Error("service worker precache manifest is empty");
console.log(`service worker: ${result.count} files, ${result.size} bytes`);
```

Change scripts:

```json
"build": "react-scripts build && node tools/build-service-worker.mjs",
"test:pwa": "npm run build && node --test tools/pwa-manifest.test.cjs tools/pwa-build.test.cjs"
```

- [ ] **Step 5: Implement registration and entrypoint wiring**

`registerServiceWorker` must return early for non-production, unsupported browsers, or non-HTTPS/non-localhost origins. It registers `/service-worker.js`, calls `onUpdate(registration)` when `registration.waiting` exists or an installing worker reaches `installed` while a controller exists, and calls `onOfflineReady(registration)` for the first install.

In `src/index.tsx`, call it after render:

```js
registerServiceWorker({
  env: process.env.NODE_ENV,
  onUpdate: (registration) => window.dispatchEvent(new CustomEvent("tbm:pwa-update", { detail: registration })),
  onOfflineReady: () => window.dispatchEvent(new Event("tbm:pwa-ready")),
});
```

- [ ] **Step 6: Add production artifact test**

`tools/pwa-build.test.cjs` reads `build/service-worker.js` and asserts:

```js
assert.doesNotMatch(sw, /self\.__WB_MANIFEST/);
assert.match(sw, /tbm-precache-/);
assert.match(sw, /SKIP_WAITING/);
assert.ok(fs.existsSync(path.join(root, "build/index.html")));
```

- [ ] **Step 7: Run targeted and full verification**

```powershell
npm test -- --watchAll=false --runInBand src/pwa/registerServiceWorker.test.js
npm run test:pwa
npm test -- --watchAll=false --runInBand
```

Expected: all commands PASS; `build/service-worker.js` exists and contains an injected manifest.

- [ ] **Step 8: Commit**

```powershell
git add package.json src/pwa tools/build-service-worker.mjs tools/pwa-build.test.cjs src/index.tsx
git commit -m "feat: add offline application shell"
```

---

### Task 3: Add IndexedDB schema, device identity, and safe legacy import

**Files:**
- Create: `src/offline/schema.js`
- Create: `src/offline/db.js`
- Create: `src/offline/device.js`
- Create: `src/offline/domainKey.js`
- Create: `src/offline/legacyMigration.js`
- Create: `src/offline/db.test.js`
- Create: `src/offline/legacyMigration.test.js`
- Create: `tools/sync-domain-vectors.json`

**Interfaces:**
- Produces: `openOfflineDb()`, `closeOfflineDb()`, `deleteOfflineDbForTests()`.
- Produces: `getOrCreateDeviceId(db)`.
- Produces: `makeDomainKey({ entityType, machine, recordId, payload })`.
- Produces: `stageLegacyLocalStorage(db, storage)` and `reconcileLegacyStage(db, serverData)`.

- [ ] **Step 1: Write database and domain identity tests**

Use `fake-indexeddb/auto` at the top of test files. Required assertions:

```js
test("creates all durable stores", async () => {
  const db = await openOfflineDb();
  expect([...db.objectStoreNames]).toEqual(expect.arrayContaining([
    "entities", "snapshots", "mutations", "conflicts", "syncMeta", "deviceMeta"
  ]));
});

test("device id is stable for one installation", async () => {
  const db = await openOfflineDb();
  expect(await getOrCreateDeviceId(db)).toBe(await getOrCreateDeviceId(db));
});

test("ring domain keys include entity and machine", () => {
  expect(makeDomainKey({
    entityType: "segment", machine: "TBM1", recordId: "s1",
    payload: { ringNo: "P41", installType: "Permanent" }
  })).toBe("segment:TBM1:P41:Permanent");
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false --runInBand src/offline/db.test.js src/offline/legacyMigration.test.js`

Expected: FAIL because offline modules do not exist.

- [ ] **Step 3: Define exact schema constants**

`schema.js`:

```js
export const DB_NAME = "tbm-monitoring";
export const DB_VERSION = 1;
export const STORES = Object.freeze({
  entities: "entities",
  snapshots: "snapshots",
  mutations: "mutations",
  conflicts: "conflicts",
  syncMeta: "syncMeta",
  deviceMeta: "deviceMeta",
});
export const MUTATION_STATUS = Object.freeze({
  PENDING: "pending", SYNCING: "syncing", SYNCED: "synced",
  VALIDATION_ERROR: "validation_error", CONFLICT: "conflict",
  PERMANENT_ERROR: "permanent_error",
});
export const LEGACY_KEYS = [
  "tbmIssues", "tbmDailyReports", "tbmPrepTasks_TBM1", "tbmPrepTasks_TBM2",
  "tbmPlanConfig", "tbmDistancePlanConfig", "tbmDistancePlanConfig__TBM2",
  "tbmRouteConfig", "tbmRouteConfig__TBM2",
  "instLocations", "instInstruments", "instThresholds", "instReadings", "instSchedules"
];
```

`db.js` creates:

- `entities`, keyPath `key`, indexes `entityType`, `machine`, `domainKey`;
- `snapshots`, keyPath `scopeKey`;
- `mutations`, keyPath `requestId`, indexes `status`, `createdAtLocal`, `domainKey`;
- `conflicts`, keyPath `conflictId`, indexes `status`, `domainKey`;
- `syncMeta`, keyPath `key`;
- `deviceMeta`, keyPath `key`.

- [ ] **Step 4: Implement stable device and domain identity**

Use `crypto.randomUUID()` when present; fallback to `device-${Date.now()}-${randomHex}`. Save under `deviceMeta/deviceId`.

Domain key rules:

| Entity | Domain key |
|---|---|
| segment | `segment:{machine}:{ringNo}:{installType\|Permanent}` |
| grout | `grout:{machine}:{ringNo}:{groutPass\|Primary}` |
| secondaryGrout | `secondaryGrout:{machine}:{ringNo}:{recordId}` |
| shiftReport | `shiftReport:{machine}:{date}:{shift}` |
| issue/dailyReport/prepTask/instrument/instReading/instSchedule | `{entityType}:{machine\|GLOBAL}:{recordId}` |
| planConfig/distPlanConfig/routeConfig | `{entityType}:{machine}` |

Store the same examples in `tools/sync-domain-vectors.json`; later GAS tests consume this file.

- [ ] **Step 5: Implement non-destructive legacy staging**

`stageLegacyLocalStorage`:

- copies every parseable `LEGACY_KEYS` value into `syncMeta` key `legacy:{localStorageKey}`;
- records `legacyStagedAt`;
- never deletes or changes `localStorage`;
- records malformed keys with `{ parseError: true, raw }`.

`reconcileLegacyStage`:

- compares staged records with server records by `id` or config domain key;
- identical records are marked `confirmed`;
- local-only or different records create `conflicts` with `reason: "legacy_local_difference"`;
- does not enqueue a write automatically.

- [ ] **Step 6: Run tests**

```powershell
npm test -- --watchAll=false --runInBand src/offline/db.test.js src/offline/legacyMigration.test.js
npm test -- --watchAll=false --runInBand
```

Expected: targeted tests and all regression tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/offline tools/sync-domain-vectors.json
git commit -m "feat: add durable offline storage"
```

---

### Task 4: Extract server normalization and implement offline-first reads

**Files:**
- Create: `src/offline/apiTransport.js`
- Create: `src/offline/apiTransport.test.js`
- Create: `src/offline/normalizeServerData.js`
- Create: `src/offline/normalizeServerData.test.js`
- Create: `src/offline/snapshotStore.js`
- Create: `src/offline/snapshotStore.test.js`
- Create: `src/offline/repository.js`
- Create: `src/offline/repository.read.test.js`
- Modify: `src/utils/api.js`

**Interfaces:**
- Produces: `fetchServerSnapshot(machine, { signal })`.
- Produces: `normalizeServerData(result, machine)`.
- Produces: `writeServerSnapshot(db, machine, data, fetchedAt)` / `readServerSnapshot(db, machine)`.
- Produces: `createRepository(deps)` read methods from the public contract.

- [ ] **Step 1: Write transport classification tests**

Required cases:

```js
test.each([
  [429, "retryable"], [500, "retryable"], [503, "retryable"], [400, "permanent"], [422, "validation"]
])("classifies HTTP %s as %s", (status, kind) => {
  expect(classifyHttpFailure(status).kind).toBe(kind);
});

test("HTML permission response is permanent", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "<html>permission</html>" });
  await expect(fetchServerSnapshot("TBM1")).rejects.toMatchObject({ kind: "permanent" });
});
```

- [ ] **Step 2: Write normalization parity tests before moving logic**

Copy representative raw segment, grout positions, secondary grout, shift report JSON, issues, daily reports, prep tasks, configs, and instrument arrays into `normalizeServerData.test.js`. Assert the normalized result matches current `App.jsx` behavior, including numeric grout totals and parsed time fields.

- [ ] **Step 3: Run and verify failure**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/offline/apiTransport.test.js src/offline/normalizeServerData.test.js src/offline/snapshotStore.test.js src/offline/repository.read.test.js
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement transport without changing legacy callers**

Keep `apiCall(action, data)` for online-only features. Add a shared parser:

```js
export async function parseGasResponse(response) {
  const text = await response.text();
  if (text.trim().startsWith("<")) throw new ApiFailure("permanent", "GAS_PERMISSION_HTML");
  const parsed = JSON.parse(text);
  if (parsed.status === "error") throw ApiFailure.fromGas(parsed);
  return parsed;
}
```

`fetchServerSnapshot` calls `${GAS_URL}?action=getData&machine=${encodeURIComponent(machine)}` with `redirect: "follow"` and `signal`.

- [ ] **Step 5: Move all parsing out of `App.jsx`**

`normalizeServerData(result, machine)` returns these exact keys:

```js
{
  machine, segments, grouts, secondaryGrouts, shiftReports,
  issues, dailyReports, prepTasks, planConfig, distPlanConfig,
  routeConfigs, routeProjectTotal, machineProgress,
  instLocations, instInstruments, instThresholds, instReadings, instSchedules,
  syncMeta
}
```

Keep `syncMeta` as `{}` when an older GAS deployment does not return it.

- [ ] **Step 6: Implement atomic snapshot persistence**

`writeServerSnapshot` writes normalized entities and snapshot metadata in one readwrite transaction. The snapshot key is `getData:${machine}` and includes `fetchedAt`, `entityKeys`, and singleton/config values. `readServerSnapshot` reconstructs the same object shape.

Server-confirmed data must not erase optimistic entities with a pending mutation; merge them by `domainKey` and retain `syncStatus: "pending"`.

- [ ] **Step 7: Implement repository read behavior**

`load(machine)` returns IndexedDB immediately or an explicit empty shape. `refresh(machine)` fetches, normalizes, writes atomically, emits subscribers, and returns server data. If refresh fails and a snapshot exists, callers retain it and receive the typed error separately.

- [ ] **Step 8: Run targeted and regression tests**

```powershell
npm test -- --watchAll=false --runInBand src/offline/apiTransport.test.js src/offline/normalizeServerData.test.js src/offline/snapshotStore.test.js src/offline/repository.read.test.js
npm test -- --watchAll=false --runInBand
```

- [ ] **Step 9: Commit**

```powershell
git add src/offline src/utils/api.js
git commit -m "feat: add offline-first data repository"
```

---

### Task 5: Implement durable mutation queue and deterministic sync runner

**Files:**
- Create: `src/offline/mutationStore.js`
- Create: `src/offline/mutationStore.test.js`
- Create: `src/offline/syncRunner.js`
- Create: `src/offline/syncRunner.test.js`
- Modify: `src/offline/apiTransport.js`
- Modify: `src/offline/repository.js`
- Create: `src/offline/repository.write.test.js`

**Interfaces:**
- Produces: repository `mutate`, `resolveConflict`, `getSyncSummary`.
- Produces: `postSyncMutation(mutation)`.
- Produces: `createSyncRunner({ repository, transport, clock, online, events })`.

- [ ] **Step 1: Write queue persistence and idempotency tests**

Required test:

```js
test("queues before any network call and keeps the same requestId on retry", async () => {
  const repo = makeRepository({ transport: { postSyncMutation: jest.fn().mockRejectedValue(retryable()) } });
  const queued = await repo.mutate(segmentInput);
  expect((await repo.getMutation(queued.requestId)).status).toBe("pending");
  await runner.runNow();
  await runner.runNow();
  const ids = transport.postSyncMutation.mock.calls.map(([m]) => m.requestId);
  expect(new Set(ids)).toEqual(new Set([queued.requestId]));
});
```

Also test persistence after closing/reopening DB, and that a synced mutation replaces the optimistic record with the server-confirmed record.

- [ ] **Step 2: Write retry/conflict tests**

Use a fake clock. Exact retry delays are `min(300000, 2000 * 2 ** attemptCount) + deterministicJitter`, where injected `jitter()` returns 0 in tests.

Assert:

- retryable failure → `pending`, incremented attempts, future `nextAttemptAt`;
- validation → `validation_error`, no automatic retry;
- `status: "conflict"` → conflict record and mutation `conflict`;
- permanent malformed response → `permanent_error`;
- one failed domain key does not prevent an unrelated queued item from syncing.

- [ ] **Step 3: Run and verify failure**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/offline/mutationStore.test.js src/offline/syncRunner.test.js src/offline/repository.write.test.js
```

- [ ] **Step 4: Implement mutation creation as one transaction**

`repository.mutate` must:

1. validate required envelope fields;
2. get stable `deviceId`;
3. generate one `requestId`;
4. write optimistic entity and mutation in one transaction;
5. emit state only after transaction completion;
6. never call the network directly.

- [ ] **Step 5: Implement transport response contract**

`postSyncMutation` POSTs:

```js
{ action: "syncMutation", data: mutation }
```

It returns one of:

```js
{ status: "success", requestId, record, version, updatedAt }
{ status: "conflict", requestId, serverRecord, localRecord, conflictingFields, currentVersion }
{ status: "validation_error", requestId, fields, message }
```

Timeout uses `AbortController` at 15 seconds and is classified retryable.

- [ ] **Step 6: Implement runner triggers**

`start()` attaches `online`, `focus`, and `visibilitychange` listeners. It runs only when `document.visibilityState !== "hidden"` and online. `stop()` removes all listeners. `runNow()` has a single-flight guard so two triggers cannot process the same queue concurrently.

- [ ] **Step 7: Implement resolution semantics**

- `server`: replace optimistic entity with server record, mark original mutation resolved.
- `local`: enqueue a new mutation using server `currentVersion`.
- `manual`: require explicit payload, enqueue against server `currentVersion`.
- retain original conflict with `resolvedAt`, `strategy`, and before/after values.

- [ ] **Step 8: Run targeted and full tests**

```powershell
npm test -- --watchAll=false --runInBand src/offline/mutationStore.test.js src/offline/syncRunner.test.js src/offline/repository.write.test.js
npm test -- --watchAll=false --runInBand
```

- [ ] **Step 9: Commit**

```powershell
git add src/offline
git commit -m "feat: add durable sync queue"
```

---

### Task 6: Add GAS idempotency and optimistic version checks

**Files:**
- Modify outside repo: `D:\TEAM\Knowlegh\App\Tunnel Boring App - Copy\gas-live\Code.js`
- Create: `tools/gas-sync-contract.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: mutation envelope and domain vectors from Tasks 3 and 5.
- Produces: `getData.syncMeta` and `syncMutation` response contract.

- [ ] **Step 1: Back up the exact deployed source before editing**

Run in `gas-live/`:

```powershell
$source = (Resolve-Path '.\Code.js').Path
$backup = Join-Path (Split-Path $source) 'Code.js.pre-pwa-sync'
Copy-Item -LiteralPath $source -Destination $backup
Get-FileHash -Algorithm SHA256 -LiteralPath $source,$backup
```

Expected: both SHA256 values match. Do not overwrite an existing backup; if it exists, use `Code.js.pre-pwa-sync-YYYYMMDD-HHmm`.

- [ ] **Step 2: Add contract tests before backend implementation**

Create `tools/gas-sync-contract.test.cjs` which loads `tools/sync-domain-vectors.json`, requires `../../gas-live/Code.js`, and tests exported pure helpers:

```js
const { makeSyncRecordKey_, checkSyncVersion_, buildSyncResponse_ } =
  require("../../gas-live/Code.js");

test("client and GAS produce the same domain keys", () => {
  for (const vector of vectors) {
    assert.equal(makeSyncRecordKey_(vector.input), vector.expected);
  }
});
test("stale base version is a conflict", () => {
  assert.deepEqual(checkSyncVersion_(2, 3), { ok: false, currentVersion: 3 });
});
test("matching base version advances exactly once", () => {
  assert.deepEqual(checkSyncVersion_(3, 3), { ok: true, nextVersion: 4 });
});
```

Add script:

```json
"test:gas-sync": "node --test tools/gas-sync-contract.test.cjs"
```

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:gas-sync`

Expected: FAIL because GAS pure helpers are not exported.

- [ ] **Step 4: Add additive sync sheets**

In `Code.js` add:

```js
const SYNC_META_HEADERS = ['recordKey','entityType','machine','recordId','version','updatedAt','updatedByDevice','deleted'];
const SYNC_REQUEST_HEADERS = ['requestId','status','responseJson','createdAt'];
```

`setupSheets()` calls:

```js
ensureSheet_(ss, 'SyncMeta', SYNC_META_HEADERS);
ensureSheet_(ss, 'SyncRequests', SYNC_REQUEST_HEADERS);
```

No existing business column is removed or reordered.

- [ ] **Step 5: Add pure contract helpers and guarded Node exports**

Implement the same domain-key rules as Task 3. Add at file end:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { makeSyncRecordKey_, checkSyncVersion_, buildSyncResponse_ };
}
```

Apps Script ignores this branch because `module` is undefined.

- [ ] **Step 6: Add idempotency lookup before applying a mutation**

Under the existing script lock:

1. Look up `requestId` in `SyncRequests`.
2. If present, parse and return the stored `responseJson`.
3. Otherwise look up current metadata by `domainKey`.
4. Compare `baseVersion` with current version.
5. On mismatch, call `readSyncDomainRecord_(ss, entityType, machine, recordId, domainKey)` to read the current row/config, compare every submitted payload key except image binary fields, and return `serverRecord`, `localRecord`, and a sorted `conflictingFields` array.
6. On match, apply the mapped domain action, bump metadata, persist the exact response in `SyncRequests`, and return it.

`readSyncDomainRecord_` uses ID lookup for normal rows, the ring/config domain key for create conflicts, JSON-row decoding for daily/prep data, and PlanConfig key lookup for plan/route configs. If metadata exists but the business row is missing, it returns a validation error with diagnostic code `SYNC_META_ORPHAN` rather than recreating a guessed row.

Allowed mapping:

| Entity | create/update/delete |
|---|---|
| segment | addSegment / updateSegment / deleteSegment |
| grout | addGrout / updateGrout / deleteGrout |
| secondaryGrout | addSecondaryGrout / updateSecondaryGrout / deleteSecondaryGrout |
| shiftReport | addShiftReport / updateShiftReport / no delete |
| issue | saveIssue / saveIssue / deleteIssue |
| dailyReport | saveDailyReport / saveDailyReport / deleteDailyReport |
| prepTask | savePrepTask / savePrepTask / deletePrepTask |
| planConfig, distPlanConfig | savePlanConfig / savePlanConfig / no delete |
| routeConfig | saveRouteConfig / saveRouteConfig / no delete |
| instrument | updateInstrument / updateInstrument / no delete |
| instReading | addInstReading / updateInstReading / deleteInstReading |
| instSchedule | saveInstSchedule / saveInstSchedule / no delete |

Unknown entity/operation returns `validation_error` and does not write any sheet.

- [ ] **Step 7: Make legacy writes advance metadata**

Keep current actions working during rollout. After a successful legacy write, calculate its domain key and bump `SyncMeta` with `updatedByDevice: "legacy-client"`. This makes an offline PWA mutation based on an older version conflict instead of silently overwriting a write from an old browser tab.

- [ ] **Step 8: Return sync metadata with reads**

`doGet` adds:

```js
syncMeta: getSyncMetaMap_(ss)
```

The map is keyed by `recordKey`; old frontend code ignores this additive field.

- [ ] **Step 9: Verify backend locally**

```powershell
node -c '..\gas-live\Code.js'
npm run test:gas-sync
npm test -- --watchAll=false --runInBand
```

Expected: syntax PASS, GAS contract tests PASS, frontend regression PASS.

- [ ] **Step 10: Commit repository-owned test assets**

`gas-live/Code.js` is outside this Git repository and cannot be included in this commit. Commit the contract and script only:

```powershell
git add package.json tools/gas-sync-contract.test.cjs tools/sync-domain-vectors.json
git commit -m "test: lock GAS sync contract"
```

- [ ] **Step 11: Deploy GAS and perform a non-destructive smoke check**

From `gas-live/`:

```powershell
clasp push -f
clasp redeploy AKfycbyRUl5BVmZYDhw_Z0Uo2LWBLmaQAaOjJZR4jLGw-MuxHIFcKEhu7FBF9tV33JAnKz1aTw
```

Open Apps Script editor and run `setupSheets()` once as owner. Then GET `?action=getData&machine=TBM1` and verify `status:"success"` plus `syncMeta`. Do not submit a production business mutation during this smoke check.

Rollback if deploy fails: restore the verified `Code.js.pre-pwa-sync*`, run `clasp push -f`, and redeploy the same deployment ID.

---

### Task 7: Hydrate React from IndexedDB and show stale/offline state

**Files:**
- Create: `src/offline/OfflineProvider.jsx`
- Create: `src/offline/useOfflineData.js`
- Create: `src/offline/useOfflineData.test.js`
- Modify: `src/index.tsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: `useOffline()` with `{ repository, runner, syncSummary, refreshSummary }`.
- Produces: `useOfflineData(machine)` with `{ data, loading, refreshing, stale, source, error, refresh }`.
- Consumes: repository from Tasks 4–5.

- [ ] **Step 1: Write hook behavior tests**

Test with injected fake repository:

- cached data renders before `refresh` resolves;
- no snapshot returns explicit empty arrays and `source:"empty"`;
- refresh failure retains cached data and sets `stale:true`;
- machine switch ignores a late response from the previous machine;
- online refresh writes server data and clears stale state.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false --runInBand src/offline/useOfflineData.test.js`

- [ ] **Step 3: Implement provider lifecycle**

Provider opens DB once, stages legacy storage once, creates repository and runner once, starts runner after mount, stops it on unmount, and subscribes to repository summary changes. It requests `navigator.storage.persist()` where supported and records the result in `syncMeta/storagePersistence`.

- [ ] **Step 4: Replace the direct `App.jsx` GET effect**

Use `useOfflineData(activeMachine)`. Keep current React state contracts during migration, but populate them from `data` in one effect. Delete parsing code moved to `normalizeServerData.js` and delete the direct `fetch`.

Do not clear arrays at machine switch before cached data has loaded; show `refreshing` while retaining the correct machine snapshot.

- [ ] **Step 5: Keep old component props stable**

The following states and props remain the same in this task: segments, grouts, secondary grouts, shift reports, issues, daily reports, prep tasks, configs, machine progress, and instrument arrays. Write migration happens in Tasks 8–9.

- [ ] **Step 6: Run tests and build**

```powershell
npm test -- --watchAll=false --runInBand src/offline/useOfflineData.test.js
npm test -- --watchAll=false --runInBand
npm run build
```

- [ ] **Step 7: Commit**

```powershell
git add src/offline src/index.tsx src/App.jsx
git commit -m "feat: hydrate app from offline snapshots"
```

---

### Task 8: Route segment, grout, and shift writes through the queue

**Files:**
- Modify: `src/components/views/SegmentRecordView.jsx`
- Modify: `src/components/views/SegmentDashboardView.jsx`
- Modify: `src/components/views/GroutRecordView.jsx`
- Modify: `src/components/views/GroutDashboardView.jsx`
- Modify: `src/components/views/ShiftReportView.jsx`
- Create: `src/offline/coreWrites.integration.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `repository.mutate`.
- Produces: queued optimistic updates for core engineering records.

- [ ] **Step 1: Write integration tests for all core actions**

Mount each view with a mocked `onMutate` and assert exact envelopes:

```js
expect(onMutate).toHaveBeenCalledWith(expect.objectContaining({
  entityType: "segment",
  operation: "create",
  machine: "TBM1",
  domainKey: "segment:TBM1:P41:Permanent",
  baseVersion: 0,
}));
```

Cover create/update/delete segment, create/update/delete primary grout, create/update/delete secondary grout, and create/update shift report.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false --runInBand src/offline/coreWrites.integration.test.jsx`

Expected: FAIL because views still call `apiCall`.

- [ ] **Step 3: Add one App-level mutation adapter**

`App.jsx` creates:

```js
const mutateBusinessRecord = (input) =>
  repository.mutate(input).then(({ optimisticRecord }) => {
    applyOptimisticRecordToCurrentState(input.entityType, input.operation, optimisticRecord);
    runner.runNow();
    return optimisticRecord;
  });
```

The UI success message must say “บันทึกในเครื่องแล้ว” until server confirmation.

- [ ] **Step 4: Replace direct core `apiCall` sites**

Remove direct write calls from the five views. Preserve their existing validation and form reset behavior. Derive `baseVersion` from `data.syncMeta[domainKey]?.version || 0`.

Deletes remain visible as pending tombstones to repository reads but disappear from the active UI list with a pending badge available in Sync Center.

**Delete, do not carry, Task 7's interim write bookkeeping** (added after Task 7's review). In `ShiftReportView.jsx`: the module-scope `shiftSaveState` map — a draft id, the set of ids known to be on the sheet, and a serialising chain, all keyed `machine|date|shift` — plus `SHIFT_SAVE_TIMEOUT_MS` and `withDeadline`, the "outcome unknown" block (`unresolvedSince`), the `checkWithServer` handler and its notice, the `checking` and `bumpUnresolved` state, and `savingKeys`/`markSaving` (a per-report saving set exists only because a save could stall). In `App.jsx` — which is in this task's file list — the `onRefresh={offlineData.refresh}` and `snapshotReady={…}` props passed to `ShiftReportView`, whose only purpose is that check and the cold-launch gate. `repository.refresh`'s `serverPayload` field exists only for that check; remove it once nothing reads it. `normalizeServerData`'s `present` flags exist only for the cold-launch gate — check whether Task 9's reconciliation wants them (an absent collection is not an empty one there either) before removing.

Delete only the **tests of that bookkeeping** — in `shiftReportMidEdit.test.jsx` the `describe("what may release an unknown outcome")` block and the tests naming the deadline, the check and the unknown outcome; in `appDataFlow.test.jsx` the "blocked shift report can be unblocked" and "cold launch" tests and the `__resetShiftSaveStateForTests()` call in its `beforeEach`. **Keep everything else in both files**: they pin the mid-edit guards and App's mirror rules, which Task 7 needs and this task must not regress.

Everything in the delete-list above exists only because the legacy write is neither idempotent nor cancellable. The queue's `requestId`, version and per-domain ordering replace all of it, and keeping both would leave two sources of truth about whether a row reached the sheet. `__resetShiftSaveStateForTests` goes with it. `SegmentRecordView` and `GroutRecordView` have no equivalent protection today (recorded in `docs/superpowers/task7-completion.md`), so the queue is what closes them.

**Keep these Task 7 guards — do NOT delete them.** They are not interim: they protect a form being typed into while snapshots land, which the queue does not address. Content-keyed report loading (`stableKey`/`reportKey`), `dirtyRef`, `formSerialRef`, `loadGenerationRef`, `ownWriteKeyRef` and the server-copy notice, the machine reset in all three record views, and the machine comparison at each save's resolve (`isCurrentMachine`). Their regression tests stay too.

- [ ] **Step 5: Verify no direct core writes remain**

Run:

```powershell
rg -n 'apiCall\(' src/components/views src/App.jsx
```

Expected after Task 8: the core record writes are gone from `SegmentRecordView`, `GroutRecordView`, `ShiftReportView`, `SegmentDashboardView` and `GroutDashboardView`. **Matches that must still be there** — they are Task 9's, not this task's: `App.jsx`'s issue/daily/instrument writes, `PrepGanttView`, `RouteScheduleView`, `SegmentAnalysisView`, and any Drive-image or Gemini proxy call. The narrower pattern below is not sufficient on its own — `ShiftReportView` selects its action with a ternary (`apiCall(existed ? "updateShiftReport" : "addShiftReport", …)`), so an action-name search reports a false "no matches" for the one file with the most intricate migration.

```powershell
rg -n 'apiCall\("(add|update|delete)(Segment|Grout|SecondaryGrout|ShiftReport)' src
```

- [ ] **Step 6: Run tests**

```powershell
npm test -- --watchAll=false --runInBand src/offline/coreWrites.integration.test.jsx
npm test -- --watchAll=false --runInBand
```

- [ ] **Step 7: Commit**

```powershell
git add src/App.jsx src/components/views src/offline/coreWrites.integration.test.jsx
git commit -m "feat: queue core TBM writes offline"
```

---

### Task 9: Route remaining business writes and reconcile legacy caches

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/views/PrepGanttView.jsx`
- Modify: `src/components/views/RouteScheduleView.jsx`
- Modify: `src/components/views/SegmentAnalysisView.jsx`
- Modify: `src/utils/issues.js`
- Modify: `src/utils/dailyReports.js`
- Modify: `src/utils/instruments.js`
- Modify: `src/utils/prepGantt.js`
- Modify: `src/utils/planConfig.js`
- Modify: `src/utils/routeConfig.js`
- Create: `src/offline/secondaryWrites.integration.test.jsx`
- Extend: `src/offline/legacyMigration.test.js`

**Interfaces:**
- Consumes: Task 8 mutation adapter and Task 3 legacy reconciliation.
- Produces: no business record remains dependent on `localStorage` as its sole durable source.

- [ ] **Step 1: Write remaining write-envelope tests**

Cover:

- issue save/status/delete;
- daily report save/delete;
- prep task save/delete/baseline batch;
- plan and distance-plan config save;
- route config save;
- instrument update;
- instrument reading create/update;
- instrument schedule save.

Assert each edit creates one mutation per affected record with correct domain key; a prep baseline batch creates N independent request IDs, not one opaque batch.

- [ ] **Step 2: Add migration comparison tests**

Required scenarios:

- local and server records equal → `confirmed`, no conflict;
- local-only record → conflict reason `legacy_local_difference`;
- same ID but different engineering field → conflict;
- malformed legacy JSON retained as diagnostic and never discarded;
- repeated migration is idempotent.

- [ ] **Step 3: Run and verify failure**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/offline/secondaryWrites.integration.test.jsx src/offline/legacyMigration.test.js
```

- [ ] **Step 4: Replace remaining direct business writes**

Use repository mutation envelopes in `App.jsx`, `PrepGanttView`, `RouteScheduleView`, and `SegmentAnalysisView`. Keep `apiCall` only for online-only reads/proxies such as Drive images and Gemini.

- [ ] **Step 5: Demote legacy utility persistence**

Keep pure manipulation helpers in existing utils. Mark `load*/persist*` localStorage functions as migration-only exports and stop calling them from active React paths. UI preferences (`tbmActiveMachine`, prep collapsed rows, prep forecast mode) remain in localStorage.

- [ ] **Step 5b: Restore deletion propagation (added after Task 7's review; owned here)**

Task 7 made the localStorage-primary collections server-only **and** empty-guarded: `App.jsx` mirrors them behind `if (data.issues.length)`, `if (data.dailyReports.length)`, `if (data.prepTasks.length)`, `if (data.machineProgress)` and `mirrorInst`'s `if (!rows.length) return`. Consequence: a deletion that empties a collection never propagates — delete the last issue on device B, and device A keeps showing it indefinitely, labelled server-confirmed.

The guard is deliberate and must not simply be removed: `normalizeServerData` maps an absent key to `[]`, so an older GAS deployment or a partial `doGet` is indistinguishable from a real deletion, and losing a field record outranks showing a stale one. Reconciliation is the first point that can tell the two apart. Name the mechanism explicitly — a per-collection server revision, an explicit count, or tombstones — and only then relax the guard.

- [ ] **Step 6: Run a business-localStorage audit**

Run:

```powershell
rg -n 'localStorage\.(getItem|setItem)' src
```

Expected remaining keys only:

- `tbmActiveMachine`;
- `tbmPrepCollapsed_*`;
- `tbmPrepForecastMode`;
- migration-only reads inside `legacyMigration.js` and legacy utility compatibility functions not called by active views.

- [ ] **Step 7: Run tests**

```powershell
npm test -- --watchAll=false --runInBand src/offline/secondaryWrites.integration.test.jsx src/offline/legacyMigration.test.js
npm test -- --watchAll=false --runInBand
```

- [ ] **Step 8: Commit**

```powershell
git add src/App.jsx src/components/views src/utils src/offline
git commit -m "feat: queue all business writes offline"
```

---

### Task 10: Add app-wide sync, conflict, install, and update UI

**Files:**
- Create: `src/components/offline/NetworkStatusButton.jsx`
- Create: `src/components/offline/NetworkStatusButton.test.jsx`
- Create: `src/components/offline/SyncCenter.jsx`
- Create: `src/components/offline/SyncCenter.test.jsx`
- Create: `src/components/offline/ConflictResolver.jsx`
- Create: `src/components/offline/ConflictResolver.test.jsx`
- Create: `src/components/offline/InstallAppPanel.jsx`
- Create: `src/components/offline/InstallAppPanel.test.jsx`
- Create: `src/components/offline/UpdateAvailableBanner.jsx`
- Create: `src/pwa/useInstallPrompt.js`
- Create: `src/pwa/useInstallPrompt.test.js`
- Modify: `src/ui-ux-pro-max/components/Shell.jsx`
- Modify: `src/ui-ux-pro-max/components/TopBar.jsx`

**Interfaces:**
- Consumes: `useOffline`, repository summaries, conflict resolution, service-worker events.
- Produces: status and recovery controls reachable from every page.

- [ ] **Step 1: Write status and conflict component tests**

Assert:

- offline text and last snapshot time appear;
- pending/conflict counts are visible;
- “ซิงก์ตอนนี้” calls `runner.runNow`;
- server/local/manual conflict choices call the exact repository method;
- manual strategy cannot submit without a payload;
- discard requires a second confirmation action;
- “บันทึกในเครื่องแล้ว” is distinct from “ซิงก์สำเร็จ”.

- [ ] **Step 2: Write install detection tests**

Cover:

- Android `beforeinstallprompt` captured and `prompt()` invoked only after user click;
- iPhone not standalone → Safari Share instructions;
- standalone mode → install panel hidden;
- desktop browser without prompt → copy-link guidance, not a fake install success.

- [ ] **Step 3: Run and verify failure**

```powershell
npm test -- --watchAll=false --runInBand src/components/offline src/pwa/useInstallPrompt.test.js
```

- [ ] **Step 4: Implement status and Sync Center**

Tabs:

- `pending`: pending/syncing and next retry;
- `errors`: validation/permanent errors with edit/retry;
- `conflicts`: unresolved field-by-field comparisons;
- `recent`: last 50 server-confirmed mutations.

Display timestamps with existing Asia/Bangkok formatters. Never hide the record identifier, machine, entity type, or request ID in diagnostic detail.

- [ ] **Step 5: Implement install panel**

Add “ติดตั้งแอป” inside MoreSheet and status center. iPhone steps are exactly:

1. เปิดลิงก์ด้วย Safari
2. กด Share
3. เลือก “เพิ่มไปยังหน้าจอโฮม”

- [ ] **Step 6: Implement safe update banner**

Listen for `tbm:pwa-update`. On user confirmation:

```js
registration.waiting.postMessage({ type: "SKIP_WAITING" });
navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
```

Do not clear IndexedDB or caches from React.

- [ ] **Step 7: Wire into shared Shell**

Place `NetworkStatusButton` in `TopBar.rightSlot` on every tab. Render Sync Center, Install panel, and Update banner at Shell root so desktop and mobile share one state source. Ensure z-index is above BottomNav and MoreSheet.

- [ ] **Step 8: Run tests and regression**

```powershell
npm test -- --watchAll=false --runInBand src/components/offline src/pwa/useInstallPrompt.test.js
npm test -- --watchAll=false --runInBand
npm run build
```

- [ ] **Step 9: Commit**

```powershell
git add src/components/offline src/pwa src/ui-ux-pro-max/components
git commit -m "feat: add mobile sync and install center"
```

---

### Task 11: Guard online-only features and add storage/backup recovery

**Files:**
- Modify: `src/components/dashboard/DashboardHeaderActions.jsx`
- Modify: `src/utils/pdfBridge.js`
- Modify: `src/components/dashboard/ImageSlideshow.jsx`
- Modify: `src/components/views/AlignmentMapView.jsx`
- Create: `src/offline/storageHealth.js`
- Create: `src/offline/storageHealth.test.js`
- Create: `src/offline/exportPending.js`
- Create: `src/offline/exportPending.test.js`
- Modify: `src/components/offline/SyncCenter.jsx`

**Interfaces:**
- Produces: `getStorageHealth()` and `exportPendingBundle(repository)`.
- Consumes: online state and cached snapshots.

- [ ] **Step 1: Write storage and export tests**

Required export shape:

```js
{
  format: "tbm-offline-recovery",
  version: 1,
  exportedAt,
  deviceId,
  pendingMutations: [],
  validationErrors: [],
  permanentErrors: [],
  conflicts: []
}
```

Assert no GAS URL, API key, image base64, or unrelated confirmed business data is exported.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false --runInBand src/offline/storageHealth.test.js src/offline/exportPending.test.js`

- [ ] **Step 3: Implement storage health**

Use `navigator.storage.estimate()` and `navigator.storage.persisted()` where available. Return `supported:false` rather than throwing on Safari variants. Warn at 80% usage; cache eviction remains service-worker responsibility and must not touch IndexedDB business stores.

- [ ] **Step 4: Implement emergency export**

Create a JSON Blob and download filename `tbm-offline-recovery-YYYYMMDD-HHmm.json`. Include request IDs and full pending payloads required for recovery. Redact `imageBase64` fields and report them as `{ omitted: true, reason: "binary payload" }`.

- [ ] **Step 5: Add explicit offline guards**

- Gemini analysis button: disabled with “ต้องเชื่อมต่ออินเทอร์เน็ต”.
- PDF helper: report that the localhost helper is unavailable on mobile/offline; browser print remains available.
- Drive slideshow: show last locally available metadata/image cache or a clear offline empty state; do not loop retries.
- Alignment map: keep route/markers/3D owned data; show “พื้นหลังแผนที่ต้องใช้อินเทอร์เน็ต” when ArcGIS tiles fail.

- [ ] **Step 6: Add recovery actions to Sync Center**

Show storage usage, persistence status, and “ส่งออกข้อมูลที่ยังไม่ซิงก์”. Destructive discard remains per-record and confirmed; no “clear all data” action is added.

- [ ] **Step 7: Run tests**

```powershell
npm test -- --watchAll=false --runInBand src/offline/storageHealth.test.js src/offline/exportPending.test.js
npm test -- --watchAll=false --runInBand
npm run build
```

- [ ] **Step 8: Commit**

```powershell
git add src/components src/utils/pdfBridge.js src/offline
git commit -m "feat: add offline recovery safeguards"
```

---

### Task 12: Production verification, Vercel preview, and staged rollout

**Files:**
- Create: `docs/mobile-pwa-runbook.md`
- Create: `docs/mobile-pwa-test-matrix.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: repeatable deploy, test, rollback, and pilot procedure.

- [ ] **Step 1: Run the full automated gate**

```powershell
npm run test:pwa
npm run test:gas-sync
npm test -- --watchAll=false --runInBand
npm run build
node -c '..\gas-live\Code.js'
git diff --check
```

Expected: every command PASS. Record the actual final suite/test counts in `docs/mobile-pwa-test-matrix.md`.

- [ ] **Step 2: Serve the production build and verify offline shell**

Run:

```powershell
npx serve@14.2.5 -s build -l 4173
```

In Chrome:

1. open `http://localhost:4173`;
2. confirm service worker controls the page after one reload;
3. switch DevTools Network to Offline;
4. reload and navigate every current tab;
5. confirm application shell loads and uncached content shows an explicit empty state.

- [ ] **Step 3: Verify queue and conflict with deterministic scenarios**

On two browser profiles:

1. load the same server record on both;
2. set profile A offline and edit;
3. edit/sync profile B online;
4. reconnect A;
5. verify A receives Conflict and does not overwrite B;
6. resolve using server, local, and manual strategies in separate test records;
7. verify repeated submission of one `requestId` creates one server result.

Use dedicated test records identified in the runbook; do not alter production engineering records for testing.

- [ ] **Step 4: Create the Vercel preview verification matrix**

Matrix rows:

- Android Chrome install/launch/offline/reconnect/update;
- iPhone Safari Add to Home Screen/standalone/offline/reconnect/update;
- Android and iPhone queue persistence after app close/reopen;
- slow network and network loss during POST;
- **GET latency on a real underground link, timed** (added after Task 7's review). Three deadlines now guard the wire and only one of them has been measured against anything: `SNAPSHOT_FETCH_TIMEOUT_MS` (90 s, `src/offline/apiTransport.js`), `SHIFT_SAVE_TIMEOUT_MS` (45 s, `src/components/views/ShiftReportView.jsx`) and the 15 s sync POST. The snapshot figure was reasoned from a 463 KB `getData` payload and an assumed ~100 kbps floor; the save figure from GAS's 10 s `LockService` wait plus cold start. Time an actual `getData` and an actual shift-report write from the tunnel and adjust both. A false "dead" verdict on the GET costs a stale snapshot; on the save it costs a report whose outcome is unknown until the next refresh;
- storage warning and recovery export;
- all tabs, mobile nav, charts, map, 3D, reports, print;
- safe-area and buttons not hidden by BottomNav;
- stale timestamp, pending count, conflict count.

- [ ] **Step 5: Write deploy and rollback runbook**

`docs/mobile-pwa-runbook.md` contains:

- GAS deploy commands and `setupSheets()` owner action;
- Vercel preview before production promotion;
- service-worker update behavior;
- rollback order: frontend rollback first if contract-compatible, GAS rollback only from verified backup;
- how to export pending records before device/browser maintenance;
- known limitation that clearing site data or device loss can remove unsynced records;
- no-login security warning;
- **promotion gate (added after Task 7's review): Tasks 8 and 9 ship with Task 7, or none of them do.** Tasks 2 and 7 are what make the app openable and usable offline, which makes a pre-existing hole reachable for the first time — a non-empty server response still replaces the localStorage-primary collections wholesale (`App.jsx`, the `serverAuthoritative` branch), so a record created offline whose `apiCall` never landed is destroyed the first time the server answers. Offline reads are new; durable offline writes arrive with the mutation queue (Task 8) and legacy reconciliation (Task 9). Deploying Task 7 alone would contradict "offline writes survive normal application and device-browser restarts". See `docs/superpowers/task7-completion.md`.

- [ ] **Step 6: Pilot in three gates**

1. one Android + one iPhone;
2. two or three field users;
3. all approximately ten users.

At each gate, record pending age, sync failures, conflicts, storage usage, duplicate count, and data-loss count. Promotion requires duplicate count `0` and data-loss count `0`.

- [ ] **Step 7: Final regression and commit**

```powershell
npm run test:pwa
npm run test:gas-sync
npm test -- --watchAll=false --runInBand
npm run build
git add README.md docs/mobile-pwa-runbook.md docs/mobile-pwa-test-matrix.md
git commit -m "docs: add mobile PWA operations runbook"
```

---

## Spec Coverage Checklist

- Install from Vercel on Android/iPhone: Tasks 1, 2, 10, 12.
- Every page opens offline after prior load: Tasks 1, 2, 4, 7, 11.
- Latest server snapshot available offline: Tasks 3, 4, 7.
- Durable offline writes and exact-once server effect: Tasks 5, 6, 8, 9.
- Conflict detection and manual resolution: Tasks 5, 6, 10, 12.
- App-wide status and manual sync: Tasks 5, 7, 10.
- Safe updates and DB preservation: Tasks 2, 3, 10.
- Legacy localStorage business data preserved: Tasks 3 and 9.
- Storage warning and emergency export: Task 11.
- Future auth fields without implementing login: Tasks 3, 5, 6.
- Asia/Bangkok/domain constraints: Global Constraints and Tasks 4, 6, 8, 9.
- GAS deploy/rollback: Tasks 6 and 12.
- Real Android/iPhone staged pilot for ten users: Task 12.
