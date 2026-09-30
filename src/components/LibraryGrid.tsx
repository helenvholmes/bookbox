"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookSummary } from "@/lib/books";
import { BookGrid } from "./BookGrid";

const BATCH = 120;

/**
 * Books already loaded for each set of filters, kept while the app stays open so coming back from
 * a book lands where you were instead of at the first batch.
 */
const loaded = new Map<string, BookSummary[]>();

type Props = {
  /** The first batch, rendered by the server. */
  initial: BookSummary[];
  total: number;
  /** The page's filters as a query string, passed on to /api/books. */
  query: string;
  empty: string;
};

/** The library grid: the first batch straight away, the rest as you scroll towards the end. */
export function LibraryGrid({ initial, total, query, empty }: Props) {
  const [books, setBooks] = useState(() => {
    const kept = loaded.get(query);
    // Only reuse what was kept if it still starts the same way; otherwise the library changed.
    const same = kept && kept.length > initial.length && initial.every((b, i) => kept[i]?.id === b.id);
    return same ? [...initial, ...kept.slice(initial.length)] : initial;
  });
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);

  // The server sent a new first batch (the page refreshed after a sync or an edit): show it, and
  // re-fetch whatever was loaded beyond it so those books are current too.
  const [shownInitial, setShownInitial] = useState(initial);
  if (initial !== shownInitial) {
    setShownInitial(initial);
    const ids = new Set(initial.map((b) => b.id));
    setBooks((current) => [...initial, ...current.slice(shownInitial.length).filter((b) => !ids.has(b.id))]);
  }
  const extra = books.length - initial.length;
  useEffect(() => {
    if (extra <= 0) return;
    let stale = false;
    fetch(`/api/books?${query}${query ? "&" : ""}offset=${initial.length}&limit=${extra}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ books: BookSummary[] }>) : null))
      .then((data) => {
        if (stale || !data) return;
        const all = [...initial, ...data.books];
        loaded.set(query, all);
        setBooks(all);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
    // Only when a new first batch arrives, not each time more books load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const sentinel = useRef<HTMLDivElement>(null);
  const more = books.length < total;

  const loadMore = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setFailed(false);
    try {
      const res = await fetch(`/api/books?${query}${query ? "&" : ""}offset=${books.length}&limit=${BATCH}`);
      if (!res.ok) throw new Error(String(res.status));
      const { books: next } = (await res.json()) as { books: BookSummary[] };
      setBooks((current) => {
        const have = new Set(current.map((b) => b.id));
        const all = [...current, ...next.filter((b) => !have.has(b.id))];
        loaded.set(query, all);
        return all;
      });
    } catch {
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }, [books.length, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || failed) return;
    // Start well before the end comes into view, so scrolling rarely catches up with it.
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), { rootMargin: "1500px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [more, failed, loadMore]);

  return (
    <>
      <BookGrid books={books} empty={empty} />
      {more && (
        <div ref={sentinel} className="py-6 text-center text-sm text-muted" aria-live="polite">
          {failed ? (
            <>
              Couldn&rsquo;t load the rest.{" "}
              <button type="button" className="text-ink underline" onClick={() => void loadMore()}>
                Try again
              </button>{" "}
              {/* A full page load, so the service worker can answer it. */}
              or{" "}
              <a href="/offline" className="text-ink underline">
                browse offline
              </a>
              .
            </>
          ) : (
            `Loading more… (${books.length} of ${total})`
          )}
        </div>
      )}
    </>
  );
}
