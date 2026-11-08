"use client";

import { useFormStatus } from "react-dom";
import { SwapLabel } from "./SwapLabel";

/**
 * A form's submit button that shows the action is running and can't be pressed again until it
 * finishes. For actions slow enough that an unchanged button looks like a missed tap.
 */
export function SubmitButton({ children, pending, className = "" }: { children: React.ReactNode; pending: string; className?: string }) {
  const status = useFormStatus();
  return (
    <button className={`${className} ${status.pending ? "cursor-progress opacity-60" : ""}`} disabled={status.pending} aria-busy={status.pending}>
      <SwapLabel on={status.pending} label={children} onLabel={pending} />
    </button>
  );
}
