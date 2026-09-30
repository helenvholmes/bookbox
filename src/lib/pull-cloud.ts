/**
 * Copies the hosted library (Turso database and Vercel Blob covers) down to this computer, so a
 * local copy of BookBox matches the real one. Used by `npm run pull:cloud` and by the "Pull latest"
 * banner in local development. Never runs on the hosted site.
 *
 * - Reads the hosted keys from .env.cloud (the same file `npm run push:cloud` uses).
 * - Backs up the local database first (data/backups, keeping the last three).
 * - Replaces the local rows in one transaction, in the database file itself, so a running dev
 *   server sees the new data straight away.
 * - Leaves behind things that only belong on the server: the Spotify sign-in, failed sign-in
 *   counts, in-progress claims, and the schema stamp.
 * - Downloads only the covers this computer doesn't have.
 */

import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { createClient, type InStatement, type InValue } from "@libsql/client";
import { get } from "@vercel/blob";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const LOCAL_DB = path.join(DATA_DIR, "bookbox.db");
const COVERS_DIR = path.join(DATA_DIR, "covers");
const BACKUPS = path.join(DATA_DIR, "backups");
const STAMP = path.join(DATA_DIR, ".last-pull.json");
const CLOUD_ENV = path.join(ROOT, ".env.cloud");

/** Tables that are about the server, not the library. */
const SKIP_TABLES = new Set(["spotify_account", "login_failures", "spotify_adding", "bookbox_meta"]);
/** Settings that are secrets for the server's use (the Spotify app keys). */
const SKIP_SETTINGS = ["spotify_client_id", "spotify_client_secret"];

/** The local copy is offered a refresh once it's this old. */
export const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export type PullResult = { tables: Record<string, number>; coversDownloaded: number; backup: string | null; at: number };

/** Whether this computer is set up to pull (it has .env.cloud with the hosted database's keys). */
export function canPull(): boolean {
  if (process.env.VERCEL) return false;
  const env = readCloudEnv();
  return !!(env?.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
}

/** When the local copy was last pulled, or null if it never has been. */
export function lastPulled(): number | null {
  try {
    return (JSON.parse(fs.readFileSync(STAMP, "utf8")) as { at: number }).at;
  } catch {
    return null;
  }
}

/** Whether the local copy is old enough (or was never pulled) to offer a refresh. */
export function isStale(): boolean {
  const at = lastPulled();
  return !at || Date.now() - at > STALE_AFTER_MS;
}

function readCloudEnv(): Record<string, string> | null {
  try {
    return parseEnv(fs.readFileSync(CLOUD_ENV, "utf8")) as Record<string, string>;
  } catch {
    return null;
  }
}

export async function pullFromCloud(log: (line: string) => void = () => {}): Promise<PullResult> {
  if (process.env.VERCEL) throw new Error("Pulling only runs on your own computer.");
  const env = readCloudEnv();
  if (!env?.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error("No hosted database keys in .env.cloud.");

  const remote = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const local = createClient({ url: `file:${LOCAL_DB}` });

  // 1. Back up what's here now.
  let backup: string | null = null;
  if (fs.existsSync(LOCAL_DB)) {
    fs.mkdirSync(BACKUPS, { recursive: true });
    backup = path.join(BACKUPS, `bookbox-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
    await local.execute({ sql: "VACUUM INTO ?", args: [backup] });
    const old = fs.readdirSync(BACKUPS).filter((f) => f.startsWith("bookbox-")).sort();
    for (const f of old.slice(0, -3)) fs.rmSync(path.join(BACKUPS, f));
    log(`Backed up the local library to ${path.relative(ROOT, backup)}`);
  }

  // 2. Make sure every hosted table exists here (a local copy can be behind on new features).
  const ddl = (await remote.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND type IN ('table', 'index')")).rows;
  for (const r of ddl.filter((r) => r.type === "table")) await local.execute(String(r.sql).replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS "));
  for (const r of ddl.filter((r) => r.type === "index")) await local.execute(String(r.sql).replace(/^CREATE (UNIQUE )?INDEX /i, "CREATE $1INDEX IF NOT EXISTS "));

  // 3. Copy rows, parents before the rows that point at them.
  const names = ddl.filter((r) => r.type === "table").map((r) => String(r.name)).filter((t) => !SKIP_TABLES.has(t));
  const parents = new Map<string, string[]>();
  for (const t of names) parents.set(t, (await remote.execute(`SELECT "table" FROM pragma_foreign_key_list('${t}')`)).rows.map((r) => String(r.table)).filter((p) => p !== t));
  const order: string[] = [];
  const visit = (t: string) => {
    if (order.includes(t)) return;
    for (const p of parents.get(t) ?? []) if (names.includes(p)) visit(p);
    order.push(t);
  };
  names.forEach(visit);

  const stmts: InStatement[] = [];
  for (const t of [...order].reverse()) {
    stmts.push(t === "settings" ? { sql: `DELETE FROM settings WHERE key NOT IN (${SKIP_SETTINGS.map(() => "?").join(", ")})`, args: SKIP_SETTINGS } : `DELETE FROM "${t}"`);
  }
  const tables: Record<string, number> = {};
  for (const t of order) {
    const localCols = new Set((await local.execute(`SELECT name FROM pragma_table_info('${t}')`)).rows.map((r) => String(r.name)));
    const { rows, columns } = await remote.execute(`SELECT * FROM "${t}"`);
    const cols = columns.filter((c) => localCols.has(c));
    const keep = t === "settings" ? rows.filter((r) => !SKIP_SETTINGS.includes(String(r.key))) : rows;
    const sql = `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
    for (const r of keep) stmts.push({ sql, args: cols.map((c) => r[c] as InValue) });
    tables[t] = keep.length;
  }
  await local.batch(stmts, "write"); // all or nothing
  log(`Copied ${Object.values(tables).reduce((a, b) => a + b, 0)} rows across ${order.length} tables`);

  // 4. Covers this computer doesn't have yet.
  let coversDownloaded = 0;
  if (env.BLOB_READ_WRITE_TOKEN) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    const wanted = (await remote.execute("SELECT cover FROM books WHERE cover IS NOT NULL")).rows.map((r) => String(r.cover));
    const missing = wanted.filter((f) => !fs.existsSync(path.join(COVERS_DIR, f)));
    const queue = [...missing];
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          const res = await get(`covers/${f}`, { access: "private", token: env.BLOB_READ_WRITE_TOKEN }).catch(() => null);
          if (res?.statusCode !== 200) continue;
          fs.writeFileSync(path.join(COVERS_DIR, f), Buffer.from(await new Response(res.stream).arrayBuffer()));
          coversDownloaded++;
        }
      }),
    );
    log(`Downloaded ${coversDownloaded} new covers`);
  }

  const at = Date.now();
  fs.writeFileSync(STAMP, JSON.stringify({ at }));
  return { tables, coversDownloaded, backup, at };
}
