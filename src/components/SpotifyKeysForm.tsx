"use client";

import { useActionState } from "react";
import { saveSpotifyKeysAction, type SpotifyKeysState } from "@/app/(app)/settings/actions";

/** Where the Spotify app's Client ID and secret are pasted in. The secret is write-only: it's never shown again. */
export function SpotifyKeysForm({ replacing = false }: { replacing?: boolean }) {
  const [state, action, pending] = useActionState(saveSpotifyKeysAction, null as SpotifyKeysState);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs text-muted">Client ID</span>
          <input name="client_id" required autoComplete="off" spellCheck={false} className="field font-mono text-xs" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted">Client secret</span>
          <input name="client_secret" type="password" required autoComplete="off" spellCheck={false} className="field font-mono text-xs" />
        </label>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <button className="btn rounded-full px-4" disabled={pending}>
        {pending ? "Saving…" : replacing ? "Replace keys" : "Save keys"}
      </button>
    </form>
  );
}
