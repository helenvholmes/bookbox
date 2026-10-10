"use client";

/* eslint-disable @next/next/no-img-element -- OpenLibrary thumbnails */
import { useEffect, useState } from "react";
import type { CoverCandidate } from "@/lib/openlibrary";

type Props = { title: string; author: string; isbn13: string; selected: string | null; onPick: (url: string) => void; onClose: () => void };

/** Covers from other editions on OpenLibrary, for the book form: tap one to use it. */
export function EditionCovers({ title, author, isbn13, selected, onPick, onClose }: Props) {
  // Searched once, with the details as they were when the panel opened.
  const [query] = useState(() => new URLSearchParams({ title, author, isbn: isbn13 }).toString());
  const [candidates, setCandidates] = useState<CoverCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/cover-candidates?${query}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (live) setCandidates(data);
      })
      .catch((err: Error) => live && setError(err.message || "Search failed."));
    return () => {
      live = false;
    };
  }, [query]);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">Covers from other editions</h2>
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={onClose}>
          Close
        </button>
      </div>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : candidates === null ? (
        <p className="text-sm text-muted">Searching OpenLibrary…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted">OpenLibrary doesn&rsquo;t have other covers for this one.</p>
      ) : (
        <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-2">
          {candidates.map((c) => (
            <li key={c.url} className="w-24 shrink-0">
              <button
                type="button"
                aria-pressed={selected === c.url}
                aria-label={`Use the cover from ${c.label}`}
                onClick={() => onPick(c.url)}
                className={`block w-full rounded-lg p-0.5 transition ${selected === c.url ? "ring-3 ring-accent" : "ring-0 hover:opacity-80"}`}
              >
                <img src={c.thumb} alt="" loading="lazy" className="aspect-[2/3] w-full rounded-md bg-pill object-cover" />
              </button>
              <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-tight text-muted">{c.label}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
