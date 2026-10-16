/**
 * Copies the local library (data/bookbox.db and data/covers) to the hosted setup: the database
 * to Turso and the covers to Cloudflare R2 (or a private Vercel Blob store; see cover-store.ts).
 *
 *   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… \
 *   R2_SECRET_ACCESS_KEY=… R2_BUCKET=… npm run push:cloud
 *
 * The Turso database is replaced with the local one, so run it once, before you start using the
 * hosted app (or again if you want to overwrite it). Covers that are already uploaded are skipped.
 * Either half can be run alone: leave out the Turso or cover variables to skip it. To move covers
 * from Blob to R2, run `npm run pull:cloud` first (so every cover is local), then this with only
 * the R2 variables.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient, type InStatement, type InValue } from "@libsql/client";
import { coverStore } from "../src/lib/cover-store";

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const localFile = path.join(DATA_DIR, "bookbox.db");
if (!fs.existsSync(localFile)) throw new Error(`No local database at ${localFile}`);
const local = createClient({ url: `file:${localFile}` });

if (process.env.TURSO_DATABASE_URL) {
  // Importing the app's database module with TURSO_DATABASE_URL set creates the schema remotely.
  const { db, batch } = await import("../src/lib/db");
  await db.prepare("SELECT 1").get();

  const names = (
    await local.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  ).rows.map((r) => String(r.name));
  // Foreign keys are enforced, so parents (books, people…) go in before the rows that point at them.
  const parents = new Map<string, string[]>();
  for (const t of names) {
    parents.set(t, (await local.execute(`SELECT "table" FROM pragma_foreign_key_list('${t}')`)).rows.map((r) => String(r.table)).filter((p) => p !== t));
  }
  // The hosted copy's own records: its accounts and cover storage usage counts must survive a push.
  const serverOnly = new Set(["storage_usage", "bookbox_meta", "accounts", "login_failures"]);
  const tables: string[] = [];
  const visit = (t: string) => {
    if (tables.includes(t)) return;
    for (const p of parents.get(t) ?? []) if (names.includes(p)) visit(p);
    tables.push(t);
  };
  names.filter((t) => !serverOnly.has(t)).forEach(visit);
  const remoteTables = new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).map((r) => String(r.name)));

  // Children first when clearing, so nothing is left pointing at a deleted row.
  await batch(tables.filter((t) => remoteTables.has(t)).reverse().map((t) => `DELETE FROM "${t}"`));

  for (const table of tables) {
    if (!remoteTables.has(table)) {
      console.log(`skip ${table} (not in the app's schema)`);
      continue;
    }
    const { rows, columns } = await local.execute(`SELECT * FROM "${table}"`);
    const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
    for (let i = 0; i < rows.length; i += 200) {
      const stmts: InStatement[] = rows.slice(i, i + 200).map((r) => ({ sql, args: columns.map((c) => r[c] as InValue) }));
      await batch(stmts);
    }
    console.log(`${table}: ${rows.length} rows`);
  }
}

const store = coverStore(process.env);
if (store) {
  const coversDir = path.join(DATA_DIR, "covers");
  const referenced = (await local.execute("SELECT cover FROM books WHERE cover IS NOT NULL")).rows.map((r) => String(r.cover));
  let uploaded = 0;
  let skipped = 0;
  const queue = [...referenced];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        const file = path.join(coversDir, name);
        if (!fs.existsSync(file)) {
          console.warn(`missing locally: ${name}`);
          continue;
        }
        if (await store.has(name)) {
          skipped++;
          continue;
        }
        await store.put(name, fs.readFileSync(file));
        uploaded++;
      }
    }),
  );
  console.log(`covers (${store.name}): ${uploaded} uploaded, ${skipped} already there`);
}

if (!process.env.TURSO_DATABASE_URL && !store) {
  console.log("Nothing to do: set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN and/or the R2 (or BLOB_READ_WRITE_TOKEN) keys.");
}
