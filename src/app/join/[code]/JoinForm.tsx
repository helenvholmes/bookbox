"use client";

import { useActionState } from "react";
import { joinAction } from "./actions";

export function JoinForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState(joinAction.bind(null, code), undefined);
  return (
    <form action={action} className="space-y-3">
      <input name="name" defaultValue={state?.name} autoComplete="given-name" placeholder="Your first name" aria-label="Your first name" className="field" />
      <input name="email" type="email" required defaultValue={state?.email} autoComplete="username" placeholder="Email" aria-label="Email" className="field" />
      <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="Password (10 or more characters)" aria-label="Password" className="field" />
      <input name="confirm" type="password" required minLength={10} autoComplete="new-password" placeholder="Password again" aria-label="Password again" className="field" />
      {state && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full py-3" disabled={pending}>
        {pending ? "Setting up your library…" : "Create my library"}
      </button>
    </form>
  );
}
