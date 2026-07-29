const isLocalhost = (hostname) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

export async function registerServiceWorker({ env, onUpdate, onOfflineReady } = {}) {
  if (
    env !== "production" ||
    !("serviceWorker" in navigator) ||
    (window.location.protocol !== "https:" && !isLocalhost(window.location.hostname))
  ) {
    return () => {};
  }

  const registration = await navigator.serviceWorker.register("/service-worker.js");

  if (registration.waiting) {
    onUpdate?.(registration);
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;

    installing.addEventListener("statechange", () => {
      if (installing.state !== "installed") return;
      if (navigator.serviceWorker.controller) onUpdate?.(registration);
      else onOfflineReady?.(registration);
    });
  });

  return () => registration.unregister();
}
