"use client";
/* eslint-disable @next/next/no-img-element -- covers are resized WebP served from our own route */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cachedIndex, loadIndex } from "@/lib/library-index";
import { searchBooks, type SearchEntry, type SearchHit } from "@/lib/search";

const SHOWN = 8;

type Props = {
  /** The search currently applied to the grid. */
  value: string;
  /** Applies a search to the grid (null clears it). */
  onSubmit: (q: string | null) => void;
};

/** The library search field, with results that appear as you type from a copy of the library in the browser. */
export function SearchBox({ value, onSubmit }: Props) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(value);
  const [entries, setEntries] = useState<SearchEntry[] | null>(cachedIndex);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);

  // Follow the URL when it changes elsewhere (Clear all, back/forward).
  const [applied, setApplied] = useState(value);
  if (value !== applied) {
    setApplied(value);
    setQ(value);
  }

  const hits = useMemo<SearchHit[]>(() => (entries && q.trim() ? searchBooks(entries, q) : []), [entries, q]);
  const shown = hits.slice(0, SHOWN);

  function refresh() {
    loadIndex().then(setEntries, () => {});
  }

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function submit() {
    setOpen(false);
    onSubmit(q.trim() || null);
  }

  return (
    <div ref={wrapper} className="relative">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        placeholder="Search titles, authors, series, tags, reviews"
        aria-label="Search books"
        role="combobox"
        aria-expanded={open && !!q.trim()}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="field pl-10"
        value={q}
        onFocus={() => {
          refresh();
          if (q.trim() && q !== value) setOpen(true);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          setActive(-1);
          setOpen(true);
          // Clearing the field clears the search straight away.
          if (!next.trim() && value) onSubmit(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!shown.length) return;
            e.preventDefault();
            setOpen(true);
            const last = shown.length; // the "See all" row
            setActive((i) => (e.key === "ArrowDown" ? (i >= last ? 0 : i + 1) : i <= 0 ? last : i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && active >= 0 && active < shown.length) {
              setOpen(false);
              router.push(`/books/${shown[active].entry.id}`);
            } else submit();
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />

      {open && q.trim() && entries && (
        <div id={listId} role="listbox" className="card absolute inset-x-0 top-full z-30 mt-2 overflow-hidden p-1 shadow-2xl shadow-black/50">
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted">No books match &ldquo;{q.trim()}&rdquo;.</p>
          ) : (
            <>
              {shown.map((h, i) => (
                <Link
                  key={h.entry.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={active === i}
                  href={`/books/${h.entry.id}`}
                  onClick={() => setOpen(false)}
                  onPointerEnter={() => setActive(i)}
                  className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${active === i ? "bg-raised" : ""}`}
                >
                  <span className="h-12 w-8 shrink-0 overflow-hidden rounded-[3px] bg-line">
                    {h.entry.cover && <img src={`/covers/${h.entry.cover}`} alt="" className="size-full object-cover" loading="lazy" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem]">{h.entry.title}</span>
                    <span className="block truncate text-xs text-muted">{detail(h)}</span>
                  </span>
                  {h.entry.year && <span className="shrink-0 text-xs text-faint">{h.entry.year}</span>}
                </Link>
              ))}
              <button
                type="button"
                id={`${listId}-${shown.length}`}
                role="option"
                aria-selected={active === shown.length}
                onClick={submit}
                onPointerEnter={() => setActive(shown.length)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-xs text-muted ${active === shown.length ? "bg-raised text-ink" : ""}`}
              >
                {hits.length > SHOWN ? `See all ${hits.length} results` : `Show ${hits.length === 1 ? "this" : `these ${hits.length}`} in the library`} ↵
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The author, plus where the match was when it wasn't the title or author. */
function detail({ entry, field }: SearchHit) {
  const extra =
    field === "series" ? entry.series : field === "tags" ? `Tagged ${entry.tags}` : field === "text" ? "In your notes" : field === "isbn" ? entry.isbn : "";
  return [entry.author, extra].filter(Boolean).join(" · ");
}
