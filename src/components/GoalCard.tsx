"use client";

import { useActionState, useState } from "react";
import { setGoalAction } from "@/app/(app)/stats/actions";
import { goalPace } from "@/lib/goal";

/** This year's reading goal: progress, pace, and an inline editor. */
export function GoalCard({ year, goal, read }: { year: number; goal: number | null; read: number }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: { savedAt?: number; error?: string } | null, fd: FormData) => {
    const result = await setGoalAction(prev, fd);
    if (result.savedAt) setEditing(false);
    return result;
  }, null);

  const p = goalPace(year, goal, read);
  const pct = p?.percent ?? 0;
  const pace =
    !goal || !p ? null : p.status === "reached" ? "Goal reached" : p.status === "on-track" ? `On track · ${goal - read} to go` : `${p.expected - read} behind pace · ${goal - read} to go`;

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-title">{year} reading goal</h2>
          {goal ? (
            <p className="display mt-1 text-4xl">
              {read} <span className="text-faint">/ {goal}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">No goal set. You&rsquo;ve read {read} {read === 1 ? "book" : "books"} so far.</p>
          )}
        </div>
        {!editing && (
          <button type="button" className="btn shrink-0 rounded-full px-4" onClick={() => setEditing(true)}>
            {goal ? "Change goal" : "Set a goal"}
          </button>
        )}
      </div>

      {goal && !editing && (
        <div className="space-y-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={read} aria-label={`${read} of ${goal} books`}>
            <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted">{pace}</p>
        </div>
      )}

      {editing && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="year" value={year} />
          <label className="flex items-center gap-2 text-sm text-muted">
            Read
            <input name="target" inputMode="numeric" autoFocus defaultValue={goal ?? ""} placeholder="30" aria-label="Books to read" className="field w-20 text-sm" />
            books in {year}
          </label>
          <button type="button" className="btn rounded-full px-4" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary rounded-full px-4" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          {state?.error && <p className="basis-full text-xs text-danger">{state.error}</p>}
          {goal && <p className="basis-full text-xs text-faint">Leave it empty to remove the goal.</p>}
        </form>
      )}
    </section>
  );
}
