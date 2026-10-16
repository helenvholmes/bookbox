"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { setOnListAction } from "@/app/(app)/lists/actions";

/** Every list, as chips to tap the book on and off: "✓ Name" when it's on one, "+ Name" when not. Shows the change straight away while it saves. */
export function ListsPicker({ bookId, lists, on }: { bookId: number; lists: { id: number; name: string }[]; on: string[] }) {
  const [shown, setShown] = useOptimistic(on, (cur: string[], change: { name: string; on: boolean }) =>
    change.on ? [...cur, change.name] : cur.filter((n) => n !== change.name),
  );
  const [, startTransition] = useTransition();

  if (lists.length === 0) {
    return (
      <p className="text-sm text-muted">
        Collect books in your own lists, like Urbanism.{" "}
        <Link href="/lists" className="text-ink underline">
          Make a list
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {lists.map((l) => {
        const pressed = shown.includes(l.name);
        return (
          // "+ Name" until the book is on it (like "+ Review" above), so a list it isn't on doesn't read as a label.
          <button
            key={l.id}
            type="button"
            className="chip"
            aria-pressed={pressed}
            aria-label={pressed ? `On ${l.name}. Take it off` : `Add to ${l.name}`}
            onClick={() =>
              startTransition(async () => {
                setShown({ name: l.name, on: !pressed });
                await setOnListAction(bookId, l.id, !pressed);
              })
            }
          >
            {pressed ? "✓ " : "+ "}
            {l.name}
          </button>
        );
      })}
    </div>
  );
}
