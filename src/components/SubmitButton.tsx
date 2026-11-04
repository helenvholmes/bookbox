"use client";

import { useFormStatus } from "react-dom";
import { useSubmitOnce } from "./useSubmitOnce";

/**
 * A form's submit button that shows the action is running and can't be pressed again until it
 * finishes, so a second tap doesn't submit twice (and, say, add the same person twice).
 *
 * When a form has several submit buttons told apart by `name` and `value`, they're all disabled
 * while it runs, but only the one that was pressed shows its `pending` label.
 */
export function SubmitButton({
  children,
  pending,
  className = "",
  name,
  value,
  disabled = false,
}: {
  children: React.ReactNode;
  pending: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const status = useFormStatus();
  const { ref } = useSubmitOnce();
  const pressed = status.pending && (!name || status.data?.get(name) === value);
  return (
    <button
      ref={ref}
      className={`${className} ${status.pending ? "cursor-progress opacity-60" : ""}`}
      name={name}
      value={value}
      disabled={disabled || status.pending}
      aria-busy={pressed}
    >
      {pressed ? pending : children}
    </button>
  );
}
