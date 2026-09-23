"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      {/* The username field lets password managers and iCloud Keychain save the login. */}
      <input type="text" name="username" autoComplete="username" value="bookbox" readOnly hidden />
      <input type="password" name="password" autoComplete="current-password" required autoFocus placeholder="Password" aria-label="Password" className="field" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn btn-primary w-full py-3" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
