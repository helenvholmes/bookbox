"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "bookbox:spotify-synced";
const EVERY_MS = 2 * 60 * 1000;

/**
 * Asks the server to pull Spotify listening progress when the app opens or comes back into view
 * (the server also skips it if it ran in the last few minutes), and refreshes the page when
 * something changed. Does nothing when Spotify isn't connected.
 */
export function SpotifySync() {
  const router = useRouter();
  useEffect(() => {
    const sync = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < EVERY_MS) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {}
      const res = await fetch("/api/spotify/sync", { method: "POST" }).catch(() => null);
      if (!res?.ok) return;
      const { changed } = (await res.json()) as { changed: number[] };
      if (changed.length) router.refresh();
    };
    void sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [router]);
  return null;
}
