(() => {
  "use strict";
  const DB_NAME = "lifeos-capture-v1";
  const DB_VERSION = 1;
  let connection;
  function open() {
    if (connection) return Promise.resolve(connection);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { const db = req.result; db.createObjectStore("events", { keyPath: "id" }); db.createObjectStore("state", { keyPath: "key" }); db.createObjectStore("batches", { keyPath: "batchId" }); };
      req.onsuccess = () => { connection = req.result; connection.onversionchange = () => { connection.close(); connection = undefined; }; resolve(connection); };
      req.onerror = () => reject(req.error);
    });
  }
  async function request(storeName, operation) { const db = await open(); const tx = db.transaction(storeName, "readonly"); return new Promise((resolve, reject) => { const req = operation(tx.objectStore(storeName)); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  async function write(storeName, operation) { const db = await open(); const tx = db.transaction(storeName, "readwrite"); return new Promise((resolve, reject) => { let result; try { result = operation(tx.objectStore(storeName)); } catch (error) { tx.abort(); reject(error); return; } tx.oncomplete = () => resolve(result?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  async function clearBatch(batch) {
    const db = await open(); const tx = db.transaction(["events", "batches"], "readwrite");
    for (const id of batch.eventIds) tx.objectStore("events").delete(id);
    tx.objectStore("batches").delete(batch.batchId);
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  }
  self.LifeOSCaptureStore = { open, get: (name, key) => request(name, objectStore => objectStore.get(key)), all: name => request(name, objectStore => objectStore.getAll()), put: (name, value) => write(name, objectStore => objectStore.put(value)), remove: (name, key) => write(name, objectStore => objectStore.delete(key)), clearBatch };
})();
