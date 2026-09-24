(() => {
  "use strict";
  const MAX_BYTES = 2 * 1024 * 1024;
  function normalizeHost(value) {
    const url = new URL(String(value).trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Enter a valid LifeOS computer URL.");
    return url.origin;
  }
  class BundleSyncTransport {
    createBundle(events, deviceId, batchId = self.LifeOSCaptureRuntime.secureUuid()) {
      const bundle = { meta: { app: "LifeOS", kind: "offline-sync", version: 1, batchId, deviceId, exportedAt: new Date().toISOString() }, events };
      if (!self.LifeOSOfflineProtocol.validBundle(bundle)) throw new Error("One or more captures do not match the current sync format.");
      if (new Blob([JSON.stringify(bundle)]).size > MAX_BYTES) throw new Error("This bundle exceeds 2 MB. Sync some captures first.");
      return bundle;
    }
    createBundleV2(events, deviceId, attachments, batchId = self.LifeOSCaptureRuntime.secureUuid()) { const bundle = { meta: { app: "LifeOS", kind: "offline-sync", version: 2, batchId, deviceId, exportedAt: new Date().toISOString() }, events, attachments }; if (!self.LifeOSOfflineProtocol.validBundleV2(bundle)) throw new Error("One or more captures do not match the current sync format."); if (new Blob([JSON.stringify(bundle)]).size > MAX_BYTES) throw new Error("This bundle exceeds 2 MB. Sync some captures first."); return bundle; }
  }
  class DirectLocalSyncTransport {
    constructor(hostUrl, token = "") { this.hostUrl = normalizeHost(hostUrl); this.token = token; }
    async request(path, { method = "GET", body, authenticated = false, timeout = 2500 } = {}) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
      const headers = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (authenticated) headers.Authorization = `Bearer ${this.token}`;
      try {
        const localNetwork = typeof Request !== "undefined" && "targetAddressSpace" in Request.prototype ? { targetAddressSpace: "local" } : {};
        const response = await fetch(`${this.hostUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: "no-store", credentials: "omit", referrerPolicy: "same-origin", ...localNetwork });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          const error = new Error(payload.error || `LifeOS returned ${response.status}.`);
          error.code = payload.code || (response.status === 401 ? "unauthorized" : `http_${response.status}`);
          throw error;
        }
        return payload.data;
      } catch (error) { if (error?.name === "AbortError") { const timeoutError = new Error("LifeOS did not respond within 2.5 seconds."); timeoutError.code = "network_error"; throw timeoutError; } if (!error?.code && /failed to fetch|network|load failed/i.test(error?.message || "")) error.code = "secure_connection_failed"; throw error; }
      finally { clearTimeout(timer); }
    }
    async health(attempts = 3) { let last; for (let attempt = 0; attempt < attempts; attempt += 1) { try { return await this.request("/api/local-sync/health", { timeout: 2000 }); } catch (error) { last = error; if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt)); } } throw last; }
    pair(serverId, deviceId, code) { return this.request("/api/local-sync/pair", { method: "POST", body: { serverId, deviceId, code }, timeout: 3000 }); }
    preview(bundle) { return this.request("/api/local-sync/preview", { method: "POST", body: bundle, authenticated: true, timeout: 3000 }); }
    commit(bundle) { return this.request("/api/local-sync/commit", { method: "POST", body: bundle, authenticated: true, timeout: 10000 }); }
    prepareAttachments(attachments) { return this.request("/api/local-sync/attachments/prepare", { method: "POST", body: { attachments }, authenticated: true, timeout: 5000 }); }
    async uploadAttachment(attachment) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000); try { const response = await fetch(`${this.hostUrl}/api/local-sync/attachments/${attachment.id}`, { method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${this.token}`, "Content-Type": attachment.mimeType, "X-Attachment-Sha256": attachment.sha256, "X-Attachment-Mime": attachment.mimeType, "X-Attachment-Width": String(attachment.width || ""), "X-Attachment-Height": String(attachment.height || ""), "X-Attachment-Original-Name": attachment.originalName || "" }, body: attachment.blob, signal: controller.signal, cache: "no-store", credentials: "omit" }); const payload = await response.json().catch(() => ({})); if (!response.ok || payload.ok === false) throw new Error(payload.error || `LifeOS returned ${response.status}.`); return payload.data; } finally { clearTimeout(timer); } }
  }
  self.LifeOSSyncTransports = { BundleSyncTransport, DirectLocalSyncTransport, normalizeHost };
})();
