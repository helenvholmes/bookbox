"use client";

import { useActionState, useState } from "react";
import { addReadAction, deleteReadAction } from "@/app/(app)/books/actions";
import type { Read } from "@/lib/books";
import { ConfirmButton } from "./ConfirmButton";

const timesRead = (n: number) => (n === 1 ? "Read once" : n === 2 ? "Read twice" : `Read ${n} times`);

/** Every time a book was read, with an optional note, and a way to log a re-read. */
export function ReadsCard({ bookId, reads, reading }: { bookId: number; reads: Read[]; reading: boolean }) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(async (prev: { error?: string; addedAt?: number } | null, fd: FormData) => {
    const result = await addReadAction(prev, fd);
    if (result.addedAt) setAdding(false);
    return result;
  }, null);

  return (
    <section className="space-y-3">
      <h2 className="section-title">
        Reads {reads.length > 0 && <span className="count">{timesRead(reads.length)}</span>}
      </h2>
      <div className="card divide-y divide-line">
        {reads.length === 0 && !adding && <p className="p-4 text-[0.8125rem] text-muted">{reading ? "Reading now" : "Not read yet"}</p>}
        {reads.map((r, i) => (
          <form key={r.id} action={deleteReadAction} className="flex items-start gap-3 p-4 text-[0.8125rem]">
            <input type="hidden" name="read_id" value={r.id} />
            <span className="w-10 shrink-0 text-ink">{r.year}</span>
            <span className="min-w-0 flex-1 text-muted">
              {r.note || (i === reads.length - 1 ? "First read" : "Re-read")}
            </span>
            <ConfirmButton className="shrink-0 text-faint hover:text-danger" message="Remove this read?" confirmLabel="Remove">
              <span aria-label={`Remove the ${r.year} read`}>×</span>
            </ConfirmButton>
          </form>
        ))}
        {adding ? (
          <form action={action} className="space-y-2 p-4">
            <input type="hidden" name="id" value={bookId} />
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
              <input name="year" inputMode="numeric" required defaultValue={new Date().getFullYear()} aria-label="Year" className="field text-sm" />
              <input name="note" placeholder="Note (optional)" aria-label="Note" autoComplete="off" className="field text-sm" />
            </div>
            {state?.error && <p className="text-xs text-danger">{state.error}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn rounded-full px-3 text-xs" onClick={() => setAdding(false)} disabled={pending}>
                Cancel
              </button>
              <button className="btn btn-primary rounded-full px-3 text-xs" disabled={pending}>
                {pending ? "Adding…" : "Add read"}
              </button>
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
