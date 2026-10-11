"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { finishGoodreadsImportAction, goodreadsCoversAction, importGoodreadsAction, previewGoodreadsAction } from "@/app/(app)/settings/actions";
import type { GoodreadsBook } from "@/lib/goodreads";

const BOOK_BATCH = 25;
const COVER_BATCH = 6;

type Step =
  | { kind: "pick" }
  | { kind: "reading" }
  | { kind: "preview"; books: GoodreadsBook[] }
  | { kind: "importing"; done: number; total: number }
  | { kind: "covers"; done: number; total: number; found: number; added: number }
  | { kind: "done"; added: number; covers: number; withoutCover: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Settings → Import from Goodreads: pick the export, see what's coming in (books that look like
 * ones you already have are left out unless you tick them), then add them a batch at a time and
 * fetch their covers. Keep the page open while it runs.
 */
export function GoodreadsImport() {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [addAnyway, setAddAnyway] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    setError(null);
    setStep({ kind: "reading" });
    try {
      const result = await previewGoodreadsAction(await file.text());
      if (result.error || !result.books) throw new Error(result.error ?? "That file couldn’t be read.");
      setAddAnyway(new Set());
      setStep({ kind: "preview", books: result.books });
    } catch (err) {
      setError((err as Error).message || "That file couldn’t be read.");
      setStep({ kind: "pick" });
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function run(books: GoodreadsBook[]) {
    setError(null);
    const added: { id: number; isbn13: string | null }[] = [];
    try {
      for (let i = 0; i < books.length; i += BOOK_BATCH) {
        setStep({ kind: "importing", done: i, total: books.length });
        added.push(...(await importGoodreadsAction(books.slice(i, i + BOOK_BATCH))));
      }
      const withIsbn = added.filter((b): b is { id: number; isbn13: string } => !!b.isbn13);
      let found = 0;
      for (let i = 0; i < withIsbn.length; i += COVER_BATCH) {
        setStep({ kind: "covers", done: i, total: withIsbn.length, found, added: added.length });
        // A cover that fails is left for the Missing covers page; the import carries on.
        found += await goodreadsCoversAction(withIsbn.slice(i, i + COVER_BATCH)).catch(() => 0);
      }
      setStep({ kind: "done", added: added.length, covers: found, withoutCover: added.length - found });
    } catch {
      setError(`The import stopped after ${plural(added.length, "book")}. Import the file again to add the rest: the ones already added will show as in your library.`);
      setStep({ kind: "done", added: added.length, covers: 0, withoutCover: added.length });
    } finally {
      await finishGoodreadsImportAction().catch(() => {});
    }
  }

  return (
    <section id="goodreads" className="max-w-xl scroll-mt-8 space-y-3">
      <h2 className="section-title">Import from Goodreads</h2>
      <p className="text-sm text-muted">
        Brings in your books, shelves, ratings, reviews and the dates you finished them. On Goodreads, open{" "}
        <a href="https://www.goodreads.com/review/import" target="_blank" rel="noreferrer" className="text-ink underline">
          My Books → Import and export
        </a>
        , choose <span className="text-ink">Export Library</span>, and download the file when it&rsquo;s ready.
      </p>

      <div className="card p-5 text-sm">
        {step.kind === "pick" || step.kind === "reading" ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              id="goodreads-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void read(file);
              }}
            />
            <label htmlFor="goodreads-file" className={`btn btn-primary cursor-pointer rounded-full px-4 ${step.kind === "reading" ? "pointer-events-none opacity-60" : ""}`}>
              {step.kind === "reading" ? "Reading the file…" : "Choose the export file"}
            </label>
            <span className="text-xs text-faint">goodreads_library_export.csv</span>
          </div>
        ) : step.kind === "preview" ? (
          <Preview
            books={step.books}
            addAnyway={addAnyway}
            onToggle={(row) =>
              setAddAnyway((cur) => {
                const next = new Set(cur);
                if (next.has(row)) next.delete(row);
                else next.add(row);
                return next;
              })
            }
            onCancel={() => setStep({ kind: "pick" })}
            onImport={(books) => void run(books)}
          />
        ) : step.kind === "importing" || step.kind === "covers" ? (
          <div className="space-y-3" role="status">
            <p>
              {step.kind === "importing"
                ? `Adding books… ${step.done.toLocaleString()} of ${step.total.toLocaleString()}`
                : `Finding covers… ${step.done.toLocaleString()} of ${step.total.toLocaleString()} (${step.found.toLocaleString()} found)`}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${(step.done / Math.max(1, step.total)) * 100}%` }} />
            </div>
            <p className="text-xs text-faint">Keep this page open until it&rsquo;s done.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p>
              Added {plural(step.added, "book")}
              {step.added > 0 && step.covers > 0 && <>, with {plural(step.covers, "cover")}</>}.
            </p>
            {step.added > 0 && (
              <ul className="space-y-1.5 text-muted">
                {step.withoutCover > 0 && (
                  <li>
                    {plural(step.withoutCover, "book")} still {step.withoutCover === 1 ? "needs" : "need"} a cover:{" "}
                    <Link href="/missing-covers" className="text-ink underline">
                      Missing covers
                    </Link>
                  </li>
                )}
                <li>
                  Goodreads doesn&rsquo;t export descriptions. Fill them in, and link books to OpenLibrary, with the{" "}
                  <Link href="/refresh" className="text-ink underline">
                    OpenLibrary refresh
                  </Link>
                  .
                </li>
                <li>
                  Check for doubles on the{" "}
                  <Link href="/duplicates" className="text-ink underline">
                    Duplicates
                  </Link>{" "}
                  page.
                </li>
              </ul>
            )}
            <div className="flex gap-2">
              <Link href="/library" className="btn btn-primary rounded-full px-4">
                Go to your library
              </Link>
              <button type="button" className="btn rounded-full px-4" onClick={() => setStep({ kind: "pick" })}>
                Import another file
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    </section>
  );
}

function Preview({
  books,
  addAnyway,
  onToggle,
  onCancel,
  onImport,
}: {
  books: GoodreadsBook[];
  addAnyway: Set<number>;
  onToggle: (row: number) => void;
  onCancel: () => void;
  onImport: (books: GoodreadsBook[]) => void;
}) {
  const matched = books.filter((b) => b.match);
  const chosen = useMemo(() => books.filter((b) => !b.match || addAnyway.has(b.row)), [books, addAnyway]);
  const counts = (["Read", "Currently Reading", "To Read", "Abandoned"] as const)
    .map((s) => [s, chosen.filter((b) => b.status === s).length] as const)
    .filter(([, n]) => n > 0);
  const tags = [...new Set(chosen.flatMap((b) => b.tags))];
  const reads = chosen.filter((b) => b.dateRead && b.status !== "To Read").length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p>
          {plural(books.length, "book")} in the file
          {matched.length > 0 && <span className="text-muted"> · {matched.length.toLocaleString()} already in your library</span>}
        </p>
        <p className="text-muted">
          {counts.map(([s, n]) => `${n.toLocaleString()} ${s === "Currently Reading" ? "reading" : s.toLowerCase()}`).join(" · ") || "No shelves"}
          {reads > 0 && ` · ${plural(reads, "finish date")}`}
        </p>
        {tags.length > 0 && (
          <p className="text-xs text-faint">
            Your other Goodreads shelves become tags: {tags.slice(0, 12).join(", ")}
            {tags.length > 12 && `, and ${tags.length - 12} more`}
          </p>
        )}
      </div>

      {matched.length > 0 && (
        <details className="group rounded-lg border border-line">
          <summary className="cursor-pointer list-none px-3 py-2 text-[0.8125rem] text-muted hover:text-ink">
            <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span>
            Already in your library: left out unless you tick them ({addAnyway.size} ticked)
          </summary>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto border-t border-line">
            {matched.map((b) => (
              <li key={b.row} className="flex items-start gap-3 px-3 py-2 text-[0.8125rem]">
                <input
                  type="checkbox"
                  id={`gr-${b.row}`}
                  checked={addAnyway.has(b.row)}
                  onChange={() => onToggle(b.row)}
                  className="mt-0.5 accent-[var(--ink)]"
                  aria-label={`Add ${b.title} anyway`}
                />
                <label htmlFor={`gr-${b.row}`} className="min-w-0 flex-1">
                  <span className="block truncate">{b.title}</span>
                  <span className="block truncate text-xs text-faint">
                    {b.author} · looks like{" "}
                    <Link href={`/books/${b.match!.id}`} target="_blank" className="underline hover:text-muted">
                      {b.match!.title}
                    </Link>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary rounded-full px-4" disabled={chosen.length === 0} onClick={() => onImport(chosen)}>
          Import {plural(chosen.length, "book")}
        </button>
        <button type="button" className="btn rounded-full px-4" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
