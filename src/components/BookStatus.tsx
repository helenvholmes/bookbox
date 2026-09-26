"use client";

import { statusesFrom, withRating, withStatus } from "@/lib/book-state";
import { submit, useOutbox, usePendingOps } from "@/lib/outbox";
import { STATUSES } from "@/lib/sync-ops";
import { ShelfIcon, shelfLabel } from "./ShelfIcon";

/** The To Read / Reading / Read / Abandoned buttons. Tapping the current status clears it. Works offline. */
export function BookStatus({ bookId, shelves }: { bookId: number; shelves: string[] }) {
  const ops = usePendingOps(bookId);
  const { state } = useOutbox();
  const current = withStatus(statusesFrom(shelves), ops);

  return (
    <div className="col-span-2 mt-6 md:col-span-1">
      <div className="flex gap-2.5">
        {STATUSES.map((s) => {
          const on = current.includes(s);
          return (
            <div key={s} className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                aria-pressed={on}
                aria-label={on ? `Remove from ${shelfLabel(s)}` : `Mark as ${shelfLabel(s)}`}
                onClick={() => submit({ kind: "status", bookId, shelf: current.length === 1 && on ? null : s })}
                className={`flex h-11 w-[4.25rem] items-center justify-center rounded-lg border transition sm:w-16 ${
                  on ? "border-ink bg-ink text-paper" : "border-line text-muted hover:border-faint hover:text-ink"
                }`}
              >
                <ShelfIcon shelf={s} className="size-[1.125rem]" />
              </button>
              <span className={`text-[0.6875rem] ${on ? "text-ink" : "text-faint"}`}>{shelfLabel(s)}</span>
            </div>
          );
        })}
      </div>
      {ops.length > 0 && state !== "syncing" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted" role="status">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          {state === "signed-out" ? "Saved on this device. Sign in again to sync." : "Saved on this device. Syncs when you’re back online."}
        </p>
      )}
    </div>
  );
}

const STAR = "M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z";

/** Tap a star to rate; tap the current rating again to clear it. Works offline. */
export function RatingPicker({ bookId, rating: saved }: { bookId: number; rating: number | null }) {
  const rating = withRating(saved, usePendingOps(bookId));
  return (
    <div className="flex items-center gap-2.5 text-[0.8125rem]">
      <span className="-ml-1 inline-flex" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}${rating === n ? " (tap to clear)" : ""}`}
            onClick={() => submit({ kind: "rating", bookId, rating: rating === n ? null : n })}
            className={`p-1 transition hover:text-ink ${rating && n <= rating ? "text-muted" : "text-faint"}`}
          >
            <svg viewBox="0 0 24 24" className="size-5" strokeWidth={1.7} strokeLinejoin="round" aria-hidden>
              <path d={STAR} fill={rating && n <= rating ? "currentColor" : "none"} stroke="currentColor" />
            </svg>
          </button>
        ))}
      </span>
      <span className="text-muted">{rating ? `${rating} of 5` : "Not rated yet"}</span>
    </div>
  );
}
