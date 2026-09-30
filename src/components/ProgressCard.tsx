"use client";

import Link from "next/link";
import { useState } from "react";
import { statusesFrom, withProgress, withReads, withStatus, type ShownProgress } from "@/lib/book-state";
import type { Progress, Read } from "@/lib/books";
import { newId, submit, usePendingOps } from "@/lib/outbox";
import { ago, FINISHED_PERCENT, formatDuration } from "@/lib/progress";

type Props = {
  bookId: number;
  pages: number | null;
  /** Kindle shows a percentage, not page numbers, so that's what progress is entered as. */
  onKindle: boolean;
  shelves: string[];
  reads: Read[];
  progress: Progress | null;
  spotify: { name: string } | null;
};

/**
 * How far through the book you are. Synced from Spotify when the book is linked to an audiobook;
 * otherwise set by hand: by page when the page count is known, or as a percentage for Kindle books
 * (which show one) and books without a page count. Shown while you're reading it, or whenever
 * there's progress to show.
 */
export function ProgressCard({ bookId, pages: pageCount, onKindle, shelves, reads, progress, spotify }: Props) {
  const pages = onKindle ? null : pageCount;
  const ops = usePendingOps(bookId);
  const statuses = withStatus(statusesFrom(shelves), ops);
  const saved: ShownProgress = progress && { percent: progress.percent, page: progress.page, source: progress.source, pending: false };
  const shown = withProgress(saved, ops);
  const [editing, setEditing] = useState(false);

  const reading = statuses.includes("Currently Reading");
  if (!reading && !shown) return null;

  const fromSpotify = !!spotify && shown?.source === "spotify";
  const left = fromSpotify && progress?.duration_ms && progress.position_ms !== null ? progress.duration_ms - progress.position_ms : null;
  const finished = !!shown && shown.percent >= FINISHED_PERCENT && !statuses.includes("Read");
  const thisYear = new Date().getFullYear();

  const markRead = () => {
    submit({ kind: "status", bookId, shelf: "Read" });
    // Log the read too, unless there's already one this year.
    if (!withReads(reads, ops).some((r) => r.year === thisYear)) submit({ kind: "addRead", bookId, clientId: newId(), year: thisYear, note: "" });
  };

  return (
    <section className="space-y-3">
      <h2 className="section-title">
        Progress {fromSpotify && <span className="count">from Spotify</span>}
      </h2>
      <div className="card space-y-3 p-4">
        {shown && (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(shown.percent)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-ink" style={{ width: `${shown.percent}%` }} />
            </div>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.8125rem]">
              <span>
                {Math.round(shown.percent)}%
                {shown.page !== null && pages ? <span className="text-muted"> · page {shown.page} of {pages}</span> : null}
                {left !== null && left > 0 && <span className="text-muted"> · {formatDuration(left)} left</span>}
              </span>
              {progress && !shown.pending && <span className="text-xs text-faint">{ago(progress.updated_at)}</span>}
              {shown.pending && <span className="text-xs text-faint">not synced yet</span>}
            </p>
          </>
        )}

        {finished && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2 text-[0.8125rem]">
            <span className="text-muted">{fromSpotify ? "Finished on Spotify." : "Looks finished."}</span>
            <button type="button" className="btn btn-primary rounded-full px-3 text-xs" onClick={markRead}>
              Mark as Read
            </button>
          </div>
        )}

        {editing ? (
          <ProgressEditor
            pages={pages}
            initial={shown}
            onCancel={() => setEditing(false)}
            onSave={(percent, page) => {
              submit({ kind: "progress", bookId, percent, page });
              setEditing(false);
            }}
          />
        ) : fromSpotify ? (
          <p className="text-xs text-faint">
            Listening to <span className="text-muted">{spotify.name}</span>.{" "}
            <Link href="/spotify" className="underline hover:text-ink">
              Spotify settings
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
            <button type="button" className="text-muted hover:text-ink" onClick={() => setEditing(true)}>
              {shown ? "Update progress" : "+ Add progress"}
            </button>
            {!spotify && (
              <Link href="/spotify" className="text-xs text-faint hover:text-muted">
                Listening on Spotify?
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ProgressEditor({
  pages,
  initial,
  onSave,
  onCancel,
}: {
  pages: number | null;
  initial: ShownProgress;
  onSave: (percent: number | null, page: number | null) => void;
  onCancel: () => void;
}) {
  const byPage = !!pages;
  // Start from what's saved, in the unit being asked for (a saved percentage becomes its page, and the other way round).
  const [value, setValue] = useState(() => {
    if (!initial) return "";
    return String(byPage ? (initial.page ?? Math.round((initial.percent / 100) * pages!)) : Math.round(initial.percent));
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value.trim());
        if (value.trim() === "") return onSave(null, null);
        if (!Number.isFinite(n) || n < 0) return setError(byPage ? "Enter a page number." : "Enter a percentage.");
        if (byPage) {
          if (n > pages!) return setError(`The book has ${pages} pages.`);
          onSave((n / pages!) * 100, Math.round(n));
        } else {
          if (n > 100) return setError("Enter 0 to 100.");
          onSave(n, null);
        }
      }}
    >
      <label className="flex items-center gap-2 text-[0.8125rem] text-muted">
        {byPage ? "Page" : "Percent"}
        <input
          autoFocus
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-label={byPage ? "Current page" : "Percent read"}
          className="field w-20 text-sm"
        />
        {byPage ? `of ${pages}` : "%"}
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn rounded-full px-3 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary rounded-full px-3 text-xs">Save</button>
        {initial && (
          <button type="button" className="ml-auto text-xs text-faint hover:text-danger" onClick={() => onSave(null, null)}>
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
