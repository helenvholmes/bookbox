"use client";

import { useActionState } from "react";
import { saveHardcoverTokenAction, type HardcoverTokenState } from "@/app/(app)/settings/actions";

/** Where the Hardcover API token is pasted in. Like the Spotify secret, it's never shown again. */
export function HardcoverTokenForm({ replacing = false }: { replacing?: boolean }) {
  const [state, action, pending] = useActionState(saveHardcoverTokenAction, null as HardcoverTokenState);
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-xs text-muted">API token</span>
        <input name="token" type="password" required autoComplete="off" spellCheck={false} className="field font-mono text-xs" />
      </label>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <button className="btn rounded-full px-4" disabled={pending}>
        {pending ? "Saving…" : replacing ? "Replace token" : "Save token"}
      </button>
    </form>
  );
}
