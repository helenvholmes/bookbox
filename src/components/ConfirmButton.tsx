"use client";

import { useState } from "react";

/**
 * A destructive submit button that asks first, inline. (window.confirm is suppressed in some
 * home screen apps and embedded browsers, where it silently returns false.)
 */
export function ConfirmButton({ message, children, className, confirmLabel = "Delete" }: {
  message: string;
  children: React.ReactNode;
  className?: string;
  confirmLabel?: string;
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
        <button type="button" className="btn rounded-full px-4" onClick={() => setArmed(false)} autoFocus>
          Cancel
        </button>
        <button type="submit" className="btn btn-danger-solid rounded-full px-4">
          {confirmLabel}
        </button>
      </span>
    </span>
  );
}
