const MANIFEST = self.__WB_MANIFEST;
const hash = MANIFEST.map((x) => x.revision || x.url)
  .join("|")
  .split("")
  .reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 7)
  .toString(16);
const PRECACHE = `tbm-precache-${hash}`;
const RUNTIME = "tbm-runtime-v1";
const PRECACHE_URLS = MANIFEST.map((x) => x.url);

const isHashedStaticAsset = (url) =>
  /^\/static\/.+\.[a-f0-9]{8,}\.(?:js|css|svg|png|jpe?g|webp|woff2?|ttf)$/i.test(url.pathname);
const isRuntimeAsset = (url) => /\.(?:png|jpe?g|webp|gif|svg|glb|html)$/i.test(url.pathname);
const isExcluded = (request, url) =>
  request.method !== "GET" ||
  url.hostname === "script.google.com" ||
  /gemini/i.test(url.href) ||
  (isLocalhost(url.hostname) && /(?:pdf|build|health)/i.test(url.pathname)) ||
  /arcgis(?:online)?\.com/i.test(url.hostname);
const isLocalhost = (hostname) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - 80)).map((key) => cache.delete(key)));
}

async function cacheFirst(request) {
  const precached = await caches.match(request);
  if (precached) return precached;

  const cache = await caches.open(RUNTIME);
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimRuntimeCache(cache);
  }
  return response;
}

async function navigationResponse(request) {
  try {
    return await fetch(request);
  } catch {
    return caches.open(PRECACHE).then((cache) => cache.match("/index.html"));
  }
}

async function notifyCacheUpdated() {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => client.postMessage({ type: "CACHE_UPDATED" }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("tbm-precache-") && key !== PRECACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(notifyCacheUpdated)
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (isExcluded(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (isHashedStaticAsset(url) || isRuntimeAsset(url)) event.respondWith(cacheFirst(request));
});
