"use client";

/* eslint-disable @next/next/no-img-element -- OpenLibrary thumbnails */
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveIsbnAction, skipIsbnAction } from "@/app/(app)/missing-isbns/actions";
import type { IsbnCandidate } from "@/lib/openlibrary";
import { Cover } from "./Cover";

type Props = { book: { id: number; title: string; author: string; cover: string | null; bad_isbn: string | null } };

export function IsbnPicker({ book }: Props) {
  const [candidates, setCandidates] = useState<IsbnCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  async function find() {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/isbn-candidates?id=${book.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCandidates(data);
    } catch (err) {
      setError((err as Error).message || "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  const save = (isbn: string, work: string | null = null, edition: string | null = null) =>
    startSaving(async () => {
      const result = await saveIsbnAction(book.id, isbn, work, edition);
      if (result.error) setError(result.error);
    });

  return (
    <li className="card space-y-4 p-4">
      <div className="flex gap-4">
        <div className="w-12 shrink-0">
          <Cover cover={book.cover} title={book.title} className="rounded-sm" />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/books/${book.id}`} className="line-clamp-2 leading-snug hover:underline">
            {book.title}
          </Link>
          {book.author && <p className="text-sm text-muted">{book.author}</p>}
          {book.bad_isbn && <p className="mt-0.5 text-xs text-danger">Airtable had an invalid ISBN: “{book.bad_isbn}”</p>}
        </div>
      </div>

      {candidates === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary rounded-full px-4" onClick={find} disabled={searching}>
            {searching ? "Searching…" : "Find ISBN"}
          </button>
          <button type="button" className="ml-auto text-sm text-muted hover:text-ink" onClick={() => startSaving(() => skipIsbnAction(book.id))} disabled={saving}>
            No ISBN
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted">OpenLibrary has no editions with an ISBN for this one.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {candidates.map((c) => (
                <li key={c.isbn13}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => save(c.isbn13, c.work, c.edition)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-[0.8125rem] hover:bg-raised disabled:opacity-60"
                  >
                    {c.thumb ? <img src={c.thumb} alt="" loading="lazy" className="h-10 w-7 shrink-0 rounded-sm bg-raised object-cover" /> : <span className="h-10 w-7 shrink-0 rounded-sm bg-raised" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs tabular-nums">{c.isbn13}</span>
                      <span className="block truncate text-xs text-muted">{c.label}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">Use</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) save(typed.trim());
            }}
          >
            <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" placeholder="Or type the ISBN from the book" aria-label="ISBN" className="field min-w-0 flex-1 text-sm" />
            <button className="btn rounded-full px-4" disabled={saving || !typed.trim()}>
              Save
            </button>
            <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => startSaving(() => skipIsbnAction(book.id))} disabled={saving}>
              No ISBN
            </button>
          </form>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </li>
  );
}
