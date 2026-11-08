"use client";

import { useFormStatus } from "react-dom";
import { SwapLabel } from "./SwapLabel";

/**
 * A form's submit button that shows the action is running and can't be pressed again until it
 * finishes. For actions slow enough that an unchanged button looks like a missed tap. It keeps the
 * width of its longer label, so what's beside it doesn't shift; `keepWidth={false}` for a text link,
 * where room saved for the other label would show as a gap.
 */
export function SubmitButton({ children, pending, className = "", keepWidth = true }: {
  children: React.ReactNode;
  pending: string;
  className?: string;
  keepWidth?: boolean;
}) {
  const status = useFormStatus();
  return (
    <button className={`${className} ${status.pending ? "cursor-progress opacity-60" : ""}`} disabled={status.pending} aria-busy={status.pending}>
      {keepWidth ? <SwapLabel on={status.pending} label={children} onLabel={pending} /> : status.pending ? pending : children}
    </button>
  );
}
