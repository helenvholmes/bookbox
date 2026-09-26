"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { deletePersonAction, updatePersonAction, type UpdatePersonState } from "@/app/(app)/people/actions";
import type { Person } from "@/lib/books";
import { RELATIONSHIPS } from "@/lib/constants";
import { ConfirmButton } from "./ConfirmButton";

const SHOW_UPDATED_MS = 2000;
const describe = (relationship: string) => relationship.split(",").filter(Boolean).join(" & ");

const BackLink = () => (
  <Link href="/people" className="block w-fit text-muted hover:text-ink">
    ‹ People
  </Link>
);

/**
 * A person's page: name and relationship turn into fields in place when "Edit" is tapped, and
 * "Delete person" appears at the bottom, below the page content passed as children.
 */
export function PersonHeader({ person, children }: { person: Person; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: UpdatePersonState, fd: FormData) => {
    const result = await updatePersonAction(prev, fd);
    if (result?.savedAt) setEditing(false);
    return result;
  }, null);

  // "Updated" shows briefly after a save, then fades.
  const [dismissed, setDismissed] = useState<number | undefined>();
  const savedAt = state?.savedAt;
  const updated = !editing && !!savedAt && dismissed !== savedAt;
  useEffect(() => {
    if (!updated) return;
    const timer = setTimeout(() => setDismissed(savedAt), SHOW_UPDATED_MS);
    return () => clearTimeout(timer);
  }, [updated, savedAt]);

  const name = `${person.first} ${person.last}`.trim();
  // A single dropdown can't hold two relationships, so keep someone's current combination as an option.
  const combined = person.relationship.includes(",") ? person.relationship : null;

  if (!editing) {
    return (
      <div className="space-y-8 md:space-y-10">
        <BackLink />
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display text-3xl">{name}</h1>
            {person.relationship && <p className="mt-1 text-muted">{describe(person.relationship)}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {updated && (
              <span className="flex items-center gap-1.5 text-sm text-muted" role="status">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6.5 9.5 17 4 11.5" />
                </svg>
                Updated
              </span>
            )}
            <Link href={`/people/${person.id}/share`} className="btn rounded-full px-4">
              Share
            </Link>
            <button type="button" className="btn rounded-full px-4" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-8 md:space-y-10">
      <BackLink />
      <div>
        <form action={action} className="flex items-start justify-between gap-4">
          <input type="hidden" name="id" value={person.id} />
          <header className="min-w-0 flex-1 space-y-2">
            <div className="grid max-w-lg grid-cols-2 gap-2">
              <input name="first" required autoFocus defaultValue={person.first} aria-label="First name" placeholder="First name" className="field display text-xl" />
              <input name="last" defaultValue={person.last} aria-label="Last name" placeholder="Last name" className="field display text-xl" />
            </div>
            <select name="relationship" defaultValue={person.relationship} aria-label="Relationship" className="field w-auto min-w-44 text-sm text-muted">
              <option value="">No relationship</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              {combined && <option value={combined}>{describe(combined)}</option>}
            </select>
            {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          </header>
          {/* Lined up with the name fields. */}
          <div className="flex shrink-0 gap-2 pt-1.5">
            <button type="button" className="btn rounded-full px-4" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </button>
            <button className="btn btn-primary rounded-full px-4" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
      {children}
      <form action={deletePersonAction} className="border-t border-line pt-6">
        <input type="hidden" name="id" value={person.id} />
        <ConfirmButton className="btn btn-danger rounded-full px-4" message={`Delete ${name}? Their recommendations will be removed from your books.`}>
          Delete person
        </ConfirmButton>
      </form>
    </div>
  );
}
