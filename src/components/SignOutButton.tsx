"use client";

import { useState } from "react";
import { signOutAction } from "@/app/login/actions";
import { useOutbox } from "@/lib/outbox";

/**
 * Signs this device out. First it clears what the app keeps on the device for offline use (saved
 * pages, covers, the search index, edits waiting to sync), so nothing private stays readable after
 * signing out. Edits that haven't synced would be lost, so it asks first when there are any.
 */
export function SignOutButton({ className = "", label = "Sign out" }: { className?: string; label?: React.ReactNode }) {
  const { ops } = useOutbox();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("bookbox-")).map((k) => caches.delete(k)));
    } catch {}
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("bookbox:")) localStorage.removeItem(k);
      sessionStorage.clear();
    } catch {}
    await signOutAction();
    // A full page load, so nothing from the library stays in memory either.
    location.replace("/");
  }

  if (confirming) {
    return (
      <span className="block space-y-2 px-2.5 py-1.5 text-[0.8125rem]" role="alert">
        <span className="block text-muted">
          {ops.length} {ops.length === 1 ? "change hasn’t" : "changes haven’t"} synced yet and will be lost. Sign out anyway?
        </span>
        <span className="flex gap-2">
          <button type="button" className="btn rounded-full px-3 text-xs" onClick={() => setConfirming(false)} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn-danger-solid rounded-full px-3 text-xs" onClick={() => void signOut()} disabled={busy}>
            Sign out
          </button>
        </span>
      </span>
    );
  }
  return (
    <button type="button" className={className} disabled={busy} onClick={() => (ops.length ? setConfirming(true) : void signOut())}>
      {busy ? "Signing out…" : label}
    </button>
  );
}
