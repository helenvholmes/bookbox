"use client";

import { useActionState, useState } from "react";
import { createApiKeyAction, saveApiKeyOriginsAction, type ApiKeyOriginsState, type ApiKeyState } from "@/app/(app)/settings/actions";

/** Makes a key for another app. The key is shown here once, then only its first characters. */
export function NewApiKeyForm() {
  const [state, action, pending] = useActionState(createApiKeyAction, null as ApiKeyState);
  const [copied, setCopied] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (state?.key && dismissed !== state.key) {
    return (
      <div className="space-y-3">
        <p className="text-muted">
          Copy the key for <span className="text-ink">{state.name}</span> now. It won&rsquo;t be shown again.
        </p>
        <div className="flex items-center gap-2">
          <code className="field flex-1 font-mono text-xs break-all select-all">{state.key}</code>
          <button
            type="button"
            className="btn shrink-0 rounded-full px-4"
            onClick={() => navigator.clipboard?.writeText(state.key!).then(() => setCopied(state.key!), () => {})}
          >
            {copied === state.key ? "Copied" : "Copy"}
          </button>
        </div>
        <button type="button" className="btn rounded-full px-4" onClick={() => setDismissed(state.key!)}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-xs text-muted">Name</span>
        <input name="name" required maxLength={60} placeholder="Scriptable widget" autoComplete="off" className="field text-sm" />
      </label>
      <OriginsField />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <button className="btn rounded-full px-4" disabled={pending}>
        {pending ? "Making…" : "Make a key"}
      </button>
    </form>
  );
}

function OriginsField({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted">Websites that may use it from the browser (optional, one per line)</span>
      <textarea name="origins" rows={2} defaultValue={defaultValue} placeholder="https://example.com" spellCheck={false} className="field font-mono text-xs" />
    </label>
  );
}

/** Changes which websites may use a key from the browser. */
export function ApiKeyOriginsForm({ id, origins }: { id: number; origins: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ApiKeyOriginsState, fd: FormData) => {
    const result = await saveApiKeyOriginsAction(prev, fd);
    if (result?.savedAt) setOpen(false);
    return result;
  }, null as ApiKeyOriginsState);

  if (!open) {
    return (
      <button type="button" className="text-xs text-faint hover:text-ink" onClick={() => setOpen(true)}>
        {origins.length ? "Change websites" : "Add websites"}
      </button>
    );
  }
  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="id" value={id} />
      <OriginsField defaultValue={origins.join("\n")} />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn rounded-full px-4" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
        <button className="btn btn-primary rounded-full px-4" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
