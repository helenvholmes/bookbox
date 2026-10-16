import "server-only";
import { after } from "next/server";
import type { CoverStore } from "./cover-store";
import { db } from "./db";

/**
 * Counts cover uploads and reads against the storage service's free tier, and stops at 80% of it.
 * Neither Cloudflare nor Vercel will stop at the free amount for us: Cloudflare bills past it, and
 * Vercel blocks the Blob store for 30 days. Past the stop, new covers aren't saved (books keep
 * their placeholder) and stored ones aren't served, until the next billing period starts.
 *
 * Uploads are rare, so each is counted as it happens. Reads come one per cover per new device, so
 * they're added up in memory and written every READ_FLUSH reads (or after a minute): a server that
 * shuts down loses a few, which the 20% margin covers.
 */

type Op = "upload" | "read";

/** Free each billing period, from each service's pricing page. */
export const FREE: Record<CoverStore["name"], Record<Op, number>> = {
  r2: { upload: 1_000_000, read: 10_000_000 }, // Class A and Class B operations
  blob: { upload: 2_000, read: 10_000 }, // Advanced and Simple operations
};
export const STOP_AT = 0.8;
const READ_FLUSH = 25;
const CACHE_MS = 60_000;

/**
 * The day of the month the billing period starts. Cloudflare's runs from the day the account was
 * set up (its Billing page shows the dates); counting by calendar month instead could let two
 * halves of one period each reach the stop.
 */
const CYCLE_DAY = Math.min(28, Math.max(1, Number(process.env.STORAGE_CYCLE_DAY) || 1));

/** The date the current billing period started (YYYY-MM-DD, UTC), and the date the next one does. */
export function billingPeriod(now = new Date()) {
  const m = now.getUTCMonth() - (now.getUTCDate() < CYCLE_DAY ? 1 : 0); // Date.UTC wraps -1 to last December
  const start = new Date(Date.UTC(now.getUTCFullYear(), m, CYCLE_DAY));
  const next = new Date(Date.UTC(now.getUTCFullYear(), m + 1, CYCLE_DAY));
  return { start: start.toISOString().slice(0, 10), next: next.toISOString().slice(0, 10) };
}

export type Usage = Record<Op, number>;

// Per server instance: reads not yet written, and the counts as last read from the database.
const g = globalThis as unknown as {
  bookboxMeter?: { pending: number; pendingSince: number; flushing: boolean; cached?: { key: string; usage: Usage; at: number } };
};
const state = (g.bookboxMeter ??= { pending: 0, pendingSince: 0, flushing: false });

async function add(period: string, store: string, op: Op, n: number) {
  await db
    .prepare("INSERT INTO storage_usage (period, store, op, count) VALUES (?, ?, ?, ?) ON CONFLICT(period, store, op) DO UPDATE SET count = count + excluded.count")
    .run(period, store, op, n);
}

export async function getUsage(store: CoverStore["name"], fresh = false): Promise<Usage> {
  const period = billingPeriod().start;
  const key = `${period}:${store}`;
  if (!fresh && state.cached?.key === key && Date.now() - state.cached.at < CACHE_MS) return state.cached.usage;
  const rows = (await db.prepare("SELECT op, count FROM storage_usage WHERE period = ? AND store = ?").all(period, store)) as { op: Op; count: number }[];
  const usage: Usage = { upload: 0, read: 0 };
  for (const r of rows) usage[r.op] = r.count;
  state.cached = { key, usage, at: Date.now() };
  return usage;
}

/** Whether this kind of operation is still allowed this period (counting reads not yet written). */
export async function allowed(store: CoverStore["name"], op: Op): Promise<boolean> {
  const usage = await getUsage(store);
  const used = usage[op] + (op === "read" ? state.pending : 0);
  return used < FREE[store][op] * STOP_AT;
}

export async function countUpload(store: CoverStore["name"]) {
  await add(billingPeriod().start, store, "upload", 1);
  if (state.cached) state.cached.at = 0; // re-read on the next check
}

/** Counts one read; the total is written after the response once enough have built up. */
export function countRead(store: CoverStore["name"]) {
  if (state.pending === 0) state.pendingSince = Date.now();
  state.pending++;
  if (state.flushing || (state.pending < READ_FLUSH && Date.now() - state.pendingSince < CACHE_MS)) return;
  state.flushing = true;
  const n = state.pending;
  state.pending = 0;
  after(async () => {
    try {
      await add(billingPeriod().start, store, "read", n);
    } catch {
      state.pending += n; // try again with the next batch
    } finally {
      state.flushing = false;
    }
  });
}
