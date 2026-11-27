"use client";

import { useActionState } from "react";
import { createTagAction, type CreateTagState } from "@/app/(app)/tags/actions";
import { SubmitButton } from "./SubmitButton";

/** The name field that "+ Add tag" opens under the Tags page's tabs (src/components/CollectionHeader.tsx). */
export function NewTagForm({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(async (prev: CreateTagState, fd: FormData) => {
    const result = await createTagAction(prev, fd);
    if (result?.createdAt) onClose();
    return result;
  }, null);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="name" required autoFocus autoComplete="off" placeholder="Tag name" aria-label="Tag name" className="field max-w-xs flex-1" />
      <button type="button" className="btn rounded-full px-4" onClick={onClose} disabled={pending}>
        Cancel
      </button>
      <SubmitButton className="btn btn-primary rounded-full px-4" pending="Adding…">
        Add
      </SubmitButton>
      {state?.error && <p className="basis-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
