import "server-only";
import { after } from "next/server";
import { accountsDb, isOwner, type Account } from "./accounts";
import { demoMode } from "./demo";
import { currentAccount } from "./session";
import type { UsageKind } from "./usage-events";

/**
 * Usage tracking for the people the owner has invited, so the owner can see how BookBox is going for
 * them: which pages they open, what they add and import (and from where), and where they get stuck
 * (rage clicks, errors). Only the owner sees it, on the Usage page. The owner's own use, the demo,
 * and a copy without accounts record nothing. Events are kept for USAGE_KEEP_DAYS.
 */

export const USAGE_KEEP_DAYS = 180;
const DAY = 24 * 60 * 60 * 1000;

/** Whether this account's use is recorded: anyone signed in except the owner, and never in the demo. */
export const tracked = (account: Account | null): account is Account => !!account && !isOwner(account) && !demoMode();

export type UsageEvent = { kind: UsageKind; path?: string; detail?: Record<string, unknown>; at?: number };

/** Saves events for an account. Never throws: tracking mustn't break what it's watching. */
export async function recordEvents(accountId: number, events: UsageEvent[]) {
  if (!events.length) return;
  try {
    const now = Date.now();
    const values: (string | number)[] = [];
    for (const e of events) values.push(accountId, e.at ?? now, e.kind, (e.path ?? "").slice(0, 300), JSON.stringify(e.detail ?? {}).slice(0, 2000));
    await accountsDb.run(`INSERT INTO usage_events (account_id, at, kind, path, detail) VALUES ${events.map(() => "(?, ?, ?, ?, ?)").join(", ")}`, ...values);
    // Now and then, forget the oldest.
    if (Math.random() < 0.02) await accountsDb.run("DELETE FROM usage_events WHERE at < ?", now - USAGE_KEEP_DAYS * DAY);
  } catch (err) {
    console.error("usage", err);
  }
}

/**
 * Records a server-side event for the signed-in person (or `accountId`, for a sign-in that hasn't
 * reached the cookie yet), after the response, so it never slows anything down.
 */
export function track(kind: UsageKind, detail: Record<string, unknown> = {}, accountId?: number) {
  if (demoMode()) return;
  after(async () => {
    try {
      let account: Account | null;
      if (accountId !== undefined) {
        const { getAccount } = await import("./accounts");
        account = await getAccount(accountId);
      } else {
        account = await currentAccount();
      }
      if (tracked(account)) await recordEvents(account.id, [{ kind, detail }]);
    } catch (err) {
      console.error("usage", err);
    }
  });
}

// Reading it back, for the owner's Usage page.

export type StoredEvent = { accountId: number; at: number; kind: UsageKind; path: string; detail: Record<string, unknown> };

/** The last `days` days' events, newest first, and the time they were read at. */
export async function recentEvents(days: number): Promise<{ events: StoredEvent[]; now: number }> {
  const now = Date.now();
  const rows = await accountsDb.all("SELECT account_id, at, kind, path, detail FROM usage_events WHERE at >= ? ORDER BY at DESC LIMIT 50000", now - days * DAY);
  const events = rows.map((r) => {
    let detail: Record<string, unknown> = {};
    try {
      detail = JSON.parse(String(r.detail));
    } catch {}
    return { accountId: Number(r.account_id), at: Number(r.at), kind: String(r.kind) as UsageKind, path: String(r.path), detail };
  });
  return { events, now };
}
