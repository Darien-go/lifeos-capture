(() => {
  "use strict";
  const MAX_BYTES = 2 * 1024 * 1024;
  function uuid() { return self.LifeOSCaptureRuntime.secureUuid(); }
  async function digest(bytes) { if (!self.crypto?.subtle) throw new Error("Secure image hashing is unavailable in this browser."); const hash = await self.crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join(""); }
  function canvasBlob(image, width, height, quality) { return new Promise((resolve, reject) => { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) return reject(new Error("Image processing is unavailable.")); context.drawImage(image, 0, 0, width, height); canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to encode image.")), "image/jpeg", quality); }); }
  async function prepare(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
    const objectUrl = URL.createObjectURL(file); const image = await new Promise((resolve, reject) => { const value = new Image(); value.onload = () => { URL.revokeObjectURL(objectUrl); resolve(value); }; value.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Unable to read image.")); }; value.src = objectUrl; });
    let scale = Math.min(1, 1600 / Math.max(image.width, image.height)); let quality = 0.84; let blob;
    for (let attempt = 0; attempt < 6; attempt += 1) { blob = await canvasBlob(image, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)), quality); if (blob.size <= MAX_BYTES) break; if (quality > 0.58) quality -= 0.08; else scale *= 0.78; }
    if (!blob || blob.size > MAX_BYTES) throw new Error("Image is too large after compression.");
    const bytes = await blob.arrayBuffer(); return { id: uuid(), sha256: await digest(bytes), mimeType: "image/jpeg", byteSize: blob.size, width: Math.round(image.width * scale), height: Math.round(image.height * scale), originalName: file.name, blob };
  }
  self.LifeOSCaptureAttachments = { prepare, MAX_BYTES };
})();
