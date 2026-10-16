"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { finishImportAction, importLibbyAction, libbyCoversAction, previewLibbyAction } from "@/app/(app)/settings/actions";
import { formatDay } from "@/lib/dates";
import { parseLibbyTimeline, type LibbyBook } from "@/lib/libby";

const BOOK_BATCH = 25;
const COVER_BATCH = 6;

type Step =
  | { kind: "pick" }
  | { kind: "reading" }
  | { kind: "preview"; books: LibbyBook[] }
  | { kind: "importing"; done: number; total: number }
  | { kind: "covers"; done: number; total: number; found: number; added: number }
  | { kind: "done"; added: number; covers: number; withoutCover: number };

type Added = { id: number; isbn13: string | null; coverUrl: string | null };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const toggle = (set: Set<number>, row: number) => {
  const next = new Set(set);
  if (next.has(row)) next.delete(row);
  else next.add(row);
  return next;
};

/**
 * Settings → Import from Libby: pick the timeline export, see what's coming in, mark any returned
 * books you didn't finish, then add them a batch at a time and fetch their covers.
 */
export function LibbyImport() {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [addAnyway, setAddAnyway] = useState<Set<number>>(new Set());
  const [unfinished, setUnfinished] = useState<Set<number>>(new Set());
  const [holds, setHolds] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    setError(null);
    setStep({ kind: "reading" });
    try {
      if (file.size > 20_000_000) throw new Error("That file is too big.");
      const parsed = parseLibbyTimeline(await file.text());
      if (typeof parsed === "string") throw new Error(parsed);
      const result = await previewLibbyAction(parsed);
      if (result.error || !result.books) throw new Error(result.error ?? "That file couldn’t be read.");
      setAddAnyway(new Set());
      setUnfinished(new Set());
      setHolds(true);
      setStep({ kind: "preview", books: result.books });
    } catch (err) {
      setError((err as Error).message || "That file couldn’t be read.");
      setStep({ kind: "pick" });
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function run(books: LibbyBook[]) {
    setError(null);
    const added: Added[] = [];
    try {
      for (let i = 0; i < books.length; i += BOOK_BATCH) {
        setStep({ kind: "importing", done: i, total: books.length });
        added.push(...(await importLibbyAction(books.slice(i, i + BOOK_BATCH))));
      }
      const withSource = added.filter((b) => b.coverUrl || b.isbn13);
      let found = 0;
      for (let i = 0; i < withSource.length; i += COVER_BATCH) {
        setStep({ kind: "covers", done: i, total: withSource.length, found, added: added.length });
        // A cover that fails is left for the Missing covers page; the import carries on.
        found += await libbyCoversAction(withSource.slice(i, i + COVER_BATCH)).catch(() => 0);
      }
      setStep({ kind: "done", added: added.length, covers: found, withoutCover: added.length - found });
    } catch {
      setError(`The import stopped after ${plural(added.length, "book")}. Import the file again to add the rest: the ones already added will show as in your library.`);
      setStep({ kind: "done", added: added.length, covers: 0, withoutCover: added.length });
    } finally {
      await finishImportAction().catch(() => {});
    }
  }

  return (
    <section id="libby" className="max-w-xl scroll-mt-8 space-y-3">
      <h2 className="section-title">Import from Libby</h2>
      <div className="space-y-2 text-sm text-muted">
        <p>Brings in the books you&rsquo;ve borrowed and placed holds on, with the dates you returned them. To get the file, in the Libby app:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Tap <span className="text-ink">Shelf</span>, then <span className="text-ink">Timeline</span> at the top.
          </li>
          <li>
            Tap <span className="text-ink">Actions</span>, then <span className="text-ink">Export Timeline</span>.
          </li>
          <li>
            Choose <span className="text-ink">Spreadsheet</span> (or <span className="text-ink">Data</span>) and save the file.
          </li>
        </ol>
        <p>
          Libby keeps your timeline only if it&rsquo;s turned on, and only from then.{" "}
          <a href="https://help.libbyapp.com/en-us/6207.htm" target="_blank" rel="noreferrer" className="text-ink underline">
            Libby&rsquo;s help on exporting
          </a>
        </p>
      </div>

      <div className="card p-5 text-sm">
        {step.kind === "pick" || step.kind === "reading" ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              id="libby-file"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void read(file);
              }}
            />
            <label htmlFor="libby-file" className={`btn btn-primary cursor-pointer rounded-full px-4 ${step.kind === "reading" ? "pointer-events-none opacity-60" : ""}`}>
              {step.kind === "reading" ? "Reading the file…" : "Choose the export file"}
            </label>
            <span className="text-xs text-faint">libby timeline .csv or .json</span>
          </div>
        ) : step.kind === "preview" ? (
          <Preview
            books={step.books}
            addAnyway={addAnyway}
            unfinished={unfinished}
            holds={holds}
            onToggleAnyway={(row) => setAddAnyway((cur) => toggle(cur, row))}
            onToggleUnfinished={(row) => setUnfinished((cur) => toggle(cur, row))}
            onToggleHolds={() => setHolds((h) => !h)}
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
                  Libby doesn&rsquo;t export descriptions, page counts or ratings. Fill in the first two, and link books to OpenLibrary, with the{" "}
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
  unfinished,
  holds,
  onToggleAnyway,
  onToggleUnfinished,
  onToggleHolds,
  onCancel,
  onImport,
}: {
  books: LibbyBook[];
  addAnyway: Set<number>;
  unfinished: Set<number>;
  holds: boolean;
  onToggleAnyway: (row: number) => void;
  onToggleUnfinished: (row: number) => void;
  onToggleHolds: () => void;
  onCancel: () => void;
  onImport: (books: LibbyBook[]) => void;
}) {
  const matched = books.filter((b) => b.match);
  const holdCount = books.filter((b) => !b.match && b.status === "To Read").length;
  const chosen = useMemo(
    () =>
      books
        .filter((b) => (!b.match || addAnyway.has(b.row)) && (holds || b.status !== "To Read"))
        .map((b): LibbyBook => (b.status === "Read" && unfinished.has(b.row) ? { ...b, status: "Abandoned", returnedOn: null } : b)),
    [books, addAnyway, unfinished, holds],
  );
  const returned = books.filter((b) => b.status === "Read" && (!b.match || addAnyway.has(b.row)));
  const counts = (["Currently Reading", "Read", "Abandoned", "To Read"] as const)
    .map((s) => [s, chosen.filter((b) => b.status === s).length] as const)
    .filter(([, n]) => n > 0);
  const label = (s: string) => (s === "Currently Reading" ? "borrowed now" : s === "To Read" ? "on hold" : s === "Abandoned" ? "not finished" : "read");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p>
          {plural(books.length, "book")} in the timeline
          {matched.length > 0 && <span className="text-muted"> · {matched.length.toLocaleString()} already in your library</span>}
        </p>
        <p className="text-muted">{counts.map(([s, n]) => `${n.toLocaleString()} ${label(s)}`).join(" · ") || "Nothing to add"}</p>
        <p className="text-xs text-faint">
          Libby doesn&rsquo;t say whether you finished a book, so returned books count as read on the day you returned them. Books you have borrowed now go on Currently
          Reading with their library.
        </p>
      </div>

      {returned.length > 0 && (
        <details className="group rounded-lg border border-line">
          <summary className="cursor-pointer list-none px-3 py-2 text-[0.8125rem] text-muted hover:text-ink">
            <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span>
            Returned books: tick any you didn&rsquo;t finish ({unfinished.size} ticked)
          </summary>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto border-t border-line">
            {returned.map((b) => (
              <li key={b.row} className="flex items-start gap-3 px-3 py-2 text-[0.8125rem]">
                <input
                  type="checkbox"
                  id={`libby-unfinished-${b.row}`}
                  checked={unfinished.has(b.row)}
                  onChange={() => onToggleUnfinished(b.row)}
                  className="mt-0.5 accent-[var(--ink)]"
                  aria-label={`Didn’t finish ${b.title}`}
                />
                <label htmlFor={`libby-unfinished-${b.row}`} className="min-w-0 flex-1">
                  <span className="block truncate">{b.title}</span>
                  <span className="block truncate text-xs text-faint">
                    {b.author}
                    {b.returnedOn && <> · returned {formatDay(b.returnedOn, true)}</>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

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
                  id={`libby-${b.row}`}
                  checked={addAnyway.has(b.row)}
                  onChange={() => onToggleAnyway(b.row)}
                  className="mt-0.5 accent-[var(--ink)]"
                  aria-label={`Add ${b.title} anyway`}
                />
                <label htmlFor={`libby-${b.row}`} className="min-w-0 flex-1">
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

      {holdCount > 0 && (
        <label className="flex items-center gap-2 text-[0.8125rem] text-muted">
          <input type="checkbox" checked={holds} onChange={onToggleHolds} className="accent-[var(--ink)]" />
          Add {plural(holdCount, "hold")} you never borrowed to To Read
        </label>
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
