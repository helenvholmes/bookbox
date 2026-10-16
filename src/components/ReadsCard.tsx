"use client";

import { useState } from "react";
import { statusesFrom, withReads, withStatus, type ShownRead } from "@/lib/book-state";
import type { Read } from "@/lib/books";
import { formatSpan, todayLocal } from "@/lib/dates";
import { newId, submit, usePendingOps } from "@/lib/outbox";
import { validYear } from "@/lib/sync-ops";
import { ConfirmButton } from "./ConfirmButton";

const timesRead = (n: number) => (n === 1 ? "Read once" : n === 2 ? "Read twice" : `Read ${n} times`);

/** Every time a book was read, with an optional note and days, and a way to log a re-read. Works offline. */
export function ReadsCard({ bookId, reads: saved, shelves }: { bookId: number; reads: Read[]; shelves: string[] }) {
  const ops = usePendingOps(bookId);
  const reads = withReads(saved, ops);
  const reading = withStatus(statusesFrom(shelves), ops).includes("Currently Reading");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ShownRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <h2 className="section-title">
        Reads {reads.length > 0 && <span className="count">{timesRead(reads.length)}</span>}
      </h2>
      <div className="card divide-y divide-line">
        {reads.length === 0 && !adding && <p className="p-4 text-[0.8125rem] text-muted">{reading ? "Reading now" : "Not read yet"}</p>}
        {reads.map((r, i) =>
          editing && (editing.id ?? editing.clientId) === (r.id ?? r.clientId) ? (
            <DatesForm
              key={r.clientId ?? r.id}
              read={r}
              onCancel={() => setEditing(null)}
              onSave={(startedOn, finishedOn) => {
                submit({ kind: "readDates", bookId, readId: r.id, clientId: r.id === null ? r.clientId : null, startedOn, finishedOn });
                setEditing(null);
              }}
            />
          ) : (
            <div key={r.clientId ?? r.id} className="flex items-start gap-3 p-4 text-[0.8125rem]">
              <span className="w-10 shrink-0 text-ink">{r.year}</span>
              <span className="min-w-0 flex-1 text-muted">
                {r.note || (i === reads.length - 1 ? "First read" : "Re-read")}
                {r.pending && <span className="ml-1.5 text-faint">· not synced yet</span>}
                <button type="button" className="block text-left text-xs text-faint hover:text-muted" onClick={() => setEditing(r)}>
                  {formatSpan(r.startedOn, r.finishedOn) || "+ Add dates"}
                </button>
              </span>
              <ConfirmButton
                className="shrink-0 text-faint hover:text-danger"
                message="Remove this read?"
                confirmLabel="Remove"
                onConfirm={() => submit({ kind: "deleteRead", bookId, readId: r.id, clientId: r.id === null ? r.clientId : null })}
              >
                <span aria-label={`Remove the ${r.year} read`}>×</span>
              </ConfirmButton>
            </div>
          ),
        )}
        {adding ? (
          <form
            className="space-y-2 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const startedOn = String(fd.get("started") ?? "") || null;
              const finishedOn = String(fd.get("finished") ?? "") || null;
              // A finish day decides the year.
              const year = finishedOn ? Number(finishedOn.slice(0, 4)) : Number(String(fd.get("year") ?? "").trim());
              if (!validYear(year)) return setError("Enter a year like 2026.");
              if (startedOn && finishedOn && startedOn > finishedOn) return setError("The start is after the finish.");
              submit({ kind: "addRead", bookId, clientId: newId(), year, note: String(fd.get("note") ?? "").trim(), startedOn, finishedOn });
              setError(null);
              setAdding(false);
            }}
          >
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
              <input name="year" inputMode="numeric" required defaultValue={new Date().getFullYear()} aria-label="Year" className="field text-sm" />
              <input name="note" placeholder="Note (optional)" aria-label="Note" autoComplete="off" className="field text-sm" />
            </div>
            <DateFields />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn rounded-full px-3 text-xs" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="btn btn-primary rounded-full px-3 text-xs">Add read</button>
            </div>
          </form>
        ) : (
          <button type="button" className="block w-full p-3 text-left text-[0.8125rem] text-muted hover:text-ink" onClick={() => setAdding(true)}>
            + {reads.length ? "Add a re-read" : "Add a read"}
          </button>
        )}
      </div>
    </section>
  );
}

/** Optional start and finish days, side by side. */
function DateFields({ startedOn = null, finishedOn = null }: { startedOn?: string | null; finishedOn?: string | null }) {
  const today = todayLocal();
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-xs text-faint">
        Started
        <input type="date" name="started" defaultValue={startedOn ?? ""} max={today} className="field w-full text-sm" />
      </label>
      <label className="space-y-1 text-xs text-faint">
        Finished
        <input type="date" name="finished" defaultValue={finishedOn ?? ""} max={today} className="field w-full text-sm" />
      </label>
    </div>
  );
}

function DatesForm({ read, onSave, onCancel }: { read: ShownRead; onSave: (startedOn: string | null, finishedOn: string | null) => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const startedOn = String(fd.get("started") ?? "") || null;
        const finishedOn = String(fd.get("finished") ?? "") || null;
        if (startedOn && finishedOn && startedOn > finishedOn) return setError("The start is after the finish.");
        onSave(startedOn, finishedOn);
      }}
    >
      <p className="text-[0.8125rem] text-ink">{read.year} read</p>
      <DateFields startedOn={read.startedOn} finishedOn={read.finishedOn} />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn rounded-full px-3 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary rounded-full px-3 text-xs">Save</button>
      </div>
    </form>
  );
}
