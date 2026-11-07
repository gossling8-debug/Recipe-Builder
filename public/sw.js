// Minimal offline support: the app's own files are cached as they load, so
// saved recipes still open with no signal (e.g. in a basement kitchen).
// Requests to other sites (the Claude API) are never cached.
const CACHE = "recipe-builder-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // Network first so updates show up right away; fall back to the cache offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = (await caches.match(req)) || (req.mode === "navigate" ? await caches.match("./") : undefined);
        return hit || Response.error();
      }),
  );
});
