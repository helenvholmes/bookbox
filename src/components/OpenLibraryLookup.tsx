"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LookupResult, Source } from "@/lib/catalogs";
import type { OLDetails } from "@/lib/openlibrary";
import { BarcodeScanner } from "./BarcodeScanner";
import { LookupCover } from "./LookupCover";

const SOURCE_NAMES: Record<Source, string> = { openlibrary: "OpenLibrary", loc: "Library of Congress", inventaire: "Inventaire" };

type Props = {
  initialQuery?: string;
  autoSearch?: boolean;
  onPick: (details: OLDetails) => void;
  onCancel?: () => void;
  /** Open the camera straight away (the "Scan a barcode" tile). */
  startScanning?: boolean;
};

export function OpenLibraryLookup({ initialQuery = "", autoSearch = false, onPick, onCancel, startScanning = false }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LookupResult[] | null>(null);
  // Whether the Library of Congress and Inventaire have been searched for this query too.
  const [searchedMore, setSearchedMore] = useState(false);
  const willAutoSearch = autoSearch && !!initialQuery.trim();
  const [status, setStatus] = useState<"idle" | "searching" | "loading">(willAutoSearch ? "searching" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [scanning, setScanning] = useState(startScanning);
  const [existing, setExisting] = useState<{ id: number; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchId = useRef(0);

  function search(q: string) {
    if (!q.trim()) return;
    setStatus("searching");
    setError(null);
    setExisting(null);
    return fetchResults(q);
  }

  /** A scanned ISBN: warn if it's already in the library, otherwise fill the form with the match. */
  async function onScanned(isbn: string) {
    setScanning(false);
    setQuery(isbn);
    setStatus("searching");
    setError(null);
    const [owned, results] = await Promise.all([
      fetch(`/api/books/by-isbn?isbn=${isbn}`)
        .then((r) => r.json() as Promise<{ id: number; title: string } | null>)
        .catch(() => null),
      fetchResults(isbn),
    ]);
    setExisting(owned);
    if (!owned && results && results.length > 0) pick(results[0]);
  }

  // Only sets state after awaiting, so it can also run from the mount effect.
  async function fetchResults(q: string) {
    const id = ++searchId.current;
    try {
      const res = await fetch(`/api/openlibrary?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (id !== searchId.current) return null;
      if (!res.ok) throw new Error(data.error);
      const results = data as LookupResult[];
      setResults(results);
      // With nothing on OpenLibrary, the server has already asked the others.
      setSearchedMore(!results.some((r) => r.source === "openlibrary"));
      return results;
    } catch (err) {
      if (id === searchId.current) setError((err as Error).message || "Search failed.");
      return null;
    } finally {
      if (id === searchId.current) setStatus("idle");
    }
  }

  /** Adds the Library of Congress's and Inventaire's results below OpenLibrary's. */
  async function searchMore() {
    const id = ++searchId.current;
    setStatus("searching");
    setError(null);
    try {
      const res = await fetch(`/api/openlibrary?more=1&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (id !== searchId.current) return;
      if (!res.ok) throw new Error(data.error);
      setResults((prev) => [...(prev ?? []), ...(data as LookupResult[])]);
      setSearchedMore(true);
    } catch (err) {
      if (id === searchId.current) setError((err as Error).message || "Search failed.");
    } finally {
      if (id === searchId.current) setStatus("idle");
    }
  }

  async function pick(r: LookupResult) {
    // The other catalogs' results already carry everything they know.
    if (r.details) return onPick(r.details);
    setPicking(r.work);
    setStatus("loading");
    setError(null);
    try {
      const params = new URLSearchParams({ work: r.work });
      if (r.edition) params.set("edition", r.edition);
      if (r.isbn13) params.set("isbn", r.isbn13);
      const res = await fetch(`/api/openlibrary?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const details = data as OLDetails;
      // Search results know the authors and ISBN even when the work/edition records don't.
      onPick({
        ...details,
        author: details.author || r.authors[0] || "",
        additional_authors: details.additional_authors || r.authors.slice(1).join(", "),
        isbn13: details.isbn13 || r.isbn13,
        publisher: details.publisher || r.publisher,
        pages: details.pages ?? r.pages,
        publish_year: details.publish_year ?? r.year,
        coverUrl: details.coverUrl || r.coverUrl,
      });
    } catch (err) {
      setError((err as Error).message || "Couldn't load that book.");
    } finally {
      setPicking(null);
      setStatus("idle");
    }
  }

  useEffect(() => {
    if (willAutoSearch) fetchResults(initialQuery);
    else if (!startScanning) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, []);

  return (
    <div className="space-y-3">
      {/* Not a <form>: this sits inside the book form. */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          className="field"
          placeholder="Title, author or ISBN"
          aria-label="Search for a book"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search(query);
            }
          }}
        />
        <button type="button" className="btn btn-primary shrink-0" disabled={status !== "idle" || !query.trim()} onClick={() => search(query)}>
          {status === "searching" ? "Searching…" : "Search"}
        </button>
        <button type="button" className="btn shrink-0 px-3" title="Scan a barcode" onClick={() => setScanning(true)}>
          <svg viewBox="0 0 24 24" className="size-[1.125rem]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6" />
          </svg>
          <span className="hidden sm:inline">Scan</span>
          <span className="sr-only sm:hidden">Scan a barcode</span>
        </button>
      </div>

      {scanning && <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />}

      {existing && (
        <div className="card flex items-center justify-between gap-3 p-3 text-sm">
          <span className="min-w-0">
            <span className="text-muted">Already in your library:</span> <span className="text-ink">{existing.title}</span>
          </span>
          <Link href={`/books/${existing.id}`} className="btn shrink-0">
            Open
          </Link>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {results && results.length === 0 && status === "idle" && (
        <p className="text-sm text-muted">Nothing found on OpenLibrary, the Library of Congress or Inventaire. Try fewer words, or enter the book by hand.</p>
      )}

      {results && results.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden card">
          {results.map((r) => (
            <li key={r.source + r.work + r.edition}>
              <button
                type="button"
                disabled={status === "loading"}
                onClick={() => pick(r)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-raised disabled:opacity-60"
              >
                {r.coverUrl ? (
                  <LookupCover
                    key={r.coverUrl}
                    src={r.source === "openlibrary" ? r.coverUrl.replace("-L.jpg", "-S.jpg") : r.coverUrl}
                    isbn={r.isbn13}
                    className="h-16 w-11 shrink-0 rounded bg-line object-cover"
                    lazy
                  />
                ) : (
                  <div className="h-16 w-11 shrink-0 rounded bg-line" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-medium">{r.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {[r.authors.slice(0, 2).join(", "), r.year, r.source !== "openlibrary" && SOURCE_NAMES[r.source]].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-accent">{picking === r.work ? "Loading…" : "Use"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {results && results.length > 0 && !searchedMore && (
        <button type="button" className="text-sm text-accent underline" disabled={status !== "idle"} onClick={searchMore}>
          {status === "searching" ? "Searching the Library of Congress and Inventaire…" : "Not here? Search the Library of Congress and Inventaire"}
        </button>
      )}

      {onCancel && (
        <button type="button" className="text-sm text-muted underline" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
