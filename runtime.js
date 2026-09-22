(() => {
  "use strict";
  function secureUuid(cryptoApi = self.crypto) {
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    if (!cryptoApi?.getRandomValues) throw new Error("This browser does not provide a cryptographically secure random number generator.");
    const bytes = new Uint8Array(16); cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  async function initializeCaptureRuntime({ secureContext, indexedDbAvailable, openDatabase, readDeviceId, registerServiceWorker }) {
    const result = { secureContext: Boolean(secureContext), indexedDb: "unavailable", deviceId: "unavailable", serviceWorker: "not-checked", serviceWorkerRegistration: null, storageError: null };
    if (!indexedDbAvailable) { result.storageError = "IndexedDB API is unavailable in this browser context."; return result; }
    try { await openDatabase(); result.indexedDb = "available"; }
    catch (error) { result.storageError = error instanceof Error ? error.message : String(error); return result; }
    try { await readDeviceId(); result.deviceId = "ready"; }
    catch (error) { result.storageError = error instanceof Error ? error.message : String(error); return result; }
    if (!result.secureContext) result.serviceWorker = "offline-install-unavailable-http";
    else if (typeof registerServiceWorker !== "function") result.serviceWorker = "unavailable";
    else {
      try { result.serviceWorkerRegistration = await registerServiceWorker(); result.serviceWorker = "available"; }
      catch (error) { result.serviceWorker = `offline-shell-unavailable: ${error instanceof Error ? error.message : String(error)}`; }
    }
    return result;
  }
  self.LifeOSCaptureRuntime = { secureUuid, initializeCaptureRuntime };
})();
