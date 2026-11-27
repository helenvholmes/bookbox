"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { LogChoice, ReadingDay } from "@/lib/calendar";
import { formatDay, todayLocal } from "@/lib/dates";
import { submit, useOutbox } from "@/lib/outbox";
import { isMinutes, type ReadingFormat } from "@/lib/sync-ops";
import { Cover } from "./Cover";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FORMAT_LABEL: Record<ReadingFormat, string> = { physical: "Physical", digital: "Digital" };
const noSubscribe = () => () => {};
const today = () => todayLocal();

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10" moved by `by` months. */
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** "45 min", "1 hr", "2 hr 10 min". */
export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h && `${h} hr`, (m || !h) && `${m} min`].filter(Boolean).join(" ");
}

type Book = { bookId: number; title: string; author: string; cover: string | null };

/**
 * The days you logged, with edits still on their way to the server laid over them, so a day you
 * log shows straight away (and offline).
 */
function useShownDays(days: ReadingDay[], choices: LogChoice[]) {
  const { ops, settling } = useOutbox();
  return useMemo(() => {
    const books = new Map<number, Book>();
    for (const b of [...days, ...choices]) books.set(b.bookId, b);
    const shown = new Map(days.map((d) => [`${d.bookId}|${d.day}`, d]));
    for (const op of [...settling, ...ops]) {
      if (op.kind !== "logDay" && op.kind !== "unlogDay") continue;
      const key = `${op.bookId}|${op.day}`;
      if (op.kind === "unlogDay") shown.delete(key);
      else {
        const book = books.get(op.bookId);
        if (book) shown.set(key, { ...book, day: op.day, format: op.format, minutes: op.minutes });
      }
    }
    return [...shown.values()];
  }, [days, choices, ops, settling]);
}

/**
 * A month of the days you said you read, each showing the cover of what you read (after Fable's
 * reading calendar). When you read more than one book in a day, the one you read longest shows,
 * with a count of the others. Tap a day to see them, or to log what you read. Today is the
 * device's day, so it's worked out in the browser.
 */
