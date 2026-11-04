"use client";

import { useState } from "react";
import { useSubmitOnce } from "./useSubmitOnce";

/**
 * A destructive submit button that asks first, inline. (window.confirm is suppressed in some
 * home screen apps and embedded browsers, where it silently returns false.) With `onConfirm`,
 * confirming calls it instead of submitting the surrounding form. While that form's action runs,
 * the buttons are disabled and the confirm button shows `pending`, so it can't be submitted twice.
 */
export function ConfirmButton({ message, children, className, confirmLabel = "Delete", pending = "Deleting…", onConfirm }: {
  message: string;
  children: React.ReactNode;
  className?: string;
  confirmLabel?: string;
  pending?: string;
  onConfirm?: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-3" role="alert">
      <span className="text-sm text-muted">{message}</span>
      <span className="inline-flex gap-2">
        {onConfirm ? (
          <>
            <button type="button" className="btn rounded-full px-4" onClick={() => setArmed(false)} autoFocus>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger-solid rounded-full px-4"
              onClick={() => {
                setArmed(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </>
        ) : (
          <SubmitChoices confirmLabel={confirmLabel} pending={pending} onCancel={() => setArmed(false)} />
        )}
      </span>
    </span>
  );
}

/** Cancel, and the button that submits the form; both off while its action runs. */
function SubmitChoices({ confirmLabel, pending, onCancel }: { confirmLabel: string; pending: string; onCancel: () => void }) {
  const { ref, pending: busy } = useSubmitOnce();
  return (
    <>
      <button type="button" className="btn rounded-full px-4" onClick={onCancel} disabled={busy} autoFocus>
        Cancel
      </button>
      <button
        ref={ref}
        className={`btn btn-danger-solid rounded-full px-4 ${busy ? "cursor-progress opacity-60" : ""}`}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? pending : confirmLabel}
      </button>
    </>
  );
}
