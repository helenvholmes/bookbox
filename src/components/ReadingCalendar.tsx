"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { ReadingSpan } from "@/lib/calendar";
import { formatDay, formatSpan, todayLocal } from "@/lib/dates";
import { Cover } from "./Cover";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const noSubscribe = () => () => {};
const today = () => todayLocal();

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10" moved by `by` months. */
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/**
 * A month of days, each showing the cover of the book you were reading that day (after Fable's
 * reading calendar). When books overlap, the one started most recently shows, with a count of the
 * others; tap a day to see them all. Today is the device's day, so it's worked out in the browser.
 */
export function ReadingCalendar({ spans, month: chosen }: { spans: ReadingSpan[]; month: string | null }) {
  const now = useSyncExternalStore(noSubscribe, today, () => null);
  const month = chosen ?? now?.slice(0, 7) ?? null;
  const [selected, setSelected] = useState<string | null>(null);

  if (!month) return <div className="aspect-[7/6] rounded-md bg-card" aria-hidden />;

  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const offset = first.getUTCDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`);
  const end = (s: ReadingSpan) => s.end ?? now ?? s.start;
  const on = (day: string) =>
    spans
      .filter((s) => s.start <= day && day <= end(s))
      .sort((a, b) => b.start.localeCompare(a.start))
      // A book read twice in one stretch of days only shows once.
      .filter((s, i, all) => all.findIndex((o) => o.bookId === s.bookId) === i);

  const inMonth = new Map(spans.filter((s) => s.start <= days.at(-1)! && end(s) >= days[0]).map((s) => [s.bookId, s]));
  const finishedInMonth = spans.filter((s) => s.end && s.end.startsWith(month)).length;
  const label = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const selectedBooks = selected?.startsWith(month) ? on(selected) : [];

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="display text-2xl">{label}</h2>
          <p className="text-[0.8125rem] text-muted">
            {inMonth.size === 0
              ? "Nothing logged"
              : `${inMonth.size} ${inMonth.size === 1 ? "book" : "books"}${finishedInMonth ? ` · ${finishedInMonth} finished` : ""}`}
          </p>
        </div>
        <nav aria-label="Months" className="flex items-center gap-2">
          {now && !now.startsWith(month) && (
            <Link href="/calendar" className="btn rounded-full px-3 text-xs">
              Today
            </Link>
          )}
          <Link href={`/calendar?month=${shiftMonth(month, -1)}`} aria-label="Previous month" className="flex size-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink">
            ‹
          </Link>
          <Link href={`/calendar?month=${shiftMonth(month, 1)}`} aria-label="Next month" className="flex size-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink">
            ›
          </Link>
        </nav>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-center text-[0.6875rem] text-faint">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {days.map((day) => {
          const books = on(day);
          const top = books[0];
          const isToday = day === now;
          const n = Number(day.slice(8));
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelected(selected === day ? null : day)}
              aria-pressed={selected === day}
              aria-label={`${formatDay(day)}${books.length ? `: ${books.map((b) => b.title).join(", ")}` : ""}`}
              className={`relative aspect-[2/3] overflow-hidden rounded-sm text-left transition ${
                top ? "" : "border border-line hover:border-line-hover"
              } ${isToday ? "ring-1 ring-ink ring-offset-1 ring-offset-paper" : ""} ${selected === day ? "outline outline-1 outline-muted" : ""}`}
            >
              {top && (
                <div className="pointer-events-none absolute inset-0 [&_span]:hidden">
                  <Cover cover={top.cover} title={top.title} bleed className="h-full" />
                </div>
              )}
              <span
                className={`absolute top-0.5 left-0.5 rounded-sm px-1 text-[0.625rem] leading-4 sm:text-[0.6875rem] ${
                  top ? "bg-black/60 text-white" : isToday ? "text-ink" : "text-faint"
                }`}
              >
                {n}
              </span>
              {books.length > 1 && (
                <span className="absolute right-0.5 bottom-0.5 rounded-sm bg-black/70 px-1 text-[0.625rem] leading-4 text-white">+{books.length - 1}</span>
              )}
            </button>
          );
        })}
      </div>

      {selected?.startsWith(month) && (
        <section className="space-y-3" aria-live="polite">
          <h3 className="section-title">{formatDay(selected, true)}</h3>
          {selectedBooks.length === 0 ? (
            <p className="text-[0.8125rem] text-muted">Nothing logged that day.</p>
          ) : (
            <ul className="card divide-y divide-line">
              {selectedBooks.map((b) => (
                <li key={b.bookId}>
                  <Link href={`/books/${b.bookId}`} className="flex items-center gap-3 p-3 hover:bg-raised">
                    <div className="w-9 shrink-0">
                      <Cover cover={b.cover} title={b.title} className="rounded-sm" />
                    </div>
                    <span className="min-w-0 flex-1 text-[0.8125rem]">
                      <span className="block truncate text-ink">{b.title}</span>
                      <span className="block truncate text-muted">{b.author}</span>
                    </span>
                    <span className="shrink-0 text-xs text-faint">{b.end ? formatSpan(b.start, b.end) : formatSpan(b.start, null)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
