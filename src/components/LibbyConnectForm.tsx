"use client";

import { useActionState } from "react";
import { connectLibbyAction, type LibbyConnectState } from "@/app/(app)/settings/actions";

/** Where Libby's 8-digit Copy To Another Device code goes. Sends the device's time zone along, for the days books are borrowed and due. */
export function LibbyConnectForm({ reconnecting = false }: { reconnecting?: boolean }) {
  const [state, action, pending] = useActionState(connectLibbyAction, null as LibbyConnectState);
  return (
    <form
      action={(fd) => {
        fd.set("time_zone", Intl.DateTimeFormat().resolvedOptions().timeZone);
        return action(fd);
      }}
      className="space-y-3"
    >
      <label className="block space-y-1.5">
        <span className="text-xs text-muted">Code</span>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\s*(\d\s*){8}"
          placeholder="12345678"
          className="field font-mono text-sm tracking-widest"
        />
      </label>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <button className="btn btn-primary rounded-full px-4" disabled={pending}>
        {pending ? "Connecting…" : reconnecting ? "Connect again" : "Connect Libby"}
      </button>
    </form>
  );
}
