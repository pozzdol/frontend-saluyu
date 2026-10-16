// Saluyu service worker: keeps the app shell and its files so the app opens offline.
// The API is never cached: money data comes from the server or not at all (Quick Add
// queues its own entries while offline).
const CACHE = "saluyu-v2"

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"])))
  self.skipWaiting()
})

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return
  // Pages: network first, the cached shell when offline (every route is the same index.html).
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => (caches.open(CACHE).then((c) => c.put("/", res.clone())), res))
        .catch(() => caches.match("/")),
    )
    return
  }
  // Built files have content hashes in their names, so a cached copy is never stale.
  e.respondWith(
    caches.match(e.request).then(
      (hit) => hit || fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()))
        return res
      }),
    ),
  )
})
