"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { refreshBatchAction } from "@/app/(app)/refresh/actions";

type Totals = { checked: number; filled: number; suggested: number; failed: number };
const ZERO: Totals = { checked: 0, filled: 0, suggested: 0, failed: 0 };

/** Runs the OpenLibrary refresh a few books at a time for as long as this page is open. */
export function RefreshRunner({ remaining, total }: { remaining: number; total: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [goal, setGoal] = useState(remaining);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const stop = useRef(false);

  async function run(recheck: boolean) {
    stop.current = false;
    setRunning(true);
    setError(false);
    setGoal(recheck ? total : remaining);
    let sum = ZERO;
    setTotals(sum);
    let cursor: number | null = null;
    try {
      do {
        const r = await refreshBatchAction(cursor, recheck);
        cursor = r.cursor;
        sum = { checked: sum.checked + r.checked, filled: sum.filled + r.filled, suggested: sum.suggested + r.suggested, failed: sum.failed + r.failed };
        setTotals(sum);
        if (r.last) setCurrent(r.last);
        // Show new suggestions as they arrive.
        if (r.suggested) router.refresh();
      } while (cursor !== null && !stop.current);
    } catch {
      setError(true);
    }
    setRunning(false);
    setCurrent(null);
    router.refresh();
  }

  const done = totals ? totals.checked + totals.failed : 0;
  const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : 0;

  return (
    <section className="card space-y-4 p-5">
      {running ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              Checking {done} of {goal}…
            </p>
            <button type="button" className="btn rounded-full px-4" onClick={() => (stop.current = true)}>
              Stop
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={done} aria-valuemax={goal}>
            <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="truncate text-xs text-muted">{current ? `Last: ${current}` : " "}</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {remaining > 0 ? (
              <>
                <span className="text-ink">{remaining} books</span> with an ISBN haven&rsquo;t been checked yet. At a few seconds each, this takes a
                while; keep this page open while it runs.
              </>
            ) : (
              "Every book with an ISBN has been checked."
            )}
          </p>
          <div className="flex gap-2">
            {remaining > 0 && (
              <button type="button" className="btn btn-primary rounded-full px-4" onClick={() => void run(false)}>
                {remaining < total ? "Continue" : "Start"}
              </button>
            )}
            <button type="button" className="btn rounded-full px-4" onClick={() => void run(true)}>
              Check all again
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-danger">The refresh stopped because the server couldn&rsquo;t be reached. Continue to pick up where it left off.</p>}
      {totals && (
        <p className="text-xs text-faint">
          This run: {totals.checked} checked · {totals.filled} filled in · {totals.suggested} new suggestions
          {totals.failed > 0 ? ` · ${totals.failed} couldn’t be reached (will retry next time)` : ""}
        </p>
      )}
    </section>
  );
}
