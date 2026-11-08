"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { regenerateShareAction, saveShareAction, type ShareState } from "@/app/(app)/people/actions";
import type { ShareSettings } from "@/lib/share";
import { shownAccent } from "@/lib/share-accent";
import { ConfirmButton } from "./ConfirmButton";
import { Toggle } from "./inputs";
import { SwapLabel } from "./SwapLabel";

type Props = {
  personId: number;
  first: string;
  settings: ShareSettings;
  counts: { for: number; by: number };
  defaultTitle: string;
  accents: string[];
};

/** Settings for a person's public share page, with its link. */
export function ShareEditor({ personId, first, settings, counts, defaultTitle, accents }: Props) {
  const [state, action, pending] = useActionState(saveShareAction, null as ShareState);
  const [enabled, setEnabled] = useState(settings.enabled || !settings.token);
  const [theirs, setTheirs] = useState(settings.show_theirs);
  const [ratings, setRatings] = useState(settings.show_ratings);
  const [reviews, setReviews] = useState(settings.show_reviews);
  const [accent, setAccent] = useState(settings.accent);
  const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");
  // The server doesn't know which address the app is being viewed at, so this is empty until hydration.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const token = state?.token ?? settings.token;
  const url = token && origin ? `${origin}/s/${token}` : null;
  const live = token && (state?.savedAt ? enabled : settings.enabled);

  return (
    <div className="space-y-8">
      {url && (
        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Link</h2>
            <span className={`text-xs ${live ? "text-ink" : "text-faint"}`}>{live ? "Live" : "Turned off"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input readOnly value={url} aria-label="Share link" className="field min-w-0 flex-1 text-sm text-muted" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn rounded-full px-4"
              onClick={async (e) => {
                // Copying can be refused (no permission, or an embedded browser): then the link is selected to copy by hand.
                const input = e.currentTarget.parentElement?.querySelector("input");
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied("yes");
                  setTimeout(() => setCopied("no"), 1500);
                } catch {
                  input?.select();
                  setCopied("failed");
                }
              }}
            >
              <SwapLabel on={copied === "yes"} label="Copy" onLabel="Copied" />
            </button>
            {live && (
              <a href={url} target="_blank" rel="noreferrer" className="btn rounded-full px-4">
                Open ↗
              </a>
            )}
          </div>
          {copied === "failed" && (
            <p className="text-xs text-muted" role="status">
              Couldn’t copy it here. The link is selected: press and hold it (or use your keyboard) to copy.
            </p>
          )}
          <form action={regenerateShareAction}>
            <input type="hidden" name="person_id" value={personId} />
            <ConfirmButton className="text-xs text-muted underline hover:text-ink" message="Make a new link? The old one will stop working." confirmLabel="New link">
              Make a new link
            </ConfirmButton>
          </form>
        </section>
      )}

      <form action={action} className="space-y-6">
        <input type="hidden" name="person_id" value={personId} />
        <input type="hidden" name="accent" value={accent} />

        <section className="card divide-y divide-line px-4">
          <div className="py-2">
            <Toggle name="enabled" label="Link is on" checked={enabled} onChange={setEnabled} />
          </div>
          <div className="py-2">
            <Toggle
              name="show_theirs"
              label={`Also show the books ${first} recommended to me`}
              checked={theirs}
              onChange={setTheirs}
            />
            <p className="pb-2 text-xs text-muted">
              {counts.for} {counts.for === 1 ? "book" : "books"} for {first}
              {theirs ? `, then ${counts.by} from ${first} underneath` : ""}.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Title</span>
            <input name="title" defaultValue={settings.title} placeholder={defaultTitle} className="field display text-lg" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Message</span>
            <textarea name="message" defaultValue={settings.message} placeholder={`A note to ${first}, shown at the top`} className="field" />
          </label>
        </section>

        <section className="card divide-y divide-line px-4">
          <fieldset className="flex items-center justify-between gap-3 py-3">
            <legend className="sr-only">Layout</legend>
            <span className="text-sm font-medium">Layout</span>
            <span className="flex gap-2">
              {(["grid", "list"] as const).map((l) => (
                <label key={l} className="chip cursor-pointer has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-muted">
                  <input type="radio" name="layout" value={l} defaultChecked={settings.layout === l} className="sr-only" />
                  {l === "grid" ? "Covers" : "List"}
                </label>
              ))}
            </span>
          </fieldset>
          <div className="py-2">
            <Toggle name="show_ratings" label="Show my ratings" checked={ratings} onChange={setRatings} />
          </div>
          <div className="py-2">
            <Toggle name="show_reviews" label="Show my reviews" checked={reviews} onChange={setReviews} />
            {reviews && <p className="pb-2 text-xs text-muted">Your review text will be visible to anyone with the link.</p>}
          </div>
          <fieldset className="flex items-center justify-between gap-3 py-3">
            <legend className="sr-only">Accent colour</legend>
            <span className="text-sm font-medium">Accent</span>
            {/* Each swatch is a 40-pixel square to tap around its 24-pixel dot. */}
            <span className="-mr-2 flex">
              {accents.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Accent ${c}`}
                  aria-pressed={accent === c}
                  onClick={() => setAccent(c)}
                  className="group flex size-10 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-muted"
                >
                  <span
                    className={`size-6 rounded-full ring-offset-2 ring-offset-card ${accent === c ? "ring-2 ring-ink" : ""}`}
                    style={{ background: shownAccent(c) }}
                  />
                </button>
              ))}
            </span>
          </fieldset>
        </section>

        <div className="flex items-center gap-3">
          <button className="btn btn-primary rounded-full px-5" disabled={pending}>
            <SwapLabel on={pending} label={token ? "Save" : "Create link"} onLabel="Saving…" />
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
    </div>
  );
}
