"use client";

import { useSyncExternalStore } from "react";

/** Today as YYYY-MM-DD in the device's own time zone. */
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const noSubscribe = () => () => {};

/**
 * "Borrowed from the library · due Oct 12", or "overdue since Oct 12" once that day has passed on
 * this device. The server (on UTC) can't tell, so its render never says overdue; the browser fills it in.
 */
export function BorrowedNote({ library, due }: { library: string; due: string | null }) {
  const now = useSyncExternalStore(noSubscribe, today, () => null);
  const overdue = !!due && !!now && due < now;
  const dueText = due ? new Date(`${due}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return (
    <p className={`mt-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${overdue ? "border-danger/40 text-danger" : "border-line text-muted"}`}>
      Borrowed{library ? ` from ${library}` : " from the library"}
      {dueText && <span>· {overdue ? `overdue since ${dueText}` : `due ${dueText}`}</span>}
    </p>
  );
}
