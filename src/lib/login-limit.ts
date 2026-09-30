import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "./db";

/**
 * Limits password guesses: after MAX_FAILURES wrong passwords from one network address within
 * WINDOW_MS, that address has to wait out the rest of the window. Kept in the database, so it holds
 * across serverless instances. Addresses are stored hashed.
 */

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

async function clientKey(): Promise<string> {
  const h = await headers();
  // Vercel sets x-forwarded-for to the real client address (a client-supplied value is replaced).
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const salt = process.env.BOOKBOX_SECRET || process.env.BOOKBOX_PASSWORD || "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("base64url").slice(0, 32);
}

/** Minutes until this address may try again, or 0 when it may try now. */
export async function lockedOutFor(): Promise<number> {
  const row = (await db.prepare("SELECT count, first_at FROM login_failures WHERE key = ?").get(await clientKey())) as
    | { count: number; first_at: number }
    | undefined;
  if (!row || row.count < MAX_FAILURES) return 0;
  const left = row.first_at + WINDOW_MS - Date.now();
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

export async function recordFailure() {
  const now = Date.now();
  // A failure after the window has passed starts a new window.
  await db
    .prepare(
      `INSERT INTO login_failures (key, count, first_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN first_at < ? THEN 1 ELSE count + 1 END,
         first_at = CASE WHEN first_at < ? THEN excluded.first_at ELSE first_at END`,
    )
    .run(await clientKey(), now, now - WINDOW_MS, now - WINDOW_MS);
  // Keep the table small.
  await db.prepare("DELETE FROM login_failures WHERE first_at < ?").run(now - 24 * 60 * 60 * 1000);
}

export async function clearFailures() {
  await db.prepare("DELETE FROM login_failures WHERE key = ?").run(await clientKey());
}
