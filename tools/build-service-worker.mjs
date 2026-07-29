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