export function ReadingCalendar({ days: logged, choices, month: chosen }: { days: ReadingDay[]; choices: LogChoice[]; month: string | null }) {
  const now = useSyncExternalStore(noSubscribe, today, () => null);
  const month = chosen ?? now?.slice(0, 7) ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const shown = useShownDays(logged, choices);

  if (!month) return <div className="aspect-[7/6] rounded-md bg-card" aria-hidden />;

  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const offset = first.getUTCDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`);
  const on = (day: string) => shown.filter((d) => d.day === day).sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title));

  const thisMonth = shown.filter((d) => d.day.startsWith(month));
  const daysRead = new Set(thisMonth.map((d) => d.day)).size;
  const booksRead = new Set(thisMonth.map((d) => d.bookId)).size;
  const minutes = thisMonth.reduce((sum, d) => sum + d.minutes, 0);
  const label = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  // Today is open to start with, ready to log.
  const open = selected?.startsWith(month) ? selected : now?.startsWith(month) ? now : null;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="display text-2xl">{label}</h2>
          <p className="text-[0.8125rem] text-muted">
            {daysRead === 0
              ? "Nothing logged"
              : `${daysRead} ${daysRead === 1 ? "day" : "days"} · ${booksRead} ${booksRead === 1 ? "book" : "books"} · ${formatMinutes(minutes)}`}
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
              onClick={() => setSelected(day)}
              aria-pressed={open === day}
              aria-label={`${formatDay(day)}${books.length ? `: ${books.map((b) => `${b.title}, ${formatMinutes(b.minutes)}`).join("; ")}` : ""}`}
              className={`relative aspect-[2/3] overflow-hidden rounded-sm text-left transition ${
                top ? "" : "border border-line hover:border-line-hover"
              } ${isToday ? "ring-1 ring-ink ring-offset-1 ring-offset-paper" : ""} ${open === day ? "outline outline-1 outline-muted" : ""}`}
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

      {open && <DayPanel key={open} day={open} entries={on(open)} choices={choices} canLog={!!now && open <= now} />}
    </div>
  );
}

/** What you read on one day, and a form to log more (or change what's there). */
function DayPanel({ day, entries, choices, canLog }: { day: string; entries: ReadingDay[]; choices: LogChoice[]; canLog: boolean }) {
  // The books to pick from: the usual ones, plus any already logged this day.
  const options = [...choices, ...entries.filter((e) => !choices.some((c) => c.bookId === e.bookId)).map((e) => ({ ...e, current: false }))];
  const unlogged = options.find((o) => !entries.some((e) => e.bookId === o.bookId));
  const [bookId, setBookId] = useState<number | null>(entries.length ? null : (unlogged?.bookId ?? null));
  const [format, setFormat] = useState<ReadingFormat>(unlogged?.format ?? "physical");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const editing = bookId !== null && entries.some((e) => e.bookId === bookId);

  function pick(id: number) {
    setBookId(id);
    setError(null);
    const entry = entries.find((e) => e.bookId === id);
    setFormat(entry?.format ?? options.find((o) => o.bookId === id)?.format ?? "physical");
    setMinutes(entry ? String(entry.minutes) : "");
  }

  return (
    <section className="space-y-3" aria-live="polite">
      <h3 className="section-title">{formatDay(day, true)}</h3>
      {entries.length === 0 ? (
        <p className="text-[0.8125rem] text-muted">Nothing logged that day.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {entries.map((e) => (
            <li key={e.bookId} className="flex items-center gap-3 p-3">
              <Link href={`/books/${e.bookId}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
                <div className="w-9 shrink-0">
                  <Cover cover={e.cover} title={e.title} className="rounded-sm" />
                </div>
                <span className="min-w-0 flex-1 text-[0.8125rem]">
                  <span className="block truncate text-ink">{e.title}</span>
                  <span className="block truncate text-muted">
                    {FORMAT_LABEL[e.format]} · {formatMinutes(e.minutes)}
                  </span>
                </span>
              </Link>
              <button type="button" className="min-h-10 shrink-0 px-1.5 text-xs text-faint hover:text-ink" onClick={() => pick(e.bookId)} aria-label={`Edit ${e.title}`}>
                Edit
              </button>
              <button
                type="button"
                className="min-h-10 shrink-0 px-1.5 text-xs text-faint hover:text-danger"
                onClick={() => {
                  submit({ kind: "unlogDay", bookId: e.bookId, day });
                  if (bookId === e.bookId) setBookId(null);
                }}
                aria-label={`Remove ${e.title}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {canLog &&
        (options.length === 0 ? (
          <p className="text-[0.8125rem] text-faint">Move a book to Currently Reading to log reading it.</p>
        ) : bookId === null ? (
          <button type="button" className="btn rounded-full px-3 text-xs" onClick={() => pick(unlogged?.bookId ?? options[0].bookId)}>
            + Log reading
          </button>
        ) : (
          <form
            className="card space-y-3 p-3"
            aria-label="Log reading"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(minutes.trim());
              if (!isMinutes(n)) return setError("Enter the minutes you read, from 1 to 1440.");
              submit({ kind: "logDay", bookId, day, format, minutes: n });
              setBookId(null);
              setMinutes("");
            }}
          >
            <label className="block text-[0.8125rem] text-muted">
              <span className="mb-1 block">Book</span>
              <span className="relative block">
                <select className="field appearance-none truncate pr-9 text-sm" value={bookId} onChange={(e) => pick(Number(e.target.value))}>
                  {options.map((o) => (
                    <option key={o.bookId} value={o.bookId}>
                      {o.title}
                      {o.author ? ` — ${o.author}` : ""}
                    </option>
                  ))}
                </select>
                {/* The browser's own arrow sits against the edge; this one is inset like the text. */}
                <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </label>
            <div className="flex flex-wrap items-end gap-4">
              <div role="group" aria-label="Format" className="flex gap-1.5">
                {(["physical", "digital"] as const).map((f) => (
                  <button key={f} type="button" className="chip relative before:absolute before:-inset-y-2 before:inset-x-0" aria-pressed={format === f} onClick={() => setFormat(f)}>
                    {FORMAT_LABEL[f]}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[0.8125rem] text-muted">
                <input
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => {
                    setMinutes(e.target.value);
                    setError(null);
                  }}
                  aria-label="Minutes read"
                  placeholder="30"
                  className="field h-7 w-16 rounded-md px-2 py-0 text-xs"
                />
                minutes
              </label>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn rounded-full px-3 text-xs" onClick={() => setBookId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary rounded-full px-3 text-xs">{editing ? "Save" : "Log"}</button>
            </div>
          </form>
        ))}
    </section>
  );
}
