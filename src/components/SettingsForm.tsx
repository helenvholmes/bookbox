"use client";

import { useActionState, useState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/(app)/settings/actions";
import type { Settings } from "@/lib/settings";
import { Toggle } from "./inputs";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null as SettingsState);
  const [name, setName] = useState(settings.ownerName);
  const [publicHome, setPublicHome] = useState(settings.publicHome);
  const shown = name.trim();

  return (
    <form action={action} className="max-w-xl space-y-6">
      <section className="card space-y-3 p-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Your name</span>
          <input
            name="owner_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="given-name"
            placeholder="First name"
            className="field"
          />
        </label>
        <p className="text-xs text-muted">
          Shown as &ldquo;{shown ? `Hello, ${shown}` : "Hello"}&rdquo; in your library, and &ldquo;{shown ? `A reading list from ${shown}` : "A reading list"}
          &rdquo; on the pages you share. Leave it empty for neither.
        </p>
      </section>

      <section className="card space-y-1 px-5 py-3">
        <Toggle name="public_home" label="Show a page about BookBox to visitors" checked={publicHome} onChange={setPublicHome} />
        <p className="pb-2 text-xs text-muted">
          {publicHome
            ? "People who aren’t signed in see a page about BookBox at your site’s address, with a link to sign in. Your library stays private."
            : "People who aren’t signed in go straight to the sign-in page."}
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary rounded-full px-5" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.savedAt && !pending && (
          <span className="flex items-center gap-1.5 text-sm text-muted" role="status">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6.5 9.5 17 4 11.5" />
            </svg>
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
