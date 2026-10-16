"use client";

import { useState } from "react";
import { createPersonAction } from "@/app/(app)/people/actions";
import { RelationshipChoices } from "./RelationshipChoices";

/** Header button that opens the new-person form in place. */
export function AddPersonButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn shrink-0" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Cancel" : "+ Add person"}
      </button>
      {open && (
        <form action={createPersonAction} className="card order-last basis-full space-y-4 p-4">
          <h2 className="section-title">New person</h2>
          <div className="grid grid-cols-2 gap-2">
            <input name="first" required autoFocus placeholder="First name" aria-label="First name" autoComplete="off" className="field" />
            <input name="last" placeholder="Last name" aria-label="Last name" autoComplete="off" className="field" />
          </div>
          <RelationshipChoices selected={[]} />
          <button className="btn btn-primary">Add person</button>
        </form>
      )}
    </>
  );
}
