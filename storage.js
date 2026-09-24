(() => {
  "use strict";
  const DB_NAME = "lifeos-capture-v1";
  const DB_VERSION = 2;
  let connection;
  function open() {
    if (connection) return Promise.resolve(connection);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "id" }); if (!db.objectStoreNames.contains("state")) db.createObjectStore("state", { keyPath: "key" }); if (!db.objectStoreNames.contains("batches")) db.createObjectStore("batches", { keyPath: "batchId" }); if (!db.objectStoreNames.contains("attachments")) db.createObjectStore("attachments", { keyPath: "id" }); };
      req.onsuccess = () => { connection = req.result; connection.onversionchange = () => { connection.close(); connection = undefined; }; resolve(connection); };
      req.onerror = () => reject(req.error);
    });
  }
  async function request(storeName, operation) { const db = await open(); const tx = db.transaction(storeName, "readonly"); return new Promise((resolve, reject) => { const req = operation(tx.objectStore(storeName)); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  async function write(storeName, operation) { const db = await open(); const tx = db.transaction(storeName, "readwrite"); return new Promise((resolve, reject) => { let result; try { result = operation(tx.objectStore(storeName)); } catch (error) { tx.abort(); reject(error); return; } tx.oncomplete = () => resolve(result?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  async function clearBatch(batch) {
    const db = await open(); const tx = db.transaction(["events", "batches", "attachments"], "readwrite");
    for (const id of batch.eventIds) tx.objectStore("events").delete(id);
    for (const id of batch.attachmentIds || []) tx.objectStore("attachments").delete(id);
    tx.objectStore("batches").delete(batch.batchId);
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  }
  async function putEventWithAttachments(event, attachments) {
    const db = await open(); const tx = db.transaction(["events", "attachments"], "readwrite");
    try { tx.objectStore("events").put(event); for (const attachment of attachments) tx.objectStore("attachments").put({ ...attachment, eventId: event.id, syncState: "pending", createdAt: attachment.createdAt || new Date().toISOString() }); }
    catch (error) { tx.abort(); throw error; }
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  }
  self.LifeOSCaptureStore = { open, get: (name, key) => request(name, objectStore => objectStore.get(key)), all: name => request(name, objectStore => objectStore.getAll()), put: (name, value) => write(name, objectStore => objectStore.put(value)), putEventWithAttachments, remove: (name, key) => write(name, objectStore => objectStore.delete(key)), clearBatch };
})();
