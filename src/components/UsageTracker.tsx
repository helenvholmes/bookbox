"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { USAGE_EVENT, type ClientKind } from "@/lib/usage-events";

type Queued = { kind: ClientKind; path: string; at: number; detail: Record<string, unknown> };

// A rage click: RAGE_CLICKS or more clicks within RAGE_GAP_MS of each other, all within RAGE_RADIUS pixels.
const RAGE_CLICKS = 3;
const RAGE_GAP_MS = 700;
const RAGE_RADIUS = 40;
const MAX_ERRORS = 5; // per page load, so a loop that throws can't flood the table

/**
 * Reports what someone does to /api/usage (see src/lib/usage.ts): the pages they open, rage
 * clicks, and errors. Only rendered for people other than the owner. Events are queued and sent
 * every few seconds and when the page is hidden.
 */
export function UsageTracker() {
  const pathname = usePathname();
  const queue = useRef<Queued[]>([]);
  const path = useRef(pathname);

  useEffect(() => {
    path.current = pathname;
    push("page", {});
  }, [pathname]);

  function push(kind: ClientKind, detail: Record<string, unknown>) {
    if (queue.current.length >= 200) return;
    queue.current.push({ kind, path: path.current, at: Date.now(), detail });
  }

  useEffect(() => {
    function flush() {
      if (!queue.current.length || !navigator.onLine) return;
      const body = JSON.stringify({ events: queue.current.splice(0) });
      const sent = navigator.sendBeacon?.("/api/usage", new Blob([body], { type: "application/json" }));
      if (!sent) fetch("/api/usage", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    push("open", { standalone, phone: window.matchMedia("(max-width: 767px)").matches });

    // Rage clicks: report a burst once it's over, with how many clicks it had.
    let clicks: { t: number; x: number; y: number }[] = [];
    let burst: { target: string; count: number; timer: ReturnType<typeof setTimeout> } | null = null;
    function onClick(e: MouseEvent) {
      const now = Date.now();
      clicks = clicks.filter((c) => now - c.t < RAGE_GAP_MS * RAGE_CLICKS && Math.hypot(c.x - e.clientX, c.y - e.clientY) < RAGE_RADIUS);
      const last = clicks.at(-1);
      if (last && now - last.t > RAGE_GAP_MS) clicks = [];
      clicks.push({ t: now, x: e.clientX, y: e.clientY });
      if (clicks.length < RAGE_CLICKS) return;
      if (burst) clearTimeout(burst.timer);
      const target = burst?.target ?? describe(e.target);
      const count = clicks.length;
      burst = {
        target,
        count,
        timer: setTimeout(() => {
          push("rage_click", { target, clicks: count });
          burst = null;
          clicks = [];
        }, RAGE_GAP_MS),
      };
    }

    let errors = 0;
    function onError(e: ErrorEvent) {
      // Harmless browser noise.
      if (!e.message || /ResizeObserver loop/.test(e.message) || errors++ >= MAX_ERRORS) return;
      push("js_error", { message: e.message, at: e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : "" });
    }
    function onRejection(e: PromiseRejectionEvent) {
      if (errors++ >= MAX_ERRORS) return;
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
      push("js_error", { message: `Unhandled: ${reason}` });
    }
    // Events from other components (trackInBrowser).
    function onUsage(e: Event) {
      const { kind, detail } = (e as CustomEvent<{ kind: ClientKind; detail: Record<string, unknown> }>).detail;
      push(kind, detail ?? {});
    }
    const onHide = () => document.visibilityState === "hidden" && flush();

    document.addEventListener("click", onClick, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener(USAGE_EVENT, onUsage);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    const interval = setInterval(flush, 10_000);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener(USAGE_EVENT, onUsage);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      clearInterval(interval);
      if (burst) clearTimeout(burst.timer);
      flush();
    };
  }, []);

  return null;
}

/** What was clicked, in a few words: "button “Save”", "a “Library”", "img". Never what's typed in a field. */
function describe(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "";
  const el = target.closest("button, a, [role=button], [role=tab], label, summary, input, select, textarea") ?? target;
  const tag = el.tagName.toLowerCase();
  const typed = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  const name =
    el.getAttribute("aria-label") ||
    (typed ? (el as HTMLInputElement).name || (el as HTMLInputElement).placeholder : el.textContent) ||
    el.getAttribute("title") ||
    el.getAttribute("alt") ||
    "";
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  return clean ? `${tag} “${clean}”` : tag;
}
