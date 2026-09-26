/* BookBox service worker: keeps the library usable without a connection.
 *
 * - App code (/_next/static) and covers (/covers) are content-hashed, so they're cache-first.
 * - Pages and the library index are network-first; the last good copy is used offline.
 * - A page that was never saved falls back to /offline, which searches the saved index.
 * - Nothing that changes data (POSTs, server actions) is ever cached or replayed here.
 */

const VERSION = "v1";
const SHELL = `bookbox-shell-${VERSION}`;
const PAGES = `bookbox-pages-${VERSION}`;
const COVERS = "bookbox-covers"; // unversioned: covers never change under the same name
const KEEP = [SHELL, PAGES, COVERS];
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/api/library", "/manifest.webmanifest", "/icons/icon-192.png"];
const NETWORK_TIMEOUT = 8000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(PRECACHE.map((url) => cachePut(cache, url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("bookbox-") && !KEEP.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** Fetches and stores a URL, skipping anything that isn't a plain success (like a redirect to sign in). */
async function cachePut(cache, url) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.ok && !res.redirected) await cache.put(url, res.clone());
  return res;
}

const usable = (res) => res && res.ok && !res.redirected && res.type === "basic";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  // Never intercept sign-in, public share pages, exports, or client-side RSC fetches
  // (Next.js retries those itself when the connection comes back).
  if (path.startsWith("/login") || path.startsWith("/s/") || path.startsWith("/export") || req.headers.get("RSC") === "1") return;

  if (path.startsWith("/_next/static/") || path.startsWith("/icons/") || path.startsWith("/splash/")) {
    event.respondWith(cacheFirst(req, SHELL));
  } else if (path.startsWith("/covers/")) {
    event.respondWith(cacheFirst(req, COVERS));
  } else if (path === "/api/library") {
    event.respondWith(networkFirst(req, SHELL, "/api/library"));
  } else if (req.mode === "navigate") {
    event.respondWith(navigate(req));
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (usable(res)) await cache.put(req, res.clone());
  return res;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

async function networkFirst(req, cacheName, key) {
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT);
    if (usable(res)) await cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}

async function navigate(req) {
  const cache = await caches.open(PAGES);
  // One saved copy per page: filtered and searched views fall back to the unfiltered page.
  const url = new URL(req.url);
  const key = url.origin + url.pathname;
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT);
    if (usable(res) && !url.search) await cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

/* The page asks for everything to be saved for offline use once it's idle: the offline page,
 * the library index, the main pages, and every cover that isn't saved yet. */
self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm") return;
  event.waitUntil(warm(event.data.pages ?? [], event.data.assets ?? []));
});

let warming = null;
function warm(pages, assets) {
  warming ??= (async () => {
    const shell = await caches.open(SHELL);
    for (const url of assets) {
      if (new URL(url).origin === self.location.origin && !(await shell.match(url))) await cachePut(shell, url).catch(() => {});
    }
    // Save each page with the scripts and styles it needs, so it works offline without having been visited.
    const savePage = async (cache, url) => {
      const page = await cachePut(cache, url).catch(() => null);
      if (!page || !page.ok || page.redirected) return;
      const html = await page.text();
      for (const [asset] of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) {
        if (!(await shell.match(asset))) await cachePut(shell, asset).catch(() => {});
      }
    };
    await savePage(shell, OFFLINE_URL);
    const res = await cachePut(shell, "/api/library").catch(() => null);
    const pageCache = await caches.open(PAGES);
    for (const url of pages) await savePage(pageCache, new URL(url, self.location.origin).href);

    if (!res || !res.ok) return;
    const books = await res.json();
    const covers = await caches.open(COVERS);
    const missing = [];
    for (const b of books) if (b.cover && !(await covers.match(`/covers/${b.cover}`))) missing.push(`/covers/${b.cover}`);
    // A few at a time, so saving covers never gets in the way of using the app.
    const queue = [...missing];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (let url = queue.shift(); url; url = queue.shift()) await cachePut(covers, url).catch(() => {});
      }),
    );
  })().finally(() => {
    warming = null;
  });
  return warming;
}
