"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

/** Forms whose action is running, and submit events already looked at (a form can hold several guarded buttons). */
const running = new WeakSet<HTMLFormElement>();
const seen = new WeakSet<Event>();

/**
 * Stops a form from being submitted again while its action is still running. Disabling the
 * button only takes effect once React re-renders, so presses that come quicker than that (a
 * double tap on a slow phone, Enter pressed twice) would otherwise each run the action, and,
 * say, add the same person twice. Give the returned ref to a submit button inside the form.
 */
export function useSubmitOnce() {
  const ref = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = (e: SubmitEvent) => {
      if (seen.has(e)) return;
      seen.add(e);
      if (running.has(form)) {
        // React's form handler sees this and leaves the action alone.
        e.preventDefault();
        e.stopImmediatePropagation();
      } else {
        running.add(form);
      }
    };
    // Before React's own listener, which is on the root.
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  // Open again once the action has finished (it stays running through a redirect away).
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) {
      wasPending.current = false;
      const form = ref.current?.form;
      if (form) running.delete(form);
    }
  }, [pending]);

  return { ref, pending };
}
