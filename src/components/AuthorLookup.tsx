"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { finishLookupAction, lookUpAuthorsAction } from "@/app/(app)/authors/actions";

/** One run at a time across the app (and React running effects twice in development). */
let running = false;

/**
 * Looks up authors that haven't been yet on Wikidata, a batch at a time, while you're on the page,
 * then refreshes it. Shows nothing when there's nothing to look up.
 */
export function AuthorLookup({ remaining }: { remaining: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(remaining);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (remaining <= 0 || running) return;
    running = true;
    let cancelled = false;
    (async () => {
      try {
        for (let n = remaining; n > 0 && !cancelled; ) {
          const r = await lookUpAuthorsAction();
          if (r.error) return setError(r.error);
          // Nothing got checked (the batch failed to change anything): stop rather than loop.
          if (r.remaining >= n) break;
          n = r.remaining;
          setLeft(n);
        }
        await finishLookupAction();
        if (!cancelled) router.refresh();
      } finally {
        running = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [remaining, router]);

  if (error) return <p className="text-xs text-danger">{error}</p>;
  if (left <= 0) return null;
  return (
    <p className="text-xs text-muted" aria-live="polite">
      Looking up {left.toLocaleString()} {left === 1 ? "author" : "authors"} on Wikidata…
    </p>
  );
}
