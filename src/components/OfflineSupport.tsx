"use client";

import { useOffline } from "next/offline";
import { useEffect, useRef, useState } from "react";

// Saved for offline use in the background: the index, these pages, and every cover.
const OFFLINE_PAGES = ["/", "/people", "/tags", "/series", "/stats"];
const WARM_EVERY = 6 * 60 * 60 * 1000;
const WARMED_KEY = "bookbox:warmed";

/** Registers the service worker, keeps the offline copy fresh, and says so when the connection drops. */
export function OfflineSupport() {
  const failing = useOffline(); // a request failed, e.g. the server is unreachable
  const [noNetwork, setNoNetwork] = useState(false); // the device knows it's offline, e.g. opened in airplane mode
  const offline = failing || noNetwork;

  useEffect(() => {
    const update = () => setNoNetwork(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    // Dev builds change on every edit, which a caching service worker would only get in the way of.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let idle: number | undefined;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        let last = 0;
        try {
          last = Number(localStorage.getItem(WARMED_KEY)) || 0;
        } catch {}
        if (Date.now() - last < WARM_EVERY) return;
        const warm = () => {
          // Scripts and styles that loaded before the service worker took over aren't saved yet.
          const assets = performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((u) => new URL(u).pathname.startsWith("/_next/static/"));
          reg.active?.postMessage({ type: "warm", pages: OFFLINE_PAGES, assets });
          try {
            localStorage.setItem(WARMED_KEY, String(Date.now()));
          } catch {}
        };
        idle = "requestIdleCallback" in window ? window.requestIdleCallback(warm, { timeout: 10_000 }) : (setTimeout(warm, 3000) as unknown as number); // Safari has no requestIdleCallback
      })
      .catch(() => {});
    return () => {
      if (idle === undefined) return;
      if ("cancelIdleCallback" in window) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);

  // Offline, a client-side navigation would wait for the connection; a full page load lets the
  // service worker answer with the saved copy (or the offline library) instead.
  const lastTap = useRef<{ href: string; at: number } | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute("download") || a.origin !== location.origin) return;
      lastTap.current = { href: a.href, at: Date.now() };
      if (!offline || !navigator.serviceWorker?.controller) return;
      e.preventDefault();
      e.stopPropagation();
      location.assign(a.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [offline]);

  // A tap that only discovered the connection was gone is stuck waiting; redo it as a page load.
  useEffect(() => {
    const tap = lastTap.current;
    if (offline && tap && Date.now() - tap.at < 5000 && tap.href !== location.href && navigator.serviceWorker?.controller) {
      lastTap.current = null;
      location.assign(tap.href);
    }
  }, [offline]);

  if (!offline) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 md:left-56 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <p className="card pointer-events-auto flex items-center gap-3 px-4 py-2 text-xs text-muted shadow-xl shadow-black/40">
        <span className="size-1.5 rounded-full bg-danger" aria-hidden />
        You&rsquo;re offline. Saved pages still work; anything you save goes through once you&rsquo;re back online, as long as the app stays open.
        {/* A full page load, so the service worker can answer it. */}
        <a href="/offline" className="text-ink underline">
          Browse offline
        </a>
      </p>
    </div>
  );
}
