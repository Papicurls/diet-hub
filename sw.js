const CACHE = "diet-hub-v6";
const FILES = [
  "./",
  "index.html",
  "styles.css?v=6",
  "seed.js?v=6",
  "store.js?v=6",
  "app.js?v=6",
  "manifest.json",
  "icon.svg",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const file of FILES) {
        try {
          await cache.add(file);
        } catch {
          /* skip missing */
        }
      }
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const isPage = event.request.mode === "navigate";
  if (isPage) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match("./"))),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).catch(() => caches.match("./"))),
  );
});
