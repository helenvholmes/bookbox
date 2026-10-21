"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { todayLocal } from "@/lib/dates";
import { demoMode } from "@/lib/demo";

const KEY = "bookbox:background-synced";
const EVERY_MS = 2 * 60 * 1000;
const ENDPOINTS = ["/api/spotify/sync", "/api/libby/sync"];

/**
 * Asks the server to pull Spotify listening progress and Libby loans when the app opens or comes
 * back into view (the server also skips each if it ran recently), and refreshes the page when
 * something changed. Each does nothing when it isn't connected, and the demo has neither.
 */
export function BackgroundSync() {
  const router = useRouter();
  useEffect(() => {
    if (demoMode()) return;
    const sync = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < EVERY_MS) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {}
      const body = JSON.stringify({ today: todayLocal(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      const changed = await Promise.all(
        ENDPOINTS.map(async (url) => {
          const res = await fetch(url, { method: "POST", body }).catch(() => null);
          if (!res?.ok) return false;
          const { changed } = (await res.json().catch(() => ({}))) as { changed?: number[] };
          return !!changed?.length;
        }),
      );
      if (changed.some(Boolean)) router.refresh();
    };
    void sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [router]);
  return null;
}
