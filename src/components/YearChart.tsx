"use client";

import { useState, type PointerEvent } from "react";

type Row = { year: number; books: number; reads: number; pages: number };

/** Books finished per year: single-series columns with a hover tooltip and a table view. */
export function YearChart({ rows, highlight }: { rows: Row[]; highlight: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...rows.map((r) => r.books));
  // Fill gaps so missing years read as zero rather than disappearing.
  const years: Row[] = [];
  if (rows.length) for (let y = rows[0].year; y <= Math.max(highlight, rows[rows.length - 1].year); y++) {
    years.push(rows.find((r) => r.year === y) ?? { year: y, books: 0, reads: 0, pages: 0 });
  }
  const shown = hover === null ? null : years[hover];
  const indexAt = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.min(years.length - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * years.length)));
  };

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">Books read per year</h2>
        <button type="button" className="text-xs text-muted underline hover:text-ink" onClick={() => setTable((t) => !t)}>
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>

      {table ? (
        <table className="w-full text-left text-[0.8125rem]">
          <thead className="text-xs text-faint">
            <tr>
              <th className="py-1.5 font-normal">Year</th>
              <th className="py-1.5 text-right font-normal">Books</th>
              <th className="py-1.5 text-right font-normal">Reads</th>
              <th className="py-1.5 text-right font-normal">Pages</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...years].reverse().map((r) => (
              <tr key={r.year}>
                <td className="py-1.5">{r.year}</td>
                <td className="py-1.5 text-right tabular-nums">{r.books}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{r.reads}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{r.pages ? r.pages.toLocaleString() : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          {/* One target for the whole chart, not a sliver of a button per year: pointing or tapping anywhere
              picks the nearest year, and arrow keys step through them like a slider. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Books read per year"
            aria-valuemin={years[0]?.year}
            aria-valuemax={years[years.length - 1]?.year}
            aria-valuenow={(shown ?? years[years.length - 1])?.year}
            aria-valuetext={describe(shown ?? years[years.length - 1])}
            className="flex h-44 cursor-default touch-pan-y items-end gap-[2px] rounded-sm border-b border-line focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-muted"
            onPointerMove={(e) => setHover(indexAt(e))}
            onPointerDown={(e) => setHover(indexAt(e))}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
            onFocus={() => setHover((h) => h ?? Math.max(0, years.findIndex((r) => r.year === highlight)))}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              const last = years.length - 1;
              const step: Record<string, (h: number) => number> = {
                ArrowLeft: (h) => h - 1,
                ArrowDown: (h) => h - 1,
                ArrowRight: (h) => h + 1,
                ArrowUp: (h) => h + 1,
                Home: () => 0,
                End: () => last,
              };
              if (!step[e.key]) return;
              e.preventDefault();
              setHover((h) => Math.min(last, Math.max(0, step[e.key](h ?? last))));
            }}
          >
            {years.map((r, i) => (
              <span key={r.year} aria-hidden className="flex h-full min-w-0 flex-1 items-end">
                <span
                  className={`block w-full rounded-t-[4px] transition-colors ${
                    r.year === highlight ? "bg-ink" : hover === i ? "bg-muted" : "bg-faint"
                  }`}
                  style={{ height: `${(r.books / max) * 100}%`, minHeight: r.books ? 2 : 0 }}
                />
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[0.6875rem] text-faint tabular-nums">
            <span>{years[0]?.year}</span>
            <span>{years[years.length - 1]?.year}</span>
          </div>
          {shown && (
            <div
              aria-hidden
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs whitespace-nowrap text-ink shadow-[0_8px_24px_rgb(0_0_0/0.5)]"
              style={{ left: `${((hover! + 0.5) / years.length) * 100}%` }}
            >
              <span className="text-muted">{shown.year}</span> · {shown.books} {shown.books === 1 ? "book" : "books"}
              {shown.reads > shown.books && <span className="text-muted"> · {shown.reads} reads</span>}
              {shown.pages > 0 && <span className="text-muted"> · {shown.pages.toLocaleString()} pages</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${n === 1 ? word : `${word}s`}`;

/** What a screen reader says for a year: the same facts as the tooltip. */
function describe(r: Row | undefined) {
  if (!r) return undefined;
  return [`${r.year}: ${plural(r.books, "book")}`, r.reads > r.books && plural(r.reads, "read"), r.pages > 0 && plural(r.pages, "page")]
    .filter(Boolean)
    .join(", ");
}
