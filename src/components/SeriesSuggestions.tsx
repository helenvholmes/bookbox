"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addSeriesBookAction } from "@/app/(app)/series/actions";
import type { SeriesEntry } from "@/lib/hardcover";
import { ClampedTitle } from "./ClampedTitle";
import { Cover } from "./Cover";

/** The rest of a series from Hardcover: tiles like BookGrid's, each with "Add to To Read" on hover (always shown on touch screens). */
export function SeriesSuggestions({ seriesId, books }: { seriesId: number; books: SeriesEntry[] }) {
  return (
    <div className="@container">
      <ul className="grid grid-cols-2 gap-6 @md:grid-cols-3 @2xl:grid-cols-4 @2xl:gap-5 @4xl:grid-cols-5 @4xl:gap-6">
        {books.map((b) => (
          <Suggestion key={b.url} seriesId={seriesId} book={b} />
        ))}
      </ul>
    </div>
  );
}

function Suggestion({ seriesId, book }: { seriesId: number; book: SeriesEntry }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; bookId?: number } | null>(null);
  const add = () =>
    start(async () => {
      setResult(await addSeriesBookAction(seriesId, book.url));
    });

  return (
    <li className="group card relative flex h-full flex-col overflow-hidden text-center">
      <div className="relative">
        <Cover cover={book.image} title={book.title} author={book.author} bleed />
        <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          {result?.bookId ? (
            <Link href={`/books/${result.bookId}`} className="btn rounded-full px-3 text-xs">
              Added · Open
            </Link>
          ) : (
            <button type="button" onClick={add} disabled={pending} className="btn btn-primary rounded-full px-3 text-xs">
              {pending ? "Adding…" : "Add to To Read"}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center px-3 pt-3.5 pb-3">
        {book.position != null && <p className="mb-0.5 text-[0.6875rem] text-faint">Book {book.position}</p>}
        <ClampedTitle title={book.title} className="text-[0.8125rem] leading-snug" />
        {book.author && <p className="mt-0.5 text-xs text-muted">{book.author}</p>}
        {book.year && <p className="mt-0.5 text-xs text-faint">{book.year}</p>}
        {result?.error && <p className="mt-2 text-xs text-danger">{result.error}</p>}
        <a href={book.url} target="_blank" rel="noreferrer" className="mt-auto pt-2 text-[0.6875rem] text-faint hover:text-muted">
          On Hardcover ↗
        </a>
      </div>
    </li>
  );
}
