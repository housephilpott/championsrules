/* ============================================================
   Champions Rules — service worker
   Offline support via cache-first strategy with network fallback.
   Bump CACHE_VERSION whenever you change any cached file so
   clients pick up the new assets.
   ============================================================ */

const CACHE_VERSION = "champions-rules-v3";
const CACHE_NAME = CACHE_VERSION;

/* Files that make up the app shell. Paths are relative to the
   service worker's scope (the repo/site root). */
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./glossary.json",
  "./assets/manifest.json",
  "./assets/favicon.ico",
  "./assets/favicon-16.png",
  "./assets/favicon-32.png",
  "./assets/apple-touch-icon.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-192-maskable.png",
  "./assets/icon-512-maskable.png"
];

/* ---------- Install: pre-cache the app shell ---------- */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())  // activate the new SW immediately
  );
});

/* ---------- Activate: clean up old caches ---------- */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())  // take control of open pages
  );
});

/* ---------- Fetch: cache-first, then network ----------
   - Only handles same-origin GET requests.
   - Serves from cache when available (instant + offline).
   - Falls back to network and caches fresh successful responses.
   - For navigations while offline, falls back to cached index.html. */
self.addEventListener("fetch", event => {
  const { request } = event;

  // Ignore non-GET and cross-origin requests (e.g. CDNs, analytics).
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          // Only cache valid, basic (same-origin) responses.
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: for page navigations, return the shell.
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return Response.error();
        });
    })
  );
});

/* ---------- Optional: allow the page to trigger an update ---------- */
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
