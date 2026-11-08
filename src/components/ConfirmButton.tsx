"use client";

import { useState } from "react";

/**
 * A destructive submit button that asks first, inline. (window.confirm is suppressed in some
 * home screen apps and embedded browsers, where it silently returns false.) With `onConfirm`,
 * confirming calls it instead of submitting the surrounding form. `armedClassName` places the question
 * once it's asked, e.g. on a line of its own where the button sat at the end of a row.
 */
export function ConfirmButton({ message, children, className, armedClassName = "", label, confirmLabel = "Delete", onConfirm }: {
  message: string;
  children: React.ReactNode;
  className?: string;
  armedClassName?: string;
  /** What a screen reader hears for the button, when its content is only an icon or symbol. */
  label?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" className={className} aria-label={label} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-3 ${armedClassName}`} role="alert">
      <span className="text-sm text-muted">{message}</span>
      <span className="inline-flex gap-2">
        <button type="button" className="btn rounded-full px-4" onClick={() => setArmed(false)} autoFocus>
          Cancel
        </button>
        <button
          type={onConfirm ? "button" : "submit"}
          className="btn btn-danger-solid rounded-full px-4"
          onClick={
            onConfirm &&
            (() => {
              setArmed(false);
              onConfirm();
            })
          }
        >
          {confirmLabel}
        </button>
      </span>
    </span>
  );
}
