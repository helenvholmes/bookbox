"use client";

import { useEffect, useMemo, useState } from "react";
import { loadIndex } from "@/lib/library-index";
import { searchBooks, type SearchEntry } from "@/lib/search";
import { Cover } from "./Cover";
import { Stars } from "./Stars";

const SHELVES = ["Currently Reading", "To Read", "Read"];

/** The library from the saved index: search, a shelf filter, and links to any pages saved for offline use. */
export function OfflineLibrary() {
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [shelf, setShelf] = useState("");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    loadIndex().then(setEntries, () => setFailed(true));
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const books = useMemo(() => {
    if (!entries) return [];
    const list = q.trim() ? searchBooks(entries, q).map((h) => h.entry) : entries;
    return shelf ? list.filter((b) => b.shelf === shelf) : list;
  }, [entries, q, shelf]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="display text-3xl">{online ? "BookBox can’t be reached" : "You’re offline"}</h1>
          <p className="mt-1 text-sm text-muted">That page isn&rsquo;t saved on this device, but here&rsquo;s your library as it was last saved.</p>
        </div>
        <button type="button" className="btn" onClick={() => location.reload()}>
          Try again
        </button>
      </header>

      {failed ? (
        <p className="py-16 text-center text-muted">Your library hasn&rsquo;t been saved on this device yet. Open BookBox once while online.</p>
      ) : !entries ? (
        <p className="py-16 text-center text-muted">Loading…</p>
      ) : (
        <>
          <div className="space-y-3">
            <input
              type="search"
              inputMode="search"
              placeholder="Search titles, authors, series, tags, reviews"
              aria-label="Search books"
              className="field"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div role="tablist" aria-label="Shelves" className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto border-b border-line px-4">
              {["", ...SHELVES].map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  role="tab"
                  aria-selected={shelf === s}
                  onClick={() => setShelf(s)}
                  className={`-mb-px shrink-0 border-b-2 pt-1 pb-2.5 text-[0.8125rem] whitespace-nowrap transition ${
                    shelf === s ? "border-ink text-ink" : "border-transparent text-faint hover:text-muted"
                  }`}
                >
                  {s === "" ? "All" : s === "Currently Reading" ? "Reading" : s}
                </button>
              ))}
            </div>
          </div>

          {books.length === 0 ? (
            <p className="py-16 text-center text-muted">No books match.</p>
          ) : (
            <div className="@container">
              <ul className="grid grid-cols-2 gap-6 @md:grid-cols-3 @2xl:grid-cols-4 @2xl:gap-5 @4xl:grid-cols-5 @4xl:gap-6">
                {books.map((b, i) => (
                  <li key={b.id} className="[contain-intrinsic-size:auto_25rem] [content-visibility:auto]">
                    {/* Plain links: a full page load lets the service worker answer with a saved copy. */}
                    <a href={`/books/${b.id}`} className="card flex h-full flex-col overflow-hidden text-center">
                      <Cover cover={b.cover} title={b.title} author={b.author} eager={i < 8} bleed />
                      <div className="flex flex-1 flex-col items-center px-3 pt-3.5 pb-2">
                        <p className="text-[0.8125rem] leading-snug">{b.title}</p>
                        {b.author && <p className="mt-0.5 text-xs text-muted">{b.author}</p>}
                        <span className="mt-auto pt-2.5">
                          <Stars rating={b.rating} />
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
