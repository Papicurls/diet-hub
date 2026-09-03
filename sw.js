const CACHE = "diet-hub-v5";
const FILES = [
  "./",
  "index.html",
  "styles.css?v=5",
  "app.js?v=5",
  "store.js?v=5",
  "manifest.json",
  "icon.svg",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "seed/plan.json",
  "seed/grocery.json",
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
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).catch(() => caches.match("./"))),
  );
});
