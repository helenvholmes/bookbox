"use client";

import { useActionState, useState } from "react";
import { createTagAction, type CreateTagState } from "@/app/(app)/tags/actions";

/** "Tags" heading with an "+ Add tag" button that opens a name field underneath. */
export function TagsHeader() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: CreateTagState, fd: FormData) => {
    const result = await createTagAction(prev, fd);
    if (result?.createdAt) setOpen(false);
    return result;
  }, null);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="display text-3xl">Tags</h1>
        {!open && (
          <button type="button" className="btn rounded-full px-4" onClick={() => setOpen(true)}>
            + Add tag
          </button>
        )}
      </header>
      {open && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input name="name" required autoFocus autoComplete="off" placeholder="Tag name" aria-label="Tag name" className="field max-w-xs flex-1" />
          <button type="button" className="btn rounded-full px-4" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary rounded-full px-4" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </button>
          {state?.error && <p className="basis-full text-sm text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
