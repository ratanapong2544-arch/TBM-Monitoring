import { STORES } from "./schema";

function createDeviceId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  const randomHex = Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return `device-${Date.now()}-${randomHex}`;
}

export async function getOrCreateDeviceId(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.deviceMeta, "readwrite");
    const store = transaction.objectStore(STORES.deviceMeta);
    const request = store.get("deviceId");
    let deviceId;

    request.onsuccess = () => {
      const existing = request.result;
      deviceId = existing && existing.value || createDeviceId();
      if (!existing || !existing.value) store.put({ key: "deviceId", value: deviceId });
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(deviceId);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
