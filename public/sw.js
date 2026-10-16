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
    event.respondWith(navigate(event));
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

/** Which build of the app a page belongs to: the content-hashed scripts and styles it loads. */
const buildOf = (html) => [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+\.(?:js|css)/g) ?? [])].sort().join(" ");

/** For pages answered from the saved copy: whether the fresh copy turned out to be a newer build. */
const versionChecks = new Map();

// Read-only pages that open from the saved copy at once, then refresh (see OfflineSupport).
// Forms are left out on purpose: they must never open with old values in their fields.
const INSTANT = /^\/library$|^\/(people|tags|series|stats)$|^\/books\/\d+$/;
const FROM_CACHE = "sw-cache";

async function navigate(event) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  // One saved copy per page: filtered and searched views fall back to the unfiltered page.
  const url = new URL(req.url);
  const key = url.origin + url.pathname;

  if (!url.search && INSTANT.test(url.pathname)) {
    const hit = await cache.match(key);
    if (hit) {
      // Fetch a fresh copy for next time, and note whether it's from a newer build of the app than the
      // saved one (its scripts and styles would then be out of date; the page asks, see "is-stale").
      const saved = hit.clone();
      const check = (async () => {
        const res = await fetch(req).catch(() => null);
        if (!usable(res)) return false;
        const [fresh, old] = await Promise.all([res.clone().text(), saved.text()]);
        await cache.put(key, res);
        return buildOf(fresh) !== buildOf(old);
      })().catch(() => false);
      const clientId = event.resultingClientId;
      if (clientId) versionChecks.set(clientId, check);
      event.waitUntil(check.finally(() => setTimeout(() => versionChecks.delete(clientId), 60_000)));
      // Marked so the page knows to ask the server for current data once it's up.
      const headers = new Headers(hit.headers);
      headers.set("Server-Timing", FROM_CACHE);
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
    }
  }

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
  if (event.data?.type === "warm") event.waitUntil(warm(event.data.pages ?? [], event.data.assets ?? []));
  // After edits sync, re-save those pages so offline visits show the new version.
  if (event.data?.type === "refresh") event.waitUntil(refreshPages(event.data.urls ?? []));
  // A page opened from its saved copy asks whether the app has been updated since.
  if (event.data?.type === "is-stale" && event.ports[0]) {
    const check = versionChecks.get(event.source?.id);
    event.waitUntil((check ?? Promise.resolve(false)).then((stale) => event.ports[0].postMessage({ stale })));
  }
});

async function refreshPages(urls) {
  const pages = await caches.open(PAGES);
  for (const url of urls) {
    const href = new URL(url, self.location.origin).href;
    if (url === "/library" || (await pages.match(href))) await cachePut(pages, href).catch(() => {});
  }
  await cachePut(await caches.open(SHELL), "/api/library").catch(() => {});
}

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
    // Book pages you're likely to update away from a connection: what you're reading, and the newest additions.
    const likely = books.filter((b) => b.shelf === "Currently Reading").concat(books.slice(0, 20));
    for (const b of new Set(likely)) await savePage(pageCache, new URL(`/books/${b.id}`, self.location.origin).href);
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
