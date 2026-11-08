"use client";

import { changeStatus, statusesFrom, withRating, withReads, withStartedOn, withStatus } from "@/lib/book-state";
import type { Read } from "@/lib/books";
import { submit, useOutbox, usePendingOps } from "@/lib/outbox";
import { STATUSES } from "@/lib/sync-ops";
import { RatingSlider } from "./inputs";
import { ShelfIcon, shelfLabel } from "./ShelfIcon";

/**
 * The To Read / Reading / Read / Abandoned buttons. Tapping the current status clears it. Moving a
 * book from Reading to Read logs the read with its start and finish days. Works offline.
 */
export function BookStatus({ bookId, shelves, reads, startedOn }: { bookId: number; shelves: string[]; reads: Read[]; startedOn: string | null }) {
  const ops = usePendingOps(bookId);
  const { state } = useOutbox();
  const current = withStatus(statusesFrom(shelves), ops);
  const finishing = current.includes("Currently Reading") ? { reads: withReads(reads, ops), startedOn: withStartedOn(startedOn, ops) } : undefined;

  return (
    <div className="col-span-2 mt-6 md:col-span-1">
      {/* Each button as wide as it was, or narrower where four don't fit (the narrowest phones). */}
      <div className="grid grid-cols-[repeat(4,minmax(0,4.25rem))] gap-2 min-[360px]:gap-2.5 sm:grid-cols-[repeat(4,minmax(0,4rem))]">
        {STATUSES.map((s) => {
          const on = current.includes(s);
          return (
            <div key={s} className="flex min-w-0 flex-col items-center gap-1.5">
              <button
                type="button"
                aria-pressed={on}
                aria-label={on ? `Remove from ${shelfLabel(s)}` : `Mark as ${shelfLabel(s)}`}
                onClick={() => changeStatus(bookId, current.length === 1 && on ? null : s, finishing)}
                className={`flex h-11 w-full items-center justify-center rounded-lg border transition active:scale-[0.97] ${
                  on ? "border-ink bg-ink text-paper" : "border-line text-muted hover:border-line-hover hover:text-ink"
                }`}
              >
                <ShelfIcon shelf={s} className="size-[1.125rem]" />
              </button>
              <span className={`text-[0.6875rem] ${on ? "text-ink" : "text-faint"}`}>{shelfLabel(s)}</span>
            </div>
          );
        })}
      </div>
      {ops.some((op) => !op.synced) && state !== "syncing" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted" role="status">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          {state === "signed-out" ? "Saved on this device. Sign in again to sync." : "Saved on this device. Syncs when you’re back online."}
        </p>
      )}
    </div>
  );
}

/** Tap a star to rate (its left half for half a star); tap the current rating again to clear it. Works offline. */
export function RatingPicker({ bookId, rating: saved }: { bookId: number; rating: number | null }) {
  const rating = withRating(saved, usePendingOps(bookId));
  return (
    <div className="flex items-center gap-2.5 text-[0.8125rem]">
      <RatingSlider label="Rating" value={rating} onChange={(r) => submit({ kind: "rating", bookId, rating: r })} />
      <span className="text-muted">{rating ? `${rating} of 5` : "Not rated yet"}</span>
    </div>
  );
}
