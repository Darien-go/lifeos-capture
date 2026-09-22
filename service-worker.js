const CACHE = "lifeos-capture-shell-v3";
const SHELL = ["./index.html", "./styles.css", "./sync.css", "./protocol.js", "./storage.js", "./runtime.js", "./transports.js", "./app.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("lifeos-capture-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) {
      if (request.mode === "navigate") {
        const shell = await cache.match(new URL("./index.html", self.registration.scope).href);
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
