// KAIROS Service Worker — shell cache + selective API data cache.
// Cache strategy: stale-while-revalidate for app shell + recent brief/asset reads.
// Write queue is handled in-app via IndexedDB (idb.ts), not in the SW.

const SHELL = "kairos-shell-v1";
const DATA = "kairos-data-v1";

// API paths worth caching offline (GET only)
const DATA_PATTERNS = ["/briefs", "/assets", "/elicitation"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isApi = url.port === "8000" || url.pathname.startsWith("/api/");

  if (isApi) {
    const shouldCache = DATA_PATTERNS.some((p) => url.pathname.includes(p));
    if (!shouldCache) return; // pass through uncached API calls
    e.respondWith(
      caches.open(DATA).then((cache) =>
        cache.match(request).then((cached) => {
          const fresh = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
            .catch(() => cached ?? Response.error());
          return cached ?? fresh;
        }),
      ),
    );
    return;
  }

  // App shell: stale-while-revalidate
  e.respondWith(
    caches.open(SHELL).then((cache) =>
      cache.match(request).then((cached) => {
        const fresh = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        });
        return cached ?? fresh;
      }),
    ),
  );
});
