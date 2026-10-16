"use client";

import { useActionState } from "react";
import { changeEmailAction, changePasswordAction, type AccountState } from "@/app/(app)/settings/actions";

function CurrentPassword() {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted">Current password</span>
      <input name="current_password" type="password" required autoComplete="current-password" className="field" />
    </label>
  );
}

function Result({ state, saved }: { state: AccountState; saved: string }) {
  if (state?.error)
    return (
      <p className="text-xs text-danger" role="alert">
        {state.error}
      </p>
    );
  return state?.savedAt ? (
    <p className="text-xs text-muted" role="status">
      {saved}
    </p>
  ) : null;
}

export function ChangeEmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(changeEmailAction, null as AccountState);
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-xs text-muted">Email</span>
        <input name="email" type="email" required defaultValue={email} autoComplete="username" className="field" />
      </label>
      <CurrentPassword />
      <Result state={state} saved="Email changed. Use it the next time you sign in." />
      <button className="btn rounded-full px-4" disabled={pending}>
        {pending ? "Saving…" : "Change email"}
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null as AccountState);
  return (
    // Keyed by the save, so a changed password clears the fields.
    <form key={state?.savedAt} action={action} className="space-y-3">
      <CurrentPassword />
      <label className="block space-y-1.5">
        <span className="text-xs text-muted">New password</span>
        <input name="new_password" type="password" required minLength={10} autoComplete="new-password" className="field" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs text-muted">New password again</span>
        <input name="confirm_password" type="password" required minLength={10} autoComplete="new-password" className="field" />
      </label>
      <Result state={state} saved="Password changed. Your other devices are signed out." />
      <button className="btn rounded-full px-4" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
