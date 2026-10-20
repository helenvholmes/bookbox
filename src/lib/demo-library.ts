import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "@libsql/client";
import { closeLibrary, type Library } from "./db";
import { MADE_ON, STATEMENTS } from "./demo-seed";

/**
 * Demo visitors' throwaway libraries (see demo.ts): SQLite files in the server's temporary folder,
 * each a copy of the snapshot in demo-seed.ts, deleted after a while unused. They live on one
 * server instance, so a visitor who lands on another (or comes back to a recycled one) simply
 * starts again from the snapshot.
 */

const DIR = path.join(os.tmpdir(), "bookbox-demo");
/** How long a library is kept after its last request. */
const IDLE_MS = 20 * 60_000;
/** Libraries one instance keeps at most; the longest unused go first. */
const MAX_LIBRARIES = 200;
const SWEEP_MS = 60_000;

const g = globalThis as unknown as { bookboxDemos?: Map<string, number>; bookboxDemoSweptAt?: number };
const lastUsed = (g.bookboxDemos ??= new Map());

const file = (id: string) => path.join(DIR, `${id}.db`);
const libraryOf = (id: string): Library => ({ accountId: null, url: `file:${file(id)}`, demoId: id });

/** Where a demo library's own covers go (the snapshot's are in public/demo-covers). */
export const demoCoversDir = (id: string) => path.join(DIR, `${id}-covers`);

export function demoLibrary(id: string): Library {
  fs.mkdirSync(DIR, { recursive: true });
  lastUsed.set(id, Date.now());
  if (Date.now() - (g.bookboxDemoSweptAt ?? 0) > SWEEP_MS) sweep(id);
  return libraryOf(id);
}

/** Deletes a demo library, so its next request starts again from the snapshot. */
export function removeDemoLibrary(id: string) {
  closeLibrary(libraryOf(id));
  lastUsed.delete(id);
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file(id) + suffix, { force: true });
  fs.rmSync(demoCoversDir(id), { recursive: true, force: true });
}

/** Removes libraries unused for IDLE_MS, then the longest unused beyond MAX_LIBRARIES. Never `keep`, in use right now. */
function sweep(keep: string) {
  g.bookboxDemoSweptAt = Date.now();
  const ids = fs
    .readdirSync(DIR)
    .map((name) => /^([0-9a-f]{32})\.db$/.exec(name)?.[1])
    .filter((id): id is string => !!id && id !== keep);
  // Files left from before this instance's last restart have no entry; their last write will do.
  const used = ids.map((id) => ({ id, at: lastUsed.get(id) ?? fs.statSync(file(id), { throwIfNoEntry: false })?.mtimeMs ?? 0 })).sort((a, b) => a.at - b.at);
  const now = Date.now();
  used.forEach(({ id, at }, i) => {
    if (now - at > IDLE_MS || used.length - i >= MAX_LIBRARIES) removeDemoLibrary(id);
  });
}

/**
 * Fills a new demo library from the snapshot, with its dates moved forward by the time since the
 * snapshot was made, so this year's goal, Currently Reading and the calendar look as they did then.
 */
export async function seedDemo(client: Client) {
  const made = new Date(`${MADE_ON}T00:00:00Z`);
  const today = new Date();
  const days = `+${Math.max(0, Math.floor((today.getTime() - made.getTime()) / 86_400_000))} days`;
  const years = today.getUTCFullYear() - made.getUTCFullYear();
  await client.batch(
    [
      ...STATEMENTS,
      { sql: "UPDATE book_reads SET started_on = date(started_on, ?) WHERE started_on IS NOT NULL", args: [days] },
      { sql: "UPDATE book_reads SET finished_on = date(finished_on, ?) WHERE finished_on IS NOT NULL", args: [days] },
      // A read with a finish date is in that date's year; older reads only have a year.
      "UPDATE book_reads SET year = CAST(strftime('%Y', finished_on) AS INTEGER) WHERE finished_on IS NOT NULL",
      { sql: "UPDATE book_reads SET year = year + ? WHERE finished_on IS NULL", args: [years] },
      { sql: "UPDATE books SET started_on = date(started_on, ?) WHERE started_on IS NOT NULL", args: [days] },
      { sql: "UPDATE books SET due_date = date(due_date, ?) WHERE due_date IS NOT NULL", args: [days] },
      { sql: "UPDATE loans SET lent_on = date(lent_on, ?), returned_on = date(returned_on, ?)", args: [days, days] },
      // Through a year no goal has, so moving one onto another's year never collides.
      { sql: "UPDATE goals SET year = year + ? + 100000", args: [years] },
      "UPDATE goals SET year = year - 100000",
    ],
    "write",
  );
}
