"use client";

/* eslint-disable @next/next/no-img-element -- OpenLibrary thumbnails */
import Link from "next/link";
import { useState, useTransition } from "react";
import { applyCoverAction, skipCoverAction } from "@/app/missing-covers/actions";
import type { CoverCandidate } from "@/lib/openlibrary";
import { Cover } from "./Cover";

type Props = { book: { id: number; title: string; author: string; isbn13: string | null } };

export function CoverPicker({ book }: Props) {
  const [candidates, setCandidates] = useState<CoverCandidate[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "searching">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  async function find() {
    setStatus("searching");
    setError(null);
    try {
      const res = await fetch(`/api/cover-candidates?id=${book.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCandidates(data);
      setSelected(data[0]?.url ?? null);
    } catch (err) {
      setError((err as Error).message || "Search failed.");
    } finally {
      setStatus("idle");
    }
  }

  function save() {
    if (!selected) return;
    startSaving(async () => {
      const result = await applyCoverAction(book.id, selected);
      if (result.error) setError(result.error);
    });
  }

  return (
    <li className="card space-y-4 p-4">
      <div className="flex gap-4">
        <div className="w-14 shrink-0">
          <Cover cover={null} title={book.title} className="rounded-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/books/${book.id}`} className="line-clamp-2 leading-snug font-medium">
            {book.title}
          </Link>
          {book.author && <p className="truncate text-sm font-semibold text-muted">{book.author}</p>}
          <p className="text-xs font-semibold text-muted/80">{book.isbn13 ? `ISBN ${book.isbn13}` : "No ISBN"}</p>
        </div>
      </div>

      {candidates === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={find} disabled={status === "searching"}>
            {status === "searching" ? "Searching…" : "Find covers"}
          </button>
          <Link href={`/books/${book.id}/edit`} className="btn">
            Upload photo
          </Link>
          <button type="button" className="ml-auto text-sm font-medium text-muted" onClick={() => startSaving(() => skipCoverAction(book.id))} disabled={saving}>
            No cover
          </button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted">OpenLibrary doesn&rsquo;t have a cover for this one.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/books/${book.id}/edit`} className="btn">
              Upload photo
            </Link>
            <button type="button" className="btn" onClick={() => startSaving(() => skipCoverAction(book.id))} disabled={saving}>
              No cover
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-2">
            {candidates.map((c) => (
              <li key={c.url} className="w-24 shrink-0">
                <button
                  type="button"
                  aria-pressed={selected === c.url}
                  onClick={() => setSelected(c.url)}
                  className={`block w-full rounded-lg p-0.5 transition ${selected === c.url ? "ring-3 ring-accent" : "ring-0"}`}
                >
                  <img src={c.thumb} alt="" loading="lazy" className="aspect-[2/3] w-full rounded-md bg-pill object-cover" />
                </button>
                <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-tight font-semibold text-muted">{c.label}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" onClick={save} disabled={!selected || saving}>
              {saving ? "Saving…" : "Use this cover"}
            </button>
            <button type="button" className="ml-auto text-sm font-medium text-muted" onClick={() => startSaving(() => skipCoverAction(book.id))} disabled={saving}>
              None of these
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </li>
  );
}
