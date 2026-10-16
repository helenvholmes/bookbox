"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        type="email"
        name="email"
        autoComplete="username"
        required
        autoFocus={!state}
        defaultValue={state?.email}
        placeholder="Email"
        aria-label="Email"
        className="field"
      />
      {/* After a failed try, the email is kept and the cursor waits in the password field. */}
      <input type="password" name="password" autoComplete="current-password" required autoFocus={!!state} placeholder="Password" aria-label="Password" className="field" />
      {state && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full py-3" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
