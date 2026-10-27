/**
 * Remembers recent catalog lookups in memory, so searching again, going back to a result or asking for
 * more results is instant. The same lookup arriving while one is in progress waits for that one.
 * Failed lookups aren't kept. Catalog data is public, so the cache is shared by every library on the server.
 */
const MAX_ENTRIES = 300;

type Entry = { value: Promise<unknown>; expires: number };
const entries = new Map<string, Entry>();

/** `fn()`'s result for `key`, kept for `ttl(result)` milliseconds. */
export function cached<T>(key: string, fn: () => Promise<T>, ttl: (value: T) => number): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) {
    // Most recently used last, so the oldest is first to go.
    entries.delete(key);
    entries.set(key, hit);
    return hit.value as Promise<T>;
  }

  const entry: Entry = { value: Promise.resolve(), expires: Infinity };
  entry.value = fn().then(
    (value) => {
      entry.expires = Date.now() + ttl(value);
      return value;
    },
    (err) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw err;
    },
  );
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return entry.value as Promise<T>;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
