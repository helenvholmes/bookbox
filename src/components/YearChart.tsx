"use client";

import { useState } from "react";

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
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <div className="flex h-44 items-end gap-[2px] border-b border-line">
            {years.map((r, i) => (
              <button
                key={r.year}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                aria-label={`${r.year}: ${r.books} books`}
                // The hit target is the whole column, taller than the bar itself.
                className="group flex h-full min-w-0 flex-1 items-end"
              >
                <span
                  className={`block w-full rounded-t-[4px] transition-colors ${
                    r.year === highlight ? "bg-ink" : hover === i ? "bg-muted" : "bg-faint"
                  }`}
                  style={{ height: `${(r.books / max) * 100}%`, minHeight: r.books ? 2 : 0 }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[0.6875rem] text-faint tabular-nums">
            <span>{years[0]?.year}</span>
            <span>{years[years.length - 1]?.year}</span>
          </div>
          {shown && (
            <div
              role="status"
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
