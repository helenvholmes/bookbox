"use client";

import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useEffect, useRef, useState } from "react";
import { flush, SYNCED_EVENT, useOutbox } from "@/lib/outbox";

// Saved for offline use in the background: the index, these pages, and every cover.
const OFFLINE_PAGES = ["/", "/people", "/tags", "/series", "/stats"];
const WARM_EVERY = 6 * 60 * 60 * 1000;
const WARMED_KEY = "bookbox:warmed";

/**
 * Registers the service worker, keeps the offline copy fresh, sends edits made offline once the
 * app is back online, and says so when the connection drops.
 */
export function OfflineSupport() {
  const router = useRouter();
  const failing = useOffline(); // a request failed, e.g. the server is unreachable
  const [noNetwork, setNoNetwork] = useState(false); // the device knows it's offline, e.g. opened in airplane mode
  const offline = failing || noNetwork;
  const outbox = useOutbox();

  // Send queued edits whenever there's a chance they'll get through: on open, on reconnecting,
  // and on coming back to the app (iOS doesn't let web apps sync in the background).
  useEffect(() => {
    void flush();
    const onVisible = () => document.visibilityState === "visible" && void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => {
    if (!offline) void flush();
  }, [offline]);

  // Once edits land: show the server's copy, and re-save the affected pages for offline use so a
  // later offline visit doesn't show the old version.
  useEffect(() => {
    const onSynced = (e: Event) => {
      const { books } = (e as CustomEvent<{ books: number[] }>).detail;
      router.refresh();
      navigator.serviceWorker?.controller?.postMessage({ type: "refresh", urls: ["/", ...books.map((id) => `/books/${id}`)] });
    };
    window.addEventListener(SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SYNCED_EVENT, onSynced);
  }, [router]);

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

  const waiting = outbox.ops.length;
  if (!offline) {
    if (!waiting || outbox.state === "syncing" || outbox.state === "idle") return null;
    // Online, but edits couldn't be sent (the server was unreachable, or the session expired).
    return (
      <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 md:left-56 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p className="card pointer-events-auto flex items-center gap-3 px-4 py-2 text-xs text-muted shadow-xl shadow-black/40">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          {changes(waiting)} waiting to sync.
          {outbox.state === "signed-out" ? (
            <a href="/login" className="text-ink underline">
              Sign in
            </a>
          ) : (
            <button type="button" className="text-ink underline" onClick={() => void flush()}>
              Try again
            </button>
          )}
        </p>
      </div>
    );
  }
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 md:left-56 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <p className="card pointer-events-auto flex items-center gap-3 px-4 py-2 text-xs text-muted shadow-xl shadow-black/40">
        <span className="size-1.5 rounded-full bg-danger" aria-hidden />
        You&rsquo;re offline. Status, ratings, reads and notes still save{waiting ? ` (${changes(waiting)} waiting)` : ""}, and sync when you&rsquo;re back.
        {/* A full page load, so the service worker can answer it. */}
        <a href="/offline" className="text-ink underline">
          Browse offline
        </a>
      </p>
    </div>
  );
}

const changes = (n: number) => `${n} ${n === 1 ? "change" : "changes"}`;
