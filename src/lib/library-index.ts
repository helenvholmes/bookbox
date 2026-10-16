"use client";

import type { SearchEntry } from "./search";

/**
 * The browser's copy of the search index. Fetched on first use and revalidated (a 304 when
 * nothing changed) each time search is opened; the service worker keeps a copy for offline use.
 */
let current: SearchEntry[] | null = null;
let inflight: Promise<SearchEntry[]> | null = null;

export function cachedIndex(): SearchEntry[] | null {
  return current;
}

export function loadIndex(): Promise<SearchEntry[]> {
  inflight ??= fetch("/api/library", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`Library index: ${r.status}`);
      return r.json() as Promise<SearchEntry[]>;
    })
    .then((entries) => {
      // Keep the same array when nothing changed, so the prepared search data is reused.
      if (!current || JSON.stringify(current) !== JSON.stringify(entries)) current = entries;
      return current;
    })
    .catch((err: unknown) => {
      if (current) return current;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
