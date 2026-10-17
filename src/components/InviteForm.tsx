"use client";

import { useActionState, useState } from "react";
import { createInviteAction, type InviteState } from "@/app/(app)/settings/actions";

/** Makes an invite link and shows it once, ready to copy into a message. */
export function InviteForm() {
  const [state, action, pending] = useActionState(createInviteAction, null as InviteState);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 space-y-1.5">
          <span className="text-xs text-muted">Who it’s for (just for you)</span>
          <input name="note" maxLength={80} placeholder="e.g. Katie" className="field" />
        </label>
        <button className="btn rounded-full px-4" disabled={pending}>
          {pending ? "Making…" : "Make invite link"}
        </button>
      </form>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.link && (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-xs text-muted">Send this link. It works once, for two weeks, and isn’t shown again.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 font-mono text-xs break-all">{state.link}</code>
            <button
              type="button"
              className="btn rounded-full px-3 text-xs"
              onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(state.link!))}
            >
              {copied === state.link ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
