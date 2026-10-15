"use client";

import { useActionState, useState } from "react";
import { createListAction, renameListAction, type ListState } from "@/app/(app)/lists/actions";

/** "Lists" heading with a "+ New list" button that opens a name field underneath. */
export function ListsHeader() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ListState, fd: FormData) => {
    const result = await createListAction(prev, fd);
    if (result?.doneAt) setOpen(false);
    return result;
  }, null);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="display text-3xl">Lists</h1>
        {!open && (
          <button type="button" className="btn rounded-full px-4" onClick={() => setOpen(true)}>
            + New list
          </button>
        )}
      </header>
      {open && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input name="name" required autoFocus autoComplete="off" maxLength={80} placeholder="Urbanism" aria-label="List name" className="field max-w-xs flex-1" />
          <button type="button" className="btn rounded-full px-4" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary rounded-full px-4" disabled={pending}>
            {pending ? "Making…" : "Make list"}
          </button>
          {state?.error && <p className="basis-full text-sm text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}

export function RenameListForm({ id, name }: { id: number; name: string }) {
  const [state, action, pending] = useActionState(renameListAction, null as ListState);
  return (
    <form action={action} className="space-y-3 card p-4">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Name</span>
        <input name="name" required maxLength={80} defaultValue={name} className="field" />
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
