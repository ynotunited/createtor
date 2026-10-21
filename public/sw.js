/*
 * Createtor service worker.
 *
 * Goals: keep the app usable when the network drops, without ever leaking one
 * account's data to another on a shared device.
 *
 * Strategy:
 *  - Navigations (HTML): network-only. On failure we serve /offline.html. We do
 *    NOT cache page HTML because dashboard responses can be personalised; a
 *    cached page could be replayed to a different user after sign-out.
 *  - Static assets (JS/CSS/fonts/images): stale-while-revalidate. Cached copy is
 *    served first, then refreshed in the background.
 *  - Everything cross-origin (Supabase, AI/model APIs) and all non-GET requests
 *    are bypassed entirely: they must always hit the network.
 *  - React Query pauses and replays mutations on reconnect, so pending writes
 *    are handled by the app, not the worker.
 */

const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/fonts/") ||
    /\.(?:css|js|mjs|woff2?|png|jpe?g|gif|svg|webp|avif|ico)$/.test(pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only same-origin GETs are candidates. Auth, APIs and server functions go
  // straight to the network.
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
});
