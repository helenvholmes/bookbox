"use client";

import { useActionState, useState } from "react";
import { pullLatestAction, type PullState } from "@/app/dev/actions";

/**
 * Local development only: says how old this computer's copy of the library is, and offers to
 * pull the hosted one. Shown when the copy is a few days old (or was never pulled).
 */
export function LocalCopyBanner({ pulledAt }: { pulledAt: number | null }) {
  const [state, action, pending] = useActionState(pullLatestAction, null as PullState);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const when = pulledAt ? new Date(pulledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-4 md:left-56">
      <form action={action} className="card pointer-events-auto flex flex-wrap items-center gap-3 px-4 py-2 text-xs text-muted shadow-xl shadow-black/40">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        {state?.summary ?? state?.error ?? (when ? `Local copy of your library from ${when}.` : "This is a local copy of your library, not the live one.")}
        {!state?.summary && (
          <button className="text-ink underline disabled:no-underline disabled:opacity-60" disabled={pending}>
            {pending ? "Pulling…" : "Pull latest"}
          </button>
        )}
        <button type="button" className="text-faint hover:text-muted" onClick={() => setDismissed(true)} aria-label="Dismiss">
          ×
        </button>
      </form>
    </div>
  );
}
